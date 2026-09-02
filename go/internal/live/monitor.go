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
}

func (e *Engine) Consistency() map[string]any {
	monitor, _ := e.DB.ListTrades("trades")
	broker, _ := e.DB.ListTrades("broker_trades")
	openM := store.OpenBrokerTrade(monitor)
	openB := store.OpenBrokerTrade(broker)
	var issues []map[string]any
	if openM != nil && openB == nil {
		issues = append(issues, map[string]any{
			"code": "monitor_trade_without_broker_position", "severity": "warn",
			"message": fmt.Sprintf("Monitor trade %s is open while broker is flat. Monitor state remains active independently from broker execution.", openM["symbol"]),
			"symbol":  openM["symbol"], "monitorTradeId": openM["id"], "autoFixable": false,
		})
	}
	if openM == nil && openB != nil {
		issues = append(issues, map[string]any{
			"code": "broker_trade_without_monitor_projection", "severity": "warn",
			"message": fmt.Sprintf("Broker trade %s is open, but monitor state is flat.", openB["symbol"]),
			"symbol":  openB["symbol"], "brokerTradeId": openB["id"], "autoFixable": false,
		})
	}
	if openM != nil && openB != nil && store.SafeTicker(fmt.Sprint(openM["symbol"])) != store.SafeTicker(fmt.Sprint(openB["symbol"])) {
		issues = append(issues, map[string]any{
			"code": "monitor_broker_symbol_mismatch", "severity": "error",
			"message": fmt.Sprintf("Monitor trade %s is open while broker trade %s is open. Automatic reconcile is unsafe.", openM["symbol"], openB["symbol"]),
			"symbol":  openM["symbol"], "monitorTradeId": openM["id"], "brokerTradeId": openB["id"], "autoFixable": false,
		})
	}
	if issues == nil {
		issues = []map[string]any{}
	}
	return map[string]any{
		"fetchedAt":        time.Now().UTC().Format(time.RFC3339Nano),
		"openMonitorTrade": openM,
		"openBrokerTrade":  openB,
		"issues":           issues,
		"proposedActions":  []any{},
	}
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
	applied := false
	if apply {
		pos := e.UpdatePositions()
		snap["positions"] = pos
		applied = true
	}
	snap["applied"] = applied
	snap["ok"] = true
	return snap
}

func (e *Engine) SyncCalendar() (map[string]any, error) {
	if e.Broker == nil {
		return nil, fmt.Errorf("webull sync requires credentials")
	}
	raw, err := e.Broker.Calendar()
	if err != nil {
		return nil, err
	}
	if len(raw) > 0 {
		_ = e.DB.SaveCalendar(raw)
	}
	return map[string]any{"ok": true, "saved": len(raw) > 0}, nil
}

func (e *Engine) WebullRawSplits(symbol string) (map[string]any, error) {
	if e.Broker == nil {
		return map[string]any{"splits": []any{}}, nil
	}
	evs, err := e.Broker.RawSplits(symbol)
	if err != nil {
		return nil, err
	}
	if evs == nil {
		evs = []map[string]any{}
	}
	return map[string]any{"splits": evs}, nil
}
