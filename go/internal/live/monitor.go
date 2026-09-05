package live

import (
	"fmt"
	"strings"
	"time"

	"mktorder.com/go/internal/store"
)

var blockingMismatchCodes = map[string]struct{}{
	"monitor_broker_symbol_mismatch":              {},
	"linked_monitor_trade_missing_broker_match":   {},
	"legacy_monitor_trade_ambiguous_broker_match": {},
	"live_broker_position_without_journal":        {},
	"broker_positions_unavailable":                {},
	"journal_unavailable":                         {},
}

func (e *Engine) Consistency() map[string]any {
	return e.consistencyWindow(backgroundWindow())
}

func (e *Engine) consistencyWindow(w execWindow) map[string]any {
	monitor, merr := e.DB.ListTrades("trades")
	broker, berr := e.DB.ListTrades("broker_trades")
	if merr != nil || berr != nil {
		msg := "journal unavailable"
		if merr != nil {
			msg = merr.Error()
		} else {
			msg = berr.Error()
		}
		iss := map[string]any{"code": "journal_unavailable", "message": msg}
		return map[string]any{"issues": []map[string]any{iss}, "ok": false}
	}
	openMonitors := e.hydrateOpenTrades("trades", monitor)
	openBrokers := e.hydrateOpenTrades("broker_trades", broker)
	var openM, openB map[string]any
	if len(openMonitors) > 0 {
		openM = openMonitors[0]
	}
	if len(openBrokers) > 0 {
		openB = openBrokers[0]
	}
	var issues []map[string]any
	var proposed []map[string]any
	usedMon := map[string]bool{}
	usedBro := map[string]bool{}

	for _, m := range openMonitors {
		linked := fmt.Sprint(m["linkedBrokerTradeId"])
		if linked == "" || linked == "<nil>" {
			continue
		}
		if paired := openTradeByID(openBrokers, linked); paired != nil {
			usedMon[fmt.Sprint(m["id"])] = true
			usedBro[fmt.Sprint(paired["id"])] = true
			if store.SafeTicker(fmt.Sprint(m["symbol"])) != store.SafeTicker(fmt.Sprint(paired["symbol"])) {
				issues = append(issues, symbolMismatchIssue(m, paired))
			}
			continue
		}
		usedMon[fmt.Sprint(m["id"])] = true
		moreIssues, moreProposed := e.monitorWithoutOpenBrokerIssues(m, broker)
		issues = append(issues, moreIssues...)
		proposed = append(proposed, moreProposed...)
	}

	for _, m := range openMonitors {
		if usedMon[fmt.Sprint(m["id"])] {
			continue
		}
		want := store.SafeTicker(fmt.Sprint(m["symbol"]))
		for _, b := range openBrokers {
			if usedBro[fmt.Sprint(b["id"])] {
				continue
			}
			if store.SafeTicker(fmt.Sprint(b["symbol"])) == want {
				usedMon[fmt.Sprint(m["id"])] = true
				usedBro[fmt.Sprint(b["id"])] = true
				break
			}
		}
	}

	var leftoverM, leftoverB []map[string]any
	for _, m := range openMonitors {
		if !usedMon[fmt.Sprint(m["id"])] {
			leftoverM = append(leftoverM, m)
		}
	}
	for _, b := range openBrokers {
		if !usedBro[fmt.Sprint(b["id"])] {
			leftoverB = append(leftoverB, b)
		}
	}

	mismatched := map[string]bool{}
	if len(leftoverM) > 0 && len(leftoverB) > 0 {
		for _, m := range leftoverM {
			for _, b := range leftoverB {
				if mismatched[fmt.Sprint(b["id"])] {
					continue
				}
				if store.SafeTicker(fmt.Sprint(m["symbol"])) != store.SafeTicker(fmt.Sprint(b["symbol"])) {
					issues = append(issues, symbolMismatchIssue(m, b))
					mismatched[fmt.Sprint(m["id"])] = true
					mismatched[fmt.Sprint(b["id"])] = true
					break
				}
			}
		}
	}
	for _, m := range leftoverM {
		if mismatched[fmt.Sprint(m["id"])] {
			continue
		}
		moreIssues, moreProposed := e.monitorWithoutOpenBrokerIssues(m, broker)
		issues = append(issues, moreIssues...)
		proposed = append(proposed, moreProposed...)
	}
	for _, b := range leftoverB {
		if mismatched[fmt.Sprint(b["id"])] {
			continue
		}
		iss, act := brokerWithoutMonitorIssue(b)
		issues = append(issues, iss)
		proposed = append(proposed, act)
	}
	issues = append(issues, e.liveConsistencyIssues(broker, w)...)

	if issues == nil {
		issues = []map[string]any{}
	}
	if proposed == nil {
		proposed = []map[string]any{}
	}
	return map[string]any{
		"fetchedAt": time.Now().UTC().Format(time.RFC3339Nano),
		// nilMap keeps an absent trade an untyped nil: a nil map[string]any put
		// into an interface compares non-nil, and readers checking `!= nil` then
		// see an open trade that does not exist.
		"openMonitorTrade":  nilMap(openM),
		"openBrokerTrade":   nilMap(openB),
		"openMonitorTrades": openMonitors,
		"openBrokerTrades":  openBrokers,
		"issues":            issues,
		"proposedActions":   proposed,
	}
}

func nilMap(m map[string]any) any {
	if len(m) == 0 {
		return nil
	}
	return m
}

func sameSymbolClosedBroker(broker []map[string]any, openM map[string]any) []map[string]any {
	want := store.SafeTicker(fmt.Sprint(openM["symbol"]))
	entry := fmt.Sprint(openM["entryDate"])
	var out []map[string]any
	for _, t := range broker {
		if fmt.Sprint(t["status"]) != "closed" {
			continue
		}
		if store.SafeTicker(fmt.Sprint(t["symbol"])) != want {
			continue
		}
		if entry != "" && entry != "<nil>" && fmt.Sprint(t["entryDate"]) != entry {
			continue
		}
		out = append(out, t)
	}
	return out
}

func (e *Engine) hydrateOpenTrades(table string, rows []map[string]any) []map[string]any {
	var out []map[string]any
	for _, t := range store.OpenBrokerTrades(rows) {
		if id := fmt.Sprint(t["id"]); id != "" && id != "<nil>" {
			if full := e.getTrade(table, id); full != nil {
				t = full
			}
		}
		out = append(out, t)
	}
	if out == nil {
		return []map[string]any{}
	}
	return out
}

func openTradeByID(rows []map[string]any, id string) map[string]any {
	for _, t := range rows {
		if fmt.Sprint(t["id"]) == id {
			return t
		}
	}
	return nil
}

func brokerNameOf(t map[string]any) string {
	if t == nil {
		return ""
	}
	got := strings.ToLower(strings.TrimSpace(fmt.Sprint(t["broker"])))
	if got == "" || got == "<nil>" {
		return "webull"
	}
	return got
}

func symbolMismatchIssue(openM, openB map[string]any) map[string]any {
	iss := map[string]any{
		"code": "monitor_broker_symbol_mismatch", "severity": "error",
		"message": fmt.Sprintf("Monitor trade %s is open while broker trade %s is open. Automatic reconcile is unsafe.", openM["symbol"], openB["symbol"]),
		"symbol":  openM["symbol"], "monitorTradeId": openM["id"], "brokerTradeId": openB["id"], "autoFixable": false,
	}
	if name := brokerNameOf(openB); name != "" {
		iss["broker"] = name
	}
	return iss
}

func brokerWithoutMonitorIssue(openB map[string]any) (map[string]any, map[string]any) {
	iss := map[string]any{
		"code": "broker_trade_without_monitor_projection", "severity": "warn",
		"message": fmt.Sprintf("Broker trade %s is open, but monitor state is flat.", openB["symbol"]),
		"symbol":  openB["symbol"], "brokerTradeId": openB["id"], "autoFixable": true,
	}
	if name := brokerNameOf(openB); name != "" {
		iss["broker"] = name
	}
	act := map[string]any{
		"type": "project_monitor_from_broker", "autoApplicable": true,
		"symbol": openB["symbol"], "brokerTradeId": openB["id"],
		"description": fmt.Sprintf("Create monitor projection for open broker trade %s.", openB["symbol"]),
	}
	return iss, act
}

func (e *Engine) monitorWithoutOpenBrokerIssues(openM map[string]any, broker []map[string]any) (issues []map[string]any, proposed []map[string]any) {
	linked := fmt.Sprint(openM["linkedBrokerTradeId"])
	closedLinked := map[string]any(nil)
	if linked != "" && linked != "<nil>" {
		if t := e.getTrade("broker_trades", linked); t != nil && fmt.Sprint(t["status"]) == "closed" {
			closedLinked = t
		}
	}
	if closedLinked != nil {
		issues = append(issues, map[string]any{
			"code": "linked_monitor_trade_closed_in_broker", "severity": "warn",
			"message": fmt.Sprintf("Monitor trade %s is still open while linked broker trade is already closed.", openM["symbol"]),
			"symbol":  openM["symbol"], "monitorTradeId": openM["id"], "brokerTradeId": closedLinked["id"], "autoFixable": true,
		})
		proposed = append(proposed, map[string]any{
			"type": "close_linked_monitor_trade", "autoApplicable": true,
			"symbol": openM["symbol"], "monitorTradeId": openM["id"], "brokerTradeId": closedLinked["id"],
			"description": fmt.Sprintf("Close monitor trade %s using linked broker exit.", openM["symbol"]),
		})
		return issues, proposed
	}
	if linked != "" && linked != "<nil>" {
		issues = append(issues, map[string]any{
			"code": "linked_monitor_trade_missing_broker_match", "severity": "error",
			"message": fmt.Sprintf("Monitor trade %s references broker trade %s, but the broker journal has no matching open/closed trade.", openM["symbol"], linked),
			"symbol":  openM["symbol"], "monitorTradeId": openM["id"], "brokerTradeId": linked, "autoFixable": false,
		})
		return issues, proposed
	}
	sameDayClosed := sameSymbolClosedBroker(broker, openM)
	if len(sameDayClosed) == 1 {
		issues = append(issues, map[string]any{
			"code": "legacy_monitor_trade_can_close_from_broker_history", "severity": "warn",
			"message": fmt.Sprintf("Legacy monitor trade %s is still open even though the matching broker trade is closed.", openM["symbol"]),
			"symbol":  openM["symbol"], "monitorTradeId": openM["id"], "brokerTradeId": sameDayClosed[0]["id"], "autoFixable": true,
		})
		proposed = append(proposed, map[string]any{
			"type": "close_legacy_monitor_trade", "autoApplicable": true,
			"symbol": openM["symbol"], "monitorTradeId": openM["id"], "brokerTradeId": sameDayClosed[0]["id"],
			"description": fmt.Sprintf("Close monitor trade %s using the broker journal's closed trade.", openM["symbol"]),
		})
		return issues, proposed
	}
	if len(sameDayClosed) > 1 {
		issues = append(issues, map[string]any{
			"code": "legacy_monitor_trade_ambiguous_broker_match", "severity": "error",
			"message": fmt.Sprintf("Monitor trade %s has multiple matching closed broker trades for %s. Automatic reconcile is unsafe.", openM["symbol"], openM["entryDate"]),
			"symbol":  openM["symbol"], "monitorTradeId": openM["id"], "autoFixable": false,
		})
		return issues, proposed
	}
	issues = append(issues, map[string]any{
		"code": "monitor_trade_without_broker_position", "severity": "warn",
		"message": fmt.Sprintf("Monitor trade %s is open while broker is flat. Monitor state remains active independently from broker execution.", openM["symbol"]),
		"symbol":  openM["symbol"], "monitorTradeId": openM["id"], "autoFixable": false,
	})
	return issues, proposed
}

func (e *Engine) liveConsistencyIssues(brokerRows []map[string]any, w execWindow) []map[string]any {
	var issues []map[string]any
	for _, nb := range e.brokerSnapshot() {
		held, heldErr := e.heldSymbolsOn(nb.br, w)
		if heldErr != nil {
			issues = append(issues, map[string]any{
				"code": "broker_positions_unavailable", "severity": "error",
				"message": "Live broker positions could not be read; new entries are blocked.",
				"broker":  nb.name, "autoFixable": false,
			})
			continue
		}
		if len(held) > 0 && store.OpenBrokerTradeFor(brokerRows, nb.name) == nil {
			var sym string
			for s := range held {
				sym = s
				break
			}
			issues = append(issues, map[string]any{
				"code": "live_broker_position_without_journal", "severity": "error",
				"message": fmt.Sprintf("Broker holds %s but the local journal is flat.", sym),
				"symbol":  sym, "broker": nb.name, "autoFixable": false,
			})
		}
	}
	return issues
}

func BlockingMismatch(snap map[string]any) map[string]any {
	if snap == nil {
		return nil
	}
	raw, ok := snap["issues"]
	if !ok {
		return nil
	}
	switch issues := raw.(type) {
	case []map[string]any:
		for _, iss := range issues {
			if _, hit := blockingMismatchCodes[fmt.Sprint(iss["code"])]; hit {
				return iss
			}
		}
	case []any:
		for _, row := range issues {
			iss, _ := row.(map[string]any)
			if iss == nil {
				continue
			}
			if _, hit := blockingMismatchCodes[fmt.Sprint(iss["code"])]; hit {
				return iss
			}
		}
	}
	return nil
}

func (e *Engine) Reconcile(apply bool) map[string]any {
	snap := e.Consistency()
	var appliedActions []map[string]any
	var failedActions []map[string]any
	if apply {
		raw, _ := snap["proposedActions"].([]map[string]any)
		for _, action := range raw {
			if !asBool(action["autoApplicable"]) {
				continue
			}
			row := copyStringAnyMap(action)
			row["appliedAt"] = time.Now().UTC().Format(time.RFC3339Nano)
			if e.applyConsistencyAction(action) {
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
				"type": "sync_watch_open_flags", "appliedAt": time.Now().UTC().Format(time.RFC3339Nano),
			})
		}
	}
	if appliedActions == nil {
		appliedActions = []map[string]any{}
	}
	after := e.Consistency()
	after["positions"] = snap["positions"]
	if failedActions == nil {
		failedActions = []map[string]any{}
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

func (e *Engine) applyConsistencyAction(action map[string]any) bool {
	typ := fmt.Sprint(action["type"])
	switch typ {
	case "close_linked_monitor_trade", "close_legacy_monitor_trade":
		brokerID := fmt.Sprint(action["brokerTradeId"])
		monID := fmt.Sprint(action["monitorTradeId"])
		broker := e.getTrade("broker_trades", brokerID)
		mon := e.DB.GetTrade("trades", monID)
		if broker == nil || mon == nil {
			return false
		}
		if store.SafeTicker(fmt.Sprint(mon["symbol"])) != store.SafeTicker(fmt.Sprint(broker["symbol"])) {
			return false
		}
		exitPrice := asFloat(broker["exitPrice"])
		exitDate := fmt.Sprint(broker["exitDate"])
		if !(exitPrice > 0) {
			return false
		}
		e.closeTradeWithPnL("trades", monID, exitPrice, exitDate, broker["exitIBS"], "reconciled_from_broker_history")
		return true
	case "project_monitor_from_broker":
		brokerID := fmt.Sprint(action["brokerTradeId"])
		broker := e.getTrade("broker_trades", brokerID)
		if broker == nil || fmt.Sprint(broker["status"]) != "open" {
			return false
		}
		monID := "m-" + brokerID
		if e.DB.GetTrade("trades", monID) != nil {
			return false
		}
		if err := e.DB.InsertTrade("trades", map[string]any{
			"id": monID, "symbol": broker["symbol"], "status": "open",
			"entryDate": broker["entryDate"], "entryPrice": broker["entryPrice"],
			"source": broker["source"], "quantity": broker["quantity"],
		}); err != nil {
			return false
		}
		if err := e.DB.LinkMonitorToBrokerTrade(monID, brokerID); err != nil {
			return false
		}
		return e.DB.GetTrade("trades", monID) != nil
	}
	return false
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
