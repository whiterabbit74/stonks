package live

import (
	"fmt"
	"time"

	"mktorder.com/go/internal/store"
)

func (e *Engine) Consistency() map[string]any {
	monitor, _ := e.DB.ListTrades("trades")
	broker, _ := e.DB.ListTrades("broker_trades")
	openM := store.OpenBrokerTrade(monitor)
	openB := store.OpenBrokerTrade(broker)
	var issues []map[string]any
	if openM != nil && openB == nil {
		issues = append(issues, map[string]any{
			"code": "monitor_open_without_broker", "severity": "warn",
			"message": "Open monitor trade has no open broker trade",
			"symbol":  openM["symbol"], "monitorTradeId": openM["id"], "autoFixable": true,
		})
	}
	if openM == nil && openB != nil {
		issues = append(issues, map[string]any{
			"code": "broker_open_without_monitor", "severity": "warn",
			"message": "Open broker trade has no open monitor trade",
			"symbol":  openB["symbol"], "brokerTradeId": openB["id"], "autoFixable": true,
		})
	}
	if openM != nil && openB != nil && store.SafeTicker(fmt.Sprint(openM["symbol"])) != store.SafeTicker(fmt.Sprint(openB["symbol"])) {
		issues = append(issues, map[string]any{
			"code": "symbol_mismatch", "severity": "error",
			"message": "Monitor and broker open trades are different symbols",
			"symbol":  openM["symbol"], "autoFixable": false,
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
