package live

import (
	"errors"
	"fmt"
	"html"
	"sort"
	"strings"
	"sync"

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

func (e *Engine) executeAll(w execWindow, ev EvalResult, trigger, corr string, snaps []namedBroker) EvalResult {
	if len(snaps) == 0 {
		ev.Decision = map[string]any{"action": "none", "reason": "no_broker_configured", "symbol": nil, "candidate": nil}
		ev.Executed = false
		ev.Submitted = false
		ev.Phase = "decision"
		e.logAuto("execution_skipped", corr, map[string]any{"reason": "no_broker_configured"})
		e.mu.Lock()
		e.lastResult = ev
		e.mu.Unlock()
		return ev
	}
	results := map[string]any{}
	decisions := map[string]map[string]any{}
	anyOK := false
	rows, journalErr := e.DB.ListTrades("broker_trades")
	// Брокеры идут параллельно, а не по очереди: последовательный цикл отдавал
	// Robinhood остаток закрывающей минуты только после того, как Webull
	// доработает свои таймауты и повторы. Общее здесь — эти три переменные под
	// out и БД, которая сериализует записи сама (AUD-074).
	var out sync.Mutex
	var wg sync.WaitGroup
	for _, nb := range snaps {
		if nb.br == nil {
			continue
		}
		wg.Add(1)
		go func(name string, br Broker) {
			defer wg.Done()
			defer func() {
				if rec := recover(); rec != nil {
					// Паника одного брокера не должна забирать с собой второго.
					e.logAuto("broker_execution_panic", corr, map[string]any{"broker": name, "error": fmt.Sprint(rec)})
				}
			}()
			decision, brokerRes, executed := e.executeOneBroker(w, ev, trigger, corr, name, br, rows, journalErr)
			out.Lock()
			defer out.Unlock()
			if decision != nil {
				decisions[name] = decision
			}
			if brokerRes != nil {
				results[name] = brokerRes
			}
			if executed {
				anyOK = true
			}
		}(nb.name, nb.br)
	}
	wg.Wait()
	// Always name-keyed so a single-broker submit (Robinhood-only T-1) is not
	// mistaken for Webull when execOutcomes sees a bare OrderResult.
	ev.Broker = results
	ev.BrokerDecisions = decisions
	ev.Executed = anyOK
	ev.Submitted = anyOK
	if anyOK {
		ev.Phase = "submitted"
	} else {
		ev.Phase = "decision"
	}
	e.mu.Lock()
	e.lastResult = ev
	e.mu.Unlock()
	return ev
}

// executeOneBroker decides and, where the decision stands, submits for exactly
// one broker. It touches nothing another broker's goroutine touches: its books,
// its journal rows, its flags, its order. The returned decision is what the
// report shows for this broker; brokerRes is the submission outcome, nil when
// nothing was sent.
func (e *Engine) executeOneBroker(w execWindow, ev EvalResult, trigger, corr, name string, br Broker, rows []map[string]any, journalErr error) (decision map[string]any, brokerRes any, executed bool) {
	none := func(reason string, symbol any) map[string]any {
		return map[string]any{"action": "none", "reason": reason, "symbol": symbol, "candidate": nil}
	}
	enabled, allowE, allowX := brokerFlags(ev.AutoTrading, name)
	if !enabled {
		e.logAuto("execution_skipped", corr, map[string]any{"broker": name, "reason": "broker_disabled"})
		return none("broker_disabled", nil), nil, false
	}
	if st := e.storedHealthStatus(name); st == HealthNeedsReauth || st == HealthMissing {
		e.logAuto("execution_skipped", corr, map[string]any{"broker": name, "reason": st})
		return none(st, nil), nil, false
	}
	one := ev
	// one.Decision below is this broker's, so the label must follow it and
	// not stay on the showcase broker (AUD-021).
	one.DecisionBroker = name
	if journalErr != nil {
		e.logAuto("execution_skipped", corr, map[string]any{"broker": name, "reason": "journal_unavailable"})
		return none("journal_unavailable", nil), nil, false
	}
	open, held, heldErr := e.booksForBroker(ev, name, br, rows, w)
	one.OpenTrade = open
	one.Decision = decideLiveAction(ev.Quotes, ev.Symbols, held, heldErr, open, allowE, allowX)
	decision = one.Decision
	action, _ := one.Decision["action"].(string)
	// A working order at this broker can only duplicate an order in the same
	// ticker, so it holds back that ticker alone (AUD-072).
	if action != "none" {
		sym := store.SafeTicker(fmt.Sprint(one.Decision["symbol"]))
		if w.busySymbols[name][sym] {
			e.logAuto("execution_skipped", corr, map[string]any{"broker": name, "symbol": sym, "reason": "symbol_order_in_flight"})
			return none("symbol_order_in_flight", sym), nil, false
		}
	}
	if action == "none" {
		kv := map[string]any{"broker": name, "reason": one.Decision["reason"]}
		if heldErr != nil {
			// Without the error text a broker_positions_unavailable skip is
			// unexplainable after the fact — the day's entry is gone and the
			// log says only that positions could not be read.
			kv["error"] = heldErr.Error()
		}
		e.logAuto("execution_skipped", corr, kv)
		return decision, nil, false
	}
	// A consistency mismatch holds back this broker's new entries only. The
	// exit path is untouched: an open position is closed on its signal whatever
	// the journal disagrees about.
	if action == "entry" && w.entryBlocked[name] {
		// The pre-flight check names its own reason (open orders unreadable);
		// everything else here is a journal/broker mismatch.
		reason := w.skipReasons[name]
		if reason == "" {
			reason = "consistency_mismatch"
		}
		e.logAuto("execution_skipped", corr, map[string]any{"broker": name, "reason": reason})
		return none(reason, nil), nil, false
	}
	res := e.submitEvaluated(w, one, trigger, corr, name, br)
	if reason, _ := res.Decision["reason"].(string); reason == "journal_unavailable" {
		decision = res.Decision
	}
	return decision, res.Broker, res.Executed
}

func (e *Engine) submitEvaluated(w execWindow, ev EvalResult, trigger, corr, brokerName string, br Broker) EvalResult {
	action, _ := ev.Decision["action"].(string)
	symbol := store.SafeTicker(fmt.Sprint(ev.Decision["symbol"]))
	key := action
	if action != "entry" {
		key = symbol + ":" + action
	}
	if brokerName != "" {
		key = brokerName + ":" + key
	}
	var pending map[string]any
	var pendErr error
	if action == "entry" {
		if brokerName != "" {
			pending, pendErr = e.DB.AnyPendingTrackerFor(brokerName)
		} else {
			pending, pendErr = e.DB.AnyPendingTracker()
		}
	} else {
		if brokerName != "" {
			pending, pendErr = e.DB.FindPendingTrackerBroker(symbol, action, brokerName)
		} else {
			pending, pendErr = e.DB.FindPendingTracker(symbol, action)
		}
	}
	if pendErr != nil {
		ev.Decision = map[string]any{"action": "none", "reason": "journal_unavailable", "symbol": nil, "candidate": nil}
		ev.Broker = map[string]any{"submitted": false, "error": "journal_unavailable"}
		ev.Executed = false
		ev.Submitted = false
		e.logAuto("execution_skipped", corr, map[string]any{
			"symbol": symbol, "action": action, "broker": brokerName,
			"reason": "journal_unavailable", "error": pendErr.Error(),
		})
		return ev
	}
	if pending != nil {
		errKey := "pending_tracker_exists"
		if action != "entry" {
			errKey = "pending_" + action + "_tracker_exists"
		}
		ev.Broker = map[string]any{"submitted": false, "error": errKey, "clientOrderId": pending["clientOrderId"]}
		e.logAuto("order_guarded", corr, map[string]any{"symbol": symbol, "action": action, "reason": "pending_tracker", "broker": brokerName})
		return ev
	}
	if action == "entry" && e.trackerPersistBlocked(brokerName) {
		ev.Broker = map[string]any{"submitted": false, "error": "execution_unknown"}
		e.logAuto("order_guarded", corr, map[string]any{"symbol": symbol, "action": action, "reason": "tracker_persist_failed", "broker": brokerName})
		return ev
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
		ev.Broker = map[string]any{"submitted": false, "error": "Не заданы ключи Webull", "mode": "off"}
		e.logAuto("execution_blocked", corr, map[string]any{"symbol": symbol, "reason": "missing_webull_credentials"})
		return ev
	}
	if executionWindowApplies(trigger) && e.outsideExecutionWindow(ev.AutoTrading) {
		ev.Broker = map[string]any{"submitted": false, "error": "outside_execution_window"}
		e.logAuto("execution_skipped", corr, map[string]any{"symbol": symbol, "reason": "outside_execution_window", "trigger": trigger})
		return ev
	}
	price := quotePrice(ev, symbol)
	qty, qerr := e.sizeOrder(action, symbol, ev.AutoTrading, price, br, w)
	if qerr != nil {
		ev.Broker = map[string]any{"submitted": false, "error": qerr.Error()}
		e.logAuto("execution_blocked", corr, map[string]any{"symbol": symbol, "reason": qerr.Error()})
		return ev
	}
	go e.logBalanceSnapshot(corr, symbol, action, br)
	side := "BUY"
	if action == "exit" {
		side = "SELL"
	}
	if action == "entry" {
		cancelled, err := e.cancelOpenOrdersBeforeEntry(w, symbol, br)
		if err != nil {
			reason := "open_orders_unavailable"
			if errors.Is(err, ErrOpenOrderCancelFailed) {
				reason = "open_order_cancel_failed"
			}
			ev.Broker = map[string]any{"submitted": false, "error": reason}
			e.logAuto("execution_blocked", corr, map[string]any{"symbol": symbol, "reason": reason, "error": err.Error()})
			return ev
		}
		if len(cancelled) > 0 {
			e.logAuto("open_orders_cancelled", corr, map[string]any{"symbol": symbol, "cancelled_count": len(cancelled)})
		}
	}
	res, err := e.placeMarket(w, symbol, side, qty, PlaceMarketCfg{}, br)
	if err != nil {
		res.Error = err.Error()
		res.Submitted = false
	}
	ev.Broker = res
	ev.Executed = res.Submitted
	ev.Submitted = res.Submitted
	if res.Submitted {
		ev.Phase = "submitted"
	} else {
		ev.Phase = "decision"
	}
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
		e.startTracking(res, orderMeta{
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
			label, symbol, side, qty, res.ClientOrderID, html.EscapeString(res.Error)))
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

// effectiveDecision returns the decision the run actually acted on. ev.Decision
// is EvaluateWindow's showcase evaluation, computed on the webull book plus the
// default broker; executeAll then decides per broker, so the showcase can say
// "none" while another broker really exited, and can name an exit that this
// broker skipped (AUD-017). An exit wins over an entry: the post-exit
// orchestration is what the callers key off.
// exitingBrokers lists the brokers whose decision in res was an exit. An empty
// result means the run had no per-broker decisions at all, and the caller must
// fall back to the unscoped journal check.
func exitingBrokers(res EvalResult) []string {
	var out []string
	for name, d := range res.BrokerDecisions {
		if action, _ := d["action"].(string); action == "exit" {
			out = append(out, name)
		}
	}
	sort.Strings(out)
	return out
}

func effectiveDecision(res EvalResult) map[string]any {
	if len(res.BrokerDecisions) == 0 {
		return res.Decision
	}
	names := make([]string, 0, len(res.BrokerDecisions))
	for name := range res.BrokerDecisions {
		names = append(names, name)
	}
	sort.Strings(names)
	var entry map[string]any
	for _, name := range names {
		d := res.BrokerDecisions[name]
		switch action, _ := d["action"].(string); action {
		case "exit":
			return d
		case "entry":
			if entry == nil {
				entry = d
			}
		}
	}
	if entry != nil {
		return entry
	}
	// Every broker was skipped: the showcase decision is what the report needs
	// in order to say which order was not sent.
	return res.Decision
}
