package live

import (
	"fmt"
	"strings"
	"time"

	"mktorder.com/go/internal/store"
)

// blockingMismatchCodes are the findings that hold back new entries.
//
// The list used to be seven codes long, and four of them were about the two
// journals disagreeing with each other: a monitor row whose linked broker row
// was gone, a legacy row that matched several, a symbol mismatch between the
// pair. None of them can exist now — there is one row per position — and the
// reconciliation that produced them is gone with them.
//
// What remains is about the world outside the database: a broker book we could
// not read, and a journal we could not read. Both mean we do not know what we
// hold, and buying on that is how a position gets opened twice.
var blockingMismatchCodes = map[string]struct{}{
	"broker_positions_unavailable": {},
	"journal_unavailable":          {},
}

func (e *Engine) Consistency() map[string]any {
	return e.consistencyWindow(backgroundWindow())
}

// consistencyWindow compares the journal against the brokers' live books. It
// no longer compares the journal against itself.
func (e *Engine) consistencyWindow(w execWindow) map[string]any {
	open, err := e.DB.OpenPositions()
	if err != nil {
		return map[string]any{
			"fetchedAt": e.now().UTC().Format(time.RFC3339Nano),
			"issues": []map[string]any{{
				"code": "journal_unavailable", "severity": "error", "message": err.Error(),
			}},
			"openPositions": []store.Position{},
			"ok":            false,
		}
	}
	issues := e.liveConsistencyIssues(open, w)
	if issues == nil {
		issues = []map[string]any{}
	}
	return map[string]any{
		"fetchedAt":     e.now().UTC().Format(time.RFC3339Nano),
		"openPositions": open,
		"issues":        issues,
		"ok":            len(issues) == 0,
	}
}

// liveConsistencyIssues reports what the brokers hold that the journal does not
// explain. Books are read in parallel and the findings ordered by the broker
// snapshot: a Webull failure must not delay the Robinhood check, but the report
// has to be deterministic (AUD-074).
func (e *Engine) liveConsistencyIssues(open []store.Position, w execWindow) []map[string]any {
	snaps := e.brokerSnapshot()
	books := e.heldSymbolsByBrokerBooks(w)
	openBySymbol := map[string]store.Position{}
	for _, p := range open {
		openBySymbol[p.Symbol] = p
	}
	var issues []map[string]any
	for _, nb := range snaps {
		bk, ok := books[nb.name]
		if !ok {
			continue
		}
		if bk.err != nil {
			issues = append(issues, map[string]any{
				"code": "broker_positions_unavailable", "severity": "error",
				"message": "Позиции брокера не читаются, новые входы заблокированы.",
				"broker":  nb.name, "autoFixable": false,
			})
			continue
		}
		for _, sym := range sortedKeys(bk.held) {
			p, journaled := openBySymbol[sym]
			if !journaled {
				// A ticker held with no open position of its own: bought by
				// hand, or a fill whose journal write failed. It does not block
				// anything — the engine exits a held position on its signal
				// whether or not the journal knows about it — so this is a note
				// to the operator, not a stop.
				issues = append(issues, map[string]any{
					"code": "broker_position_without_journal", "severity": "warning",
					"message": fmt.Sprintf("%s держит %s, в журнале такой позиции нет.", brokerLabel(nb.name), sym),
					"symbol":  sym, "broker": nb.name, "autoFixable": false,
				})
				continue
			}
			// The position is journaled but this broker's leg is empty: the
			// entry fill never made it into the row. Reconcile can fill it in
			// from the book we are already holding.
			if !p.Leg(nb.name).Executed() {
				issues = append(issues, map[string]any{
					"code": "position_leg_missing", "severity": "warning",
					"message": fmt.Sprintf("%s держит %s, но в позиции нет его исполнения.", brokerLabel(nb.name), sym),
					"symbol":  sym, "broker": nb.name, "positionId": p.ID,
					"quantity": bk.held[sym], "autoFixable": true,
				})
			}
		}
	}
	return issues
}

func sortedKeys(m map[string]float64) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j] < out[j-1]; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

func BlockingMismatch(snap map[string]any) map[string]any {
	return BlockingMismatchFor(snap, "")
}

// BlockingMismatchFor returns the first blocking issue that applies to the
// named broker: one that names it, or one that names no broker at all. An empty
// broker matches every issue, which is what the unscoped BlockingMismatch
// reports.
func BlockingMismatchFor(snap map[string]any, broker string) map[string]any {
	if snap == nil {
		return nil
	}
	applies := func(iss map[string]any) bool {
		if broker == "" {
			return true
		}
		name := strings.ToLower(strings.TrimSpace(fmt.Sprint(iss["broker"])))
		return name == "" || name == "<nil>" || name == strings.ToLower(broker)
	}
	raw, ok := snap["issues"]
	if !ok {
		return nil
	}
	switch issues := raw.(type) {
	case []map[string]any:
		for _, iss := range issues {
			if _, hit := blockingMismatchCodes[fmt.Sprint(iss["code"])]; hit && applies(iss) {
				return iss
			}
		}
	case []any:
		for _, row := range issues {
			iss, _ := row.(map[string]any)
			if iss == nil {
				continue
			}
			if _, hit := blockingMismatchCodes[fmt.Sprint(iss["code"])]; hit && applies(iss) {
				return iss
			}
		}
	}
	return nil
}

// entryBlockedBrokers maps each attached broker to whether a blocking issue
// holds back its new entries. Exits are never gated by this — an open position
// is closed on its exit signal regardless.
func (e *Engine) entryBlockedBrokers(snap map[string]any) map[string]string {
	out := map[string]string{}
	for _, nb := range e.brokerSnapshot() {
		if iss := BlockingMismatchFor(snap, nb.name); iss != nil {
			out[nb.name] = fmt.Sprint(iss["code"])
		}
	}
	return out
}

// clearedByFlatExit lists the block codes a broker's own confirmed exit
// resolves: once this cycle's exit settled that broker flat, an unreadable book
// from earlier in the same cycle no longer describes anything.
var clearedByFlatExit = map[string]struct{}{
	"broker_positions_unavailable": {},
}

// Reconcile repairs what it can and reports what it cannot.
//
// The only repair left is filling in a broker leg the journal is missing for a
// position that broker demonstrably holds. Everything the old reconciler did —
// closing a monitor row from a broker row's exit, projecting a monitor row out
// of a broker row — was moving data between the two journals, and there is one
// journal now.
func (e *Engine) Reconcile(apply bool) map[string]any {
	snap := e.Consistency()
	appliedActions := []map[string]any{}
	failedActions := []map[string]any{}
	if apply {
		issues, _ := snap["issues"].([]map[string]any)
		for _, iss := range issues {
			if fmt.Sprint(iss["code"]) != "position_leg_missing" {
				continue
			}
			row := copyStringAnyMap(iss)
			row["appliedAt"] = e.now().UTC().Format(time.RFC3339Nano)
			if e.fillMissingLeg(fmt.Sprint(iss["positionId"]), fmt.Sprint(iss["broker"]), asFloat(iss["quantity"])) {
				row["result"] = "applied"
				appliedActions = append(appliedActions, row)
			} else {
				row["result"] = "failed"
				failedActions = append(failedActions, row)
			}
		}
		pos := e.UpdatePositions()
		snap["positions"] = pos
		if n := asFloat(pos["updated"]); n > 0 {
			appliedActions = append(appliedActions, map[string]any{
				"type": "sync_watch_open_flags", "appliedAt": e.now().UTC().Format(time.RFC3339Nano),
			})
		}
	}
	after := snap
	if apply {
		after = e.Consistency()
		after["positions"] = snap["positions"]
	}
	after["appliedActions"] = appliedActions
	after["failedActions"] = failedActions
	after["applied"] = len(appliedActions) > 0
	after["ok"] = len(failedActions) == 0
	after["mode"] = "preview"
	if apply {
		after["mode"] = "apply"
	}
	after["preview"] = !apply
	return after
}

// fillMissingLeg records what a broker demonstrably holds against a position
// that does not mention it. The quantity comes from the broker's own book; the
// price is left unknown rather than guessed, because nobody observed a fill.
func (e *Engine) fillMissingLeg(positionID, broker string, qty float64) bool {
	if positionID == "" || !(qty > 0) {
		return false
	}
	p, err := e.DB.GetPosition(positionID)
	if err != nil || p == nil || p.Status != "open" {
		return false
	}
	leg := p.Leg(broker)
	if leg.Executed() {
		return false
	}
	leg.Qty = qty
	p.SetLeg(broker, leg)
	p.Quantity = p.ExecutedQty()
	if err := e.DB.SavePosition(*p); err != nil {
		e.logAuto("journal_update_failed", "", map[string]any{
			"op": "fill_missing_leg", "broker": broker, "id": positionID, "error": err.Error(),
		})
		return false
	}
	e.logAuto("position_leg_filled_from_broker", "", map[string]any{
		"id": positionID, "broker": broker, "symbol": p.Symbol, "quantity": qty,
	})
	return true
}

// FetchCalendar returns the Webull calendar payload and does not persist it.
func (e *Engine) FetchCalendar() (map[string]any, error) {
	x := e.webullExtras()
	if x == nil {
		return nil, fmt.Errorf("webull sync requires credentials")
	}
	raw, err := x.Calendar()
	if err != nil {
		return nil, err
	}
	return map[string]any{"ok": true, "saved": false, "bytes": len(raw)}, nil
}

func (e *Engine) WebullRawSplits(symbol string) (map[string]any, error) {
	x := e.webullExtras()
	if x == nil {
		return map[string]any{"splits": []any{}}, nil
	}
	evs, err := x.RawSplits(symbol)
	if err != nil {
		return nil, err
	}
	if evs == nil {
		evs = []map[string]any{}
	}
	return map[string]any{"splits": evs}, nil
}
