package live

import (
	"fmt"
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
	openM := store.OpenBrokerTrade(monitor)
	openB := store.OpenBrokerTrade(broker)
	if openM != nil {
		if full := e.DB.GetTrade("trades", fmt.Sprint(openM["id"])); full != nil {
			openM = full
		}
	}
	if openB != nil {
		if full := e.getTrade("broker_trades", fmt.Sprint(openB["id"])); full != nil {
			openB = full
		}
	}
	var issues []map[string]any
	var proposed []map[string]any

	if openM != nil && openB == nil {
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
		} else if linked != "" && linked != "<nil>" {
			issues = append(issues, map[string]any{
				"code": "linked_monitor_trade_missing_broker_match", "severity": "error",
				"message": fmt.Sprintf("Monitor trade %s references broker trade %s, but the broker journal has no matching open/closed trade.", openM["symbol"], linked),
				"symbol":  openM["symbol"], "monitorTradeId": openM["id"], "brokerTradeId": linked, "autoFixable": false,
			})
		} else {
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
			} else if len(sameDayClosed) > 1 {
				issues = append(issues, map[string]any{
					"code": "legacy_monitor_trade_ambiguous_broker_match", "severity": "error",
					"message": fmt.Sprintf("Monitor trade %s has multiple matching closed broker trades for %s. Automatic reconcile is unsafe.", openM["symbol"], openM["entryDate"]),
					"symbol":  openM["symbol"], "monitorTradeId": openM["id"], "autoFixable": false,
				})
			} else {
				issues = append(issues, map[string]any{
					"code": "monitor_trade_without_broker_position", "severity": "warn",
					"message": fmt.Sprintf("Monitor trade %s is open while broker is flat. Monitor state remains active independently from broker execution.", openM["symbol"]),
					"symbol":  openM["symbol"], "monitorTradeId": openM["id"], "autoFixable": false,
				})
			}
		}
	}
	if openM == nil && openB != nil {
		issues = append(issues, map[string]any{
			"code": "broker_trade_without_monitor_projection", "severity": "warn",
			"message": fmt.Sprintf("Broker trade %s is open, but monitor state is flat.", openB["symbol"]),
			"symbol":  openB["symbol"], "brokerTradeId": openB["id"], "autoFixable": true,
		})
		proposed = append(proposed, map[string]any{
			"type": "project_monitor_from_broker", "autoApplicable": true,
			"symbol": openB["symbol"], "brokerTradeId": openB["id"],
			"description": fmt.Sprintf("Create monitor projection for open broker trade %s.", openB["symbol"]),
		})
	}
	if openM != nil && openB != nil && store.SafeTicker(fmt.Sprint(openM["symbol"])) != store.SafeTicker(fmt.Sprint(openB["symbol"])) {
		issues = append(issues, map[string]any{
			"code": "monitor_broker_symbol_mismatch", "severity": "error",
			"message": fmt.Sprintf("Monitor trade %s is open while broker trade %s is open. Automatic reconcile is unsafe.", openM["symbol"], openB["symbol"]),
			"symbol":  openM["symbol"], "monitorTradeId": openM["id"], "brokerTradeId": openB["id"], "autoFixable": false,
		})
	}
	held, heldErr := e.liveHeldSymbols()
	if heldErr != nil {
		issues = append(issues, map[string]any{
			"code": "broker_positions_unavailable", "severity": "error",
			"message": "Live broker positions could not be read; new entries are blocked.",
			"autoFixable": false,
		})
	} else if len(held) > 0 && openB == nil {
		var sym string
		for s := range held {
			sym = s
			break
		}
		issues = append(issues, map[string]any{
			"code": "live_broker_position_without_journal", "severity": "error",
			"message": fmt.Sprintf("Broker holds %s but the local journal is flat.", sym),
			"symbol":  sym, "autoFixable": false,
		})
	}
	if issues == nil {
		issues = []map[string]any{}
	}
	if proposed == nil {
		proposed = []map[string]any{}
	}
	return map[string]any{
		"fetchedAt":        time.Now().UTC().Format(time.RFC3339Nano),
		"openMonitorTrade": openM,
		"openBrokerTrade":  openB,
		"issues":           issues,
		"proposedActions":  proposed,
	}
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
	if apply {
		raw, _ := snap["proposedActions"].([]map[string]any)
		for _, action := range raw {
			if !asBool(action["autoApplicable"]) {
				continue
			}
			if e.applyConsistencyAction(action) {
				row := copyStringAnyMap(action)
				row["appliedAt"] = time.Now().UTC().Format(time.RFC3339Nano)
				appliedActions = append(appliedActions, row)
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
	after["appliedActions"] = appliedActions
	after["applied"] = len(appliedActions) > 0
	after["ok"] = true
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
		_ = e.DB.InsertTrade("trades", map[string]any{
			"id": monID, "symbol": broker["symbol"], "status": "open",
			"entryDate": broker["entryDate"], "entryPrice": broker["entryPrice"],
			"source": broker["source"], "quantity": broker["quantity"],
		})
		_, _ = e.DB.SQL.Exec(`UPDATE trades SET linked_broker_trade_id=? WHERE id=?`, brokerID, monID)
		return true
	}
	return false
}

func (e *Engine) SyncCalendar() (map[string]any, error) {
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
