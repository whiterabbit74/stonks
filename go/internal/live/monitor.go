package live

import (
	"fmt"
	"time"

	"mktorder.com/go/internal/store"
)

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

// liveConsistencyIssues checks the brokers' books against the monitoring's
// positions: a book that cannot be read, a leg missing from a position the
// broker does hold. What the monitoring does not hold is no finding at all.
// Books are read in parallel and the findings ordered by the broker
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
				// A ticker the monitoring does not hold — bought by hand, left
				// over, another strategy's — is not the monitoring's business and
				// not a discrepancy: autotrade clears it on the monitoring's next
				// exit, and T-11 lists it as plain information (CORE §3).
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
	// ok is the state after reconciling, not only "no repair failed": an
	// unreadable journal or an issue nothing here repairs is still not ok
	// (AUD-183).
	after["ok"] = after["ok"] == true && len(failedActions) == 0
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
	// Read, decide and write in one transaction: a fill landing mid-edit would
	// otherwise be overwritten by the copy read before it (AUD-112).
	filled := false
	p, err := e.DB.PatchPosition(positionID, func(p *store.Position) error {
		if p.Status != "open" {
			return store.ErrNoPatch
		}
		leg := p.Leg(broker)
		if leg.Executed() {
			return store.ErrNoPatch
		}
		leg.Qty = qty
		p.SetLeg(broker, leg)
		p.Quantity = p.ExecutedQty()
		filled = true
		return nil
	})
	if err != nil {
		e.logAuto("journal_update_failed", "", map[string]any{
			"op": "fill_missing_leg", "broker": broker, "id": positionID, "error": err.Error(),
		})
		return false
	}
	if p == nil || !filled {
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
