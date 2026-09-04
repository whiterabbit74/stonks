package live

import (
	"fmt"
	"strings"

	"mktorder.com/go/internal/store"
)

func (e *Engine) storedHealthStatus(name string) string {
	if e == nil || e.DB == nil {
		return ""
	}
	if name == "robinhood" {
		return strings.ToUpper(strings.TrimSpace(e.DB.GetRobinhoodOAuth().LastCheckStatus))
	}
	return strings.ToUpper(strings.TrimSpace(e.DB.GetWebullToken().LastCheckStatus))
}

func (e *Engine) executeAll(ev EvalResult, trigger, corr string, snaps []namedBroker) EvalResult {
	action, _ := ev.Decision["action"].(string)
	results := map[string]any{}
	anyOK := false
	for _, nb := range snaps {
		name, br := nb.name, nb.br
		if br == nil {
			continue
		}
		enabled, allowE, allowX := brokerFlags(ev.AutoTrading, name)
		if !enabled {
			continue
		}
		if action == "entry" && !allowE {
			e.logAuto("execution_skipped", corr, map[string]any{"broker": name, "reason": "allowNewEntries_false"})
			continue
		}
		if action == "exit" && !allowX {
			e.logAuto("execution_skipped", corr, map[string]any{"broker": name, "reason": "allowExits_false"})
			continue
		}
		st := e.storedHealthStatus(name)
		if st == HealthNeedsReauth || st == HealthMissing {
			e.logAuto("execution_skipped", corr, map[string]any{"broker": name, "reason": st})
			continue
		}
		one := e.submitEvaluated(ev, trigger, corr, name, br)
		results[name] = one.Broker
		if one.Executed {
			anyOK = true
		}
	}
	ev.Broker = results
	ev.Executed = anyOK
	e.mu.Lock()
	e.lastResult = ev
	e.mu.Unlock()
	return ev
}

func (e *Engine) submitEvaluated(ev EvalResult, trigger, corr, brokerName string, br Broker) EvalResult {
	action, _ := ev.Decision["action"].(string)
	symbol := store.SafeTicker(fmt.Sprint(ev.Decision["symbol"]))
	key := action
	if action != "entry" {
		key = symbol + ":" + action
	}
	if brokerName != "" {
		key = brokerName + ":" + key
	}
	if action == "entry" {
		var pending map[string]any
		if brokerName != "" {
			pending = e.DB.AnyPendingTrackerFor(brokerName)
		} else {
			pending = e.DB.AnyPendingTracker()
		}
		if pending != nil {
			ev.Broker = map[string]any{"submitted": false, "error": "pending_tracker_exists", "clientOrderId": pending["clientOrderId"]}
			e.logAuto("order_guarded", corr, map[string]any{"symbol": symbol, "action": action, "reason": "pending_tracker", "broker": brokerName})
			return ev
		}
	} else {
		var pending map[string]any
		if brokerName != "" {
			pending = e.DB.FindPendingTrackerBroker(symbol, action, brokerName)
		} else {
			pending = e.DB.FindPendingTracker(symbol, action)
		}
		if pending != nil {
			ev.Broker = map[string]any{"submitted": false, "error": "pending_" + action + "_tracker_exists", "clientOrderId": pending["clientOrderId"]}
			e.logAuto("order_guarded", corr, map[string]any{"symbol": symbol, "action": action, "reason": "pending_tracker", "broker": brokerName})
			return ev
		}
	}
	e.mu.Lock()
	if e.reservations == nil {
		e.reservations = map[string]string{}
	}
	if _, taken := e.reservations[key]; taken {
		e.mu.Unlock()
		ev.Broker = map[string]any{"submitted": false, "error": "pending_" + action + "_submission_exists"}
		e.logAuto("order_guarded", corr, map[string]any{"symbol": symbol, "action": action, "reason": "pending_submission"})
		return ev
	}
	e.reservations[key] = "submitting"
	e.mu.Unlock()
	defer func() {
		e.mu.Lock()
		delete(e.reservations, key)
		e.mu.Unlock()
	}()

	enabled, _ := ev.AutoTrading["enabled"].(bool)
	if !enabled {
		ev.Broker = map[string]any{"submitted": false, "simulated": false, "error": "Autotrading is disabled", "mode": "off"}
		e.logAuto("execution_skipped", corr, map[string]any{"symbol": symbol, "reason": "autotrading_disabled"})
		return ev
	}
	if br == nil {
		ev.Broker = map[string]any{"submitted": false, "error": "Webull credentials are missing", "mode": "off"}
		e.logAuto("execution_blocked", corr, map[string]any{"symbol": symbol, "reason": "missing_webull_credentials"})
		return ev
	}
	if executionWindowApplies(trigger) && e.outsideExecutionWindow(ev.AutoTrading) {
		ev.Broker = map[string]any{"submitted": false, "error": "outside_execution_window"}
		e.logAuto("execution_skipped", corr, map[string]any{"symbol": symbol, "reason": "outside_execution_window", "trigger": trigger})
		return ev
	}
	price := quotePrice(ev, symbol)
	qty, qerr := e.sizeOrder(action, symbol, ev.AutoTrading, price, br)
	if qerr != nil {
		ev.Broker = map[string]any{"submitted": false, "error": qerr.Error()}
		e.logAuto("execution_blocked", corr, map[string]any{"symbol": symbol, "reason": qerr.Error()})
		return ev
	}
	e.logBalanceSnapshot(corr, symbol, action)
	side := "BUY"
	if action == "exit" {
		side = "SELL"
	}
	if action == "entry" {
		if cancelled := e.cancelOpenOrdersBeforeEntry(symbol, br); len(cancelled) > 0 {
			e.logAuto("open_orders_cancelled", corr, map[string]any{"symbol": symbol, "cancelled_count": len(cancelled)})
		}
	}
	res, err := e.placeMarket(symbol, side, qty, PlaceMarketCfg{}, br)
	if err != nil {
		res.Error = err.Error()
		res.Submitted = false
	}
	ev.Broker = res
	ev.Executed = res.Submitted
	if res.Submitted {
		ibsVal := 0.0
		if cand, ok := ev.Decision["candidate"].(map[string]any); ok {
			ibsVal = asFloat(cand["ibs"])
		}
		e.startTracking(res, orderMeta{
			CorrelationID: corr, IBS: ibsVal, DateKey: ev.TodayKey,
			QuotePrice: price, Action: action, Symbol: symbol, Quantity: qty, Source: trigger, Broker: brokerName,
		})
		e.logAuto("order_submit_ok", corr, map[string]any{
			"symbol": symbol, "action": action, "side": side, "quantity": qty,
			"clientOrderId": res.ClientOrderID, "order_type": "MARKET", "broker": brokerName,
		})
	} else if res.Ambiguous {
		e.startTracking(OrderResult{Submitted: true, ClientOrderID: res.ClientOrderID}, orderMeta{
			CorrelationID: corr, DateKey: ev.TodayKey, QuotePrice: price,
			Action: action, Symbol: symbol, Quantity: qty, Source: trigger, Broker: brokerName,
		})
		e.logAuto("order_submit_unknown", corr, map[string]any{
			"symbol": symbol, "action": action, "clientOrderId": res.ClientOrderID, "error": res.Error, "broker": brokerName,
		})
		label := "Webull"
		if brokerName == "robinhood" {
			label = "Robinhood"
		}
		_ = e.Send(e.chat(), fmt.Sprintf(
			"<b>%s: статус отправки неизвестен</b>\n%s • %s • %v шт.\nclientOrderId: %s\nОшибка: %s\nПовтор не отправлен — проверьте заявки у брокера.",
			label, symbol, side, qty, res.ClientOrderID, res.Error))
	} else {
		e.logAuto("order_submit_failed", corr, map[string]any{
			"symbol": symbol, "action": action, "error": res.Error, "broker": brokerName,
		})
	}
	e.mu.Lock()
	e.lastResult = ev
	e.mu.Unlock()
	return ev
}
