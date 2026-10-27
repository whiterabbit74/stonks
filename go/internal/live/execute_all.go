package live

import (
	"context"
	"errors"
	"fmt"
	"html"
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

// The T-1 cycle in two layers (CORE §3). The monitoring decides on its own and
// writes the decision to the journal before any broker is asked anything; then
// autotrade — only when it is switched on — follows that one decision at every
// broker, each broker on its own.

// MonitorStep is what the monitoring did in one cycle.
type MonitorStep struct {
	Held   *store.Position `json:"held,omitempty"`   // its position at the start of the cycle
	Exit   *LiveQuote      `json:"exit,omitempty"`   // the reading it exited on
	Closed *store.Position `json:"closed,omitempty"` // the row as that exit closed it
	Entry  *LiveQuote      `json:"entry,omitempty"`  // the reading it entered on
	Opened *store.Position `json:"opened,omitempty"` // the row that entry opened
	// Reason is why its last decision of the cycle was "none"; Failed is the
	// journal write that failed, which means the decision did not happen.
	Reason string `json:"reason,omitempty"`
	Failed string `json:"failed,omitempty"`
}

func (m *MonitorStep) acted() bool { return m != nil && (m.Exit != nil || m.Entry != nil) }

// BrokerRun is what autotrade did at one broker in one cycle: the account
// cleanup's sells, the entry's buy, and why it stopped short when it did.
type BrokerRun struct {
	Sells   []OrderResult `json:"sells,omitempty"`
	Buy     *OrderResult  `json:"buy,omitempty"`
	Reason  string        `json:"reason,omitempty"`
	Symbols []string      `json:"symbols,omitempty"` // the tickers behind Reason
}

func autotradeOn(cfg map[string]any) bool { return asBool(cfg["enabled"]) }

// runCycle is one cycle: the monitoring's decision, then autotrade following
// it. decided, when set, is called with the monitoring's result before any
// broker is asked anything. dry decides and writes nothing.
func (e *Engine) runCycle(w execWindow, trigger string, dry bool, decided func(EvalResult)) EvalResult {
	corr := newCorrelationID()
	ev := e.EvaluateWindow(w)
	if w.ctx != nil && w.ctx.Err() != nil {
		// The process is stopping: the cycle did not run, and nothing is
		// written on its behalf.
		ev.Monitor = &MonitorStep{Held: ev.OpenTrade, Reason: "cycle_cancelled"}
		return ev
	}
	mon := e.applyMonitor(ev, dry, corr)
	ev.Monitor = &mon
	if decided != nil {
		decided(ev)
	}
	if !dry && mon.acted() {
		if autotradeOn(ev.AutoTrading) {
			e.follow(w, &ev, trigger, corr)
		} else {
			e.logAuto("execution_skipped", corr, map[string]any{"reason": "autotrading_disabled"})
		}
	}
	e.mu.Lock()
	e.lastRunAt = ev.EvaluatedAt
	e.lastResult = ev
	e.mu.Unlock()
	return ev
}

// applyMonitor carries out the monitoring's decision in the journal: the exit
// closes its position on the T-1 reading, and holding nothing it may enter in
// the same cycle. A write that fails is a decision that did not happen —
// autotrade has nothing to follow (CORE §3.1).
func (e *Engine) applyMonitor(ev EvalResult, dry bool, corr string) MonitorStep {
	st := MonitorStep{Held: ev.OpenTrade}
	dec := ev.Decision
	if action, _ := dec["action"].(string); action == "exit" && st.Held != nil {
		q, _ := dec["candidate"].(*LiveQuote)
		if !dry {
			ibsVal := q.IBS
			closed, err := e.DB.ClosePosition(st.Held.ID, store.PositionExit{
				Date: ev.TodayKey, Price: q.CurrentPrice, IBS: &ibsVal,
				DecisionTime: ev.EvaluatedAt, Notes: "closed_by_monitor_signal",
			})
			if err != nil {
				e.logAuto("local_trade_close_failed", corr, map[string]any{
					"symbol": q.Symbol, "positionId": st.Held.ID, "op": "monitor_exit", "error": err.Error(),
				})
				st.Failed = "выход " + q.Symbol + ": " + err.Error()
				return st
			}
			st.Closed = closed
		}
		st.Exit = q
		e.logAuto("monitor_exit", corr, map[string]any{"symbol": q.Symbol, "ibs": q.IBS, "price": q.CurrentPrice, "dryRun": dry})
		dec = decideMonitor(ev.Quotes, ev.Symbols, nil)
	}
	if action, _ := dec["action"].(string); action == "entry" {
		q, _ := dec["candidate"].(*LiveQuote)
		if !dry {
			price, ibsVal := q.CurrentPrice, q.IBS
			opened, err := e.DB.OpenMonitorPosition(store.Position{
				ID: newCorrelationID(), Symbol: q.Symbol, EntryDate: ev.TodayKey,
				EntryPrice: &price, EntryIBS: &ibsVal, EntryDecisionTime: ev.EvaluatedAt,
			})
			if err != nil {
				e.logAuto("local_trade_record_failed", corr, map[string]any{
					"symbol": q.Symbol, "op": "monitor_entry", "error": err.Error(),
				})
				st.Failed = "вход " + q.Symbol + ": " + err.Error()
				return st
			}
			st.Opened = opened
		}
		st.Entry = q
		e.logAuto("monitor_entry", corr, map[string]any{"symbol": q.Symbol, "ibs": q.IBS, "price": q.CurrentPrice, "dryRun": dry})
		return st
	}
	st.Reason, _ = dec["reason"].(string)
	return st
}

// follow is autotrade following the monitoring's step at every attached
// broker in parallel. A panic at one broker ends as that broker's own named
// skip and takes nobody else with it (invariant D).
func (e *Engine) follow(w execWindow, ev *EvalResult, trigger, corr string) {
	busy, entryOnly, reasons := e.t1BrokerReconcile(w)
	w.busySymbols = busy
	runs := map[string]*BrokerRun{}
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, nb := range e.brokerSnapshot() {
		if nb.br == nil {
			continue
		}
		preflight := ""
		if entryOnly[nb.name] {
			preflight = "open_order_symbol_unknown"
			if reasons[nb.name] == "open_orders_unavailable" {
				preflight = reasons[nb.name]
			}
		}
		wg.Add(1)
		go func(name string, br Broker, preflight string) {
			defer wg.Done()
			run := &BrokerRun{}
			defer func() {
				if rec := recover(); rec != nil {
					e.logAuto("broker_execution_panic", corr, map[string]any{"broker": name, "error": fmt.Sprint(rec)})
					run.Reason = "broker_panic"
				}
				mu.Lock()
				runs[name] = run
				mu.Unlock()
			}()
			e.followAt(w, *ev, trigger, corr, name, br, preflight, run)
		}(nb.name, nb.br, preflight)
	}
	wg.Wait()
	if len(runs) == 0 {
		e.logAuto("execution_skipped", corr, map[string]any{"reason": "no_broker_configured"})
	}
	ev.Runs = runs
	summarizeRuns(ev)
}

// followAt is autotrade at one broker (CORE §3.2): the monitoring's exit sells
// everything in the book, whatever it is and wherever it came from; its entry
// is bought only into a book that is read and empty. Books, orders and flags
// here are this broker's own.
func (e *Engine) followAt(w execWindow, ev EvalResult, trigger, corr, name string, br Broker, preflight string, run *BrokerRun) {
	stop := func(reason string, symbols ...string) {
		run.Reason, run.Symbols = reason, symbols
		kv := map[string]any{"broker": name, "reason": reason}
		if len(symbols) > 0 {
			kv["symbols"] = strings.Join(symbols, ",")
		}
		e.logAuto("execution_skipped", corr, kv)
	}
	enabled, allowEntries, allowExits := brokerFlags(ev.AutoTrading, name)
	if !enabled {
		stop("broker_disabled")
		return
	}
	if st := e.storedHealthStatus(name); st == HealthNeedsReauth || st == HealthMissing {
		stop(st)
		return
	}
	mon := ev.Monitor
	settled := true
	var book map[string]float64 // the exit's read of the book, while no sell has made it stale
	if mon.Exit != nil && !allowExits && mon.Entry == nil {
		stop("exits_disabled")
		return
	}
	// Exits off here: nothing is sold, and an entry of the same cycle still
	// goes by its own rule — an empty book buys (CORE §3.2).
	if mon.Exit != nil && allowExits {
		held, err := e.heldSymbolsOn(br, w)
		if err != nil {
			stop("broker_positions_unavailable")
			return
		}
		var inFlight []string
		for _, sym := range sortedKeys(held) {
			// A working order in this ticker owns it: a second SELL would
			// duplicate it (AUD-072).
			if w.busySymbols[name][sym] {
				inFlight = append(inFlight, sym)
				continue
			}
			run.Sells = append(run.Sells, e.submitOne(w, ev, trigger, corr, name, br, "exit", sym))
		}
		if len(inFlight) > 0 {
			stop("symbol_order_in_flight", inFlight...)
			return
		}
		// Waited for whether an entry follows or not: a sell the broker turned
		// down gets its one retry in this same minute (CORE §3.2).
		if len(run.Sells) > 0 {
			settled = e.settleSells(w, ev, trigger, corr, name, br, run)
		} else {
			book = held
		}
	}
	if mon.Entry == nil {
		return
	}
	switch {
	case !allowEntries:
		stop("entries_disabled")
		return
	case preflight != "":
		stop(preflight)
		return
	case !settled:
		stop("sells_not_settled")
		return
	}
	held := book
	if held == nil {
		var err error
		if held, err = e.heldSymbolsOn(br, w); err != nil {
			stop("broker_positions_unavailable")
			return
		}
	}
	if len(held) > 0 {
		stop("broker_not_flat", sortedKeys(held)...)
		return
	}
	sym := mon.Entry.Symbol
	if w.busySymbols[name][sym] {
		stop("symbol_order_in_flight", sym)
		return
	}
	res := e.submitOne(w, ev, trigger, corr, name, br, "entry", sym)
	run.Buy = &res
}

// submitOne sends one order of the cycle through submitEvaluated, the single
// path every order takes, and names its outcome by ticker and side.
func (e *Engine) submitOne(w execWindow, ev EvalResult, trigger, corr, name string, br Broker, action, sym string) OrderResult {
	ev.Decision = map[string]any{"action": action, "symbol": sym, "candidate": exitSignalQuote(ev.Quotes, sym)}
	got := e.submitEvaluated(w, ev, trigger, corr, name, br)
	res := OrderResult{}
	switch r := got.Broker.(type) {
	case OrderResult:
		res = r
	case map[string]any:
		res.Submitted, _ = r["submitted"].(bool)
		if r["error"] != nil {
			res.Error = fmt.Sprint(r["error"])
		}
	}
	res.Symbol, res.Side = sym, "BUY"
	if action == "exit" {
		res.Side = "SELL"
	}
	return res
}

// settleSells waits, within the closing minute, for this broker's own sells to
// finish, sends once more every one the broker turned down without a fill, and
// gives the book the chance to empty. false: a sell is still working or its
// state could not be read, and no entry goes on top of it.
func (e *Engine) settleSells(w execWindow, ev EvalResult, trigger, corr, name string, br Broker, run *BrokerRun) bool {
	if !e.awaitSellsFinal(w, name) {
		return false
	}
	if e.retryRejectedSells(w, ev, trigger, corr, name, br, run) && !e.awaitSellsFinal(w, name) {
		return false
	}
	for _, s := range run.Sells {
		if s.Submitted || s.Ambiguous {
			// The feed can list sold shares for a second or two more; the
			// entry's own read of the book decides, this only gives it the
			// chance (AUD-071).
			e.awaitBrokerBooksFlat(w, []string{name})
			break
		}
	}
	return true
}

// awaitSellsFinal polls this broker's pending exit trackers until none is left.
func (e *Engine) awaitSellsFinal(w execWindow, name string) bool {
	scope := []string{name}
	for attempt := 0; ; attempt++ {
		t, err := e.pendingExitFor(scope)
		if err != nil {
			return false
		}
		if t == nil {
			return true
		}
		if attempt >= exitFillWaitAttempts || e.deadlineExceeded(w, exitFillWaitStep) {
			return false
		}
		e.pollOneTracker(t)
		e.sleep(exitFillWaitStep)
	}
}

// retryRejectedSells sends once more every sell of this cycle that the broker
// turned down without executing a single share: refused at placement, or
// accepted and then finished rejected, cancelled, expired or unknown to it.
// Nothing changed hands, so the shares are still in the account and the
// second SELL cannot double the first; a sell with any fill is not retried
// (CORE §3.2). For a finished order the broker is asked about the order
// itself: a tracker does not keep a fill it saw only in its last answer.
func (e *Engine) retryRejectedSells(w execWindow, ev EvalResult, trigger, corr, name string, br Broker, run *BrokerRun) bool {
	first := len(run.Sells)
	for i := 0; i < first; i++ {
		s := run.Sells[i]
		if s.ClientOrderID != "" && e.DB.RecordedFillQty(s.ClientOrderID) > 0 {
			continue
		}
		status := s.Status
		switch {
		case !s.Submitted && !s.Ambiguous && status == "rejected":
			// refused at placement: no order exists, nothing filled
		case s.Submitted && s.ClientOrderID != "":
			status = fmt.Sprint(e.DB.GetOrderTracker(s.ClientOrderID)["status"])
			switch status {
			case "rejected", "cancelled", "expired":
				detail, err := retryBrokerReadWindow(e, w, "order_detail", func(ctx context.Context) (map[string]any, error) {
					return br.OrderDetail(ctx, s.ClientOrderID)
				})
				if err != nil || fillQtyFrom(detail) > 0 {
					continue
				}
			case "terminal_absent": // the broker has no such order: nothing filled
			default:
				continue
			}
		default:
			continue
		}
		run.Sells[i].Submitted = false
		run.Sells[i].Status = status
		run.Sells[i].Error = "отклонён брокером (" + status + ") — повтор"
		e.logAuto("exit_rejected_retry", corr, map[string]any{
			"broker": name, "symbol": s.Symbol, "clientOrderId": s.ClientOrderID, "status": status,
		})
		run.Sells = append(run.Sells, e.submitOne(w, ev, trigger, corr, name, br, "exit", s.Symbol))
	}
	return len(run.Sells) > first
}

// summarizeRuns fills the per-broker summary the SPA reads: each broker's main
// order (its buy, else its sell of the monitoring's ticker, else its first
// sell) and what it did or why it did nothing.
func summarizeRuns(ev *EvalResult) {
	results := map[string]any{}
	decisions := map[string]map[string]any{}
	ev.Executed = false
	for name, run := range ev.Runs {
		d := map[string]any{"action": "none", "reason": run.Reason, "symbol": nil}
		var main *OrderResult
		for i := range run.Sells {
			if run.Sells[i].Submitted {
				ev.Executed = true
			}
			if main == nil || ev.Monitor.Exit != nil && run.Sells[i].Symbol == ev.Monitor.Exit.Symbol {
				main = &run.Sells[i]
			}
		}
		if run.Buy != nil {
			main = run.Buy
			ev.Executed = ev.Executed || run.Buy.Submitted
		}
		if main != nil {
			results[name] = *main
			d["symbol"] = main.Symbol
			if main.Submitted {
				d["action"] = map[string]string{"BUY": "entry", "SELL": "exit"}[main.Side]
			} else if run.Reason == "" {
				d["reason"] = main.Error
			}
		}
		decisions[name] = d
	}
	ev.Broker, ev.BrokerDecisions = results, decisions
	ev.Submitted = ev.Executed
	ev.Phase = "decision"
	if ev.Executed {
		ev.Phase = "submitted"
	}
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
	// The slot is taken before the pending trackers are read and held until
	// this order's tracker is written. Read first, a request delayed between
	// the read and the slot found the slot free once the first order released
	// it and sent a second one while the first was still working (AUD-004).
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
	// Everything from here on belongs to the order: the reads it needs are
	// bounded by the deadline, not by the pre-flight read budget (CORE-02).
	w = w.forPlacement()
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
	ibsVal := candidateIBS(ev.Decision)
	meta := orderMeta{
		CorrelationID: corr, IBS: ibsVal, DateKey: ev.TodayKey,
		QuotePrice: price, Action: action, Symbol: symbol, Quantity: qty, Source: trigger, Broker: brokerName,
	}
	res, err := e.placeMarket(w, symbol, side, qty, PlaceMarketCfg{}, br, meta)
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
		e.startTracking(res, meta)
		e.logAuto("order_submit_ok", corr, map[string]any{
			"symbol": symbol, "action": action, "side": side, "quantity": qty,
			"clientOrderId": res.ClientOrderID, "order_type": "MARKET", "broker": brokerName,
		})
	} else if res.Ambiguous {
		e.startTracking(res, meta)
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
