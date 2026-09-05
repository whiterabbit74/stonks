package live

import (
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

// Same backoff as Node TRACKING_DELAYS_MS in autotrade.js.
var TrackingDelays = []time.Duration{
	1500 * time.Millisecond,
	3000 * time.Millisecond,
	5000 * time.Millisecond,
	8000 * time.Millisecond,
	12 * time.Second,
	30 * time.Second,
	60 * time.Second,
}

// FastTrackers skips the real sleep in tests (wheel still runs).
var FastTrackers bool

func trackingDelay(attempts int) time.Duration {
	if len(TrackingDelays) == 0 {
		return time.Second
	}
	if attempts < 0 {
		attempts = 0
	}
	if attempts >= len(TrackingDelays) {
		attempts = len(TrackingDelays) - 1
	}
	return TrackingDelays[attempts]
}

func (e *Engine) sleep(d time.Duration) {
	if e != nil && e.Sleep != nil {
		e.Sleep(d)
		return
	}
	if FastTrackers {
		return
	}
	time.Sleep(d)
}

func NormalizeOrderStatus(raw string) string {
	s := strings.ToUpper(strings.TrimSpace(raw))
	switch s {
	case "FILLED", "FULL_FILLED", "FINAL_FILLED", "EXECUTED", "DONE":
		return "filled"
	case "PARTIAL_FILLED", "PARTIALLY_FILLED", "PARTIALFILLED":
		return "partially_filled"
	case "CANCELLED", "CANCELED", "VOIDED", "CANCEL_SUCCESS":
		return "cancelled"
	case "REJECTED", "FAILED", "DENIED", "PLACE_FAILED":
		return "rejected"
	case "EXPIRED":
		return "expired"
	case "NEW", "SUBMITTED", "PENDING", "ACCEPTED", "WORKING", "OPEN", "LIVE":
		return "working"
	case "":
		return "unknown"
	default:
		return strings.ToLower(s)
	}
}

func IsFinalOrderStatus(status string) bool {
	switch status {
	case "filled", "cancelled", "rejected", "expired":
		return true
	}
	return false
}

// PollTrackersHook is an optional test hook invoked at the start of PollTrackers.
var PollTrackersHook func()

func (e *Engine) PollTrackers() int {
	if PollTrackersHook != nil {
		PollTrackersHook()
	}
	if len(e.brokerMap()) == 0 {
		return 0
	}
	pending, err := e.DB.ListPendingTrackers()
	if err != nil {
		e.logAuto("poll_trackers_failed", "", map[string]any{"error": err.Error()})
		return 0
	}
	if len(pending) == 0 {
		return 0
	}
	n := 0
	for _, t := range pending {
		n++
		e.pollOneTracker(t)
	}
	e.expireStaleTrackers()
	return n
}

func (e *Engine) ResumeTrackers() {
	pending, err := e.DB.ListPendingTrackers()
	if err != nil {
		e.logAuto("poll_trackers_failed", "", map[string]any{"error": err.Error()})
		return
	}
	for _, t := range pending {
		e.pollOneTracker(t)
	}
	e.expireStaleTrackers()
	pending, err = e.DB.ListPendingTrackers()
	if err != nil {
		return
	}
	for _, t := range pending {
		e.TrackSubmitted(fmt.Sprint(t["clientOrderId"]))
	}
}

func (e *Engine) expireStaleTrackers() {
	if e.DB == nil {
		return
	}
	today := tradingdate.TodayNYSE(e.now())
	pending, err := e.DB.ListPendingTrackers()
	if err != nil {
		e.logAuto("expire_trackers_failed", "", map[string]any{"error": err.Error()})
		return
	}
	n := 0
	for _, t := range pending {
		attempts := int(asFloat(t["attempts"]))
		dk := fmt.Sprint(t["dateKey"])
		staleDay := dk != "" && dk != "<nil>" && today != "" && dk < today
		maxed := attempts >= 64
		if fmt.Sprint(t["status"]) == "execution_unknown" {
			// execution_unknown must not expire on a timer the way a normal
			// stuck tracker does: expiring it here would make finalizeTracker
			// delete a phantom journal row for an order that may well have
			// filled. It leaves execution_unknown only when the broker gives
			// an actual (non-error) answer - handled by pollTracker below,
			// which finalizes the tracker itself when that happens - or, once
			// the day has gone stale without one, via the operator's explicit
			// resolve action. staleDay just stops the automatic retries and
			// hands it to that ground rather than looping forever.
			if !staleDay {
				continue
			}
			id := fmt.Sprint(t["clientOrderId"])
			e.pollTracker(t)
			after := e.DB.GetOrderTracker(id)
			if after == nil || fmt.Sprint(after["status"]) != "execution_unknown" {
				// The broker answered and pollTracker already finalized the
				// tracker (filled / terminal_absent / etc).
				continue
			}
			e.finalizeTracker(t, "unresolved")
			n++
			continue
		}
		if !staleDay && !maxed {
			continue
		}
		done, lookupErr := e.pollTracker(t)
		if done {
			continue
		}
		if lookupErr != nil && !maxed {
			continue
		}
		e.finalizeTracker(t, "expired")
		n++
	}
	if n > 0 {
		e.logAuto("order_tracking_finished", "", map[string]any{"status": "expired", "count": n, "reason": "stale_or_max_attempts"})
	}
}

func (e *Engine) TrackSubmitted(clientOrderID string) {
	if clientOrderID == "" || clientOrderID == "<nil>" || len(e.brokerMap()) == 0 {
		return
	}
	e.mu.Lock()
	if e.wheels == nil {
		e.wheels = map[string]bool{}
	}
	if e.wheels[clientOrderID] {
		e.mu.Unlock()
		return
	}
	e.wheels[clientOrderID] = true
	e.mu.Unlock()
	go e.trackerWheel(clientOrderID)
}

func (e *Engine) trackerWheel(clientOrderID string) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("live: trackerWheel panic clientOrderId=%s: %v", clientOrderID, rec)
			e.logAuto("tracker_wheel_panic", e.metaCorr(clientOrderID), map[string]any{
				"clientOrderId": clientOrderID, "error": fmt.Sprint(rec),
			})
		}
		e.mu.Lock()
		delete(e.wheels, clientOrderID)
		e.mu.Unlock()
	}()
	for attempt := 0; attempt < 64; attempt++ {
		e.sleep(trackingDelay(attempt))
		done := false
		func() {
			defer func() {
				if rec := recover(); rec != nil {
					log.Printf("live: trackerWheel attempt panic clientOrderId=%s: %v", clientOrderID, rec)
					e.logAuto("tracker_wheel_panic", e.metaCorr(clientOrderID), map[string]any{
						"clientOrderId": clientOrderID, "attempt": attempt, "error": fmt.Sprint(rec),
					})
				}
			}()
			var rec map[string]any
			pending, _ := e.DB.ListPendingTrackers()
			for _, t := range pending {
				if fmt.Sprint(t["clientOrderId"]) == clientOrderID {
					rec = t
					break
				}
			}
			if rec == nil {
				row := e.DB.GetOrderTracker(clientOrderID)
				if row == nil {
					e.logAuto("tracker_missing", e.metaCorr(clientOrderID), map[string]any{"clientOrderId": clientOrderID})
				}
				done = true
				return
			}
			if e.pollOneTracker(rec) {
				done = true
			}
		}()
		if done {
			return
		}
		if FastTrackers && e.Sleep == nil {
			return
		}
	}
	pending, _ := e.DB.ListPendingTrackers()
	for _, t := range pending {
		if fmt.Sprint(t["clientOrderId"]) == clientOrderID {
			e.finalizeTracker(t, "expired")
			e.logAuto("order_tracking_finished", e.metaCorr(clientOrderID), map[string]any{
				"clientOrderId": clientOrderID, "status": "expired", "reason": "max_attempts",
			})
			return
		}
	}
}

func (e *Engine) pollOneTracker(t map[string]any) bool {
	done, _ := e.pollTracker(t)
	return done
}

func (e *Engine) pollTracker(t map[string]any) (bool, error) {
	id := fmt.Sprint(t["clientOrderId"])
	if id == "" {
		return true, nil
	}
	e.mu.Lock()
	if e.inFlight == nil {
		e.inFlight = map[string]bool{}
	}
	if e.inFlight[id] {
		e.mu.Unlock()
		return false, nil
	}
	e.inFlight[id] = true
	e.mu.Unlock()
	defer func() {
		e.mu.Lock()
		delete(e.inFlight, id)
		e.mu.Unlock()
	}()

	br := e.brokerForTracker(t)
	if br == nil {
		if name := trackerBrokerName(t); name != "" {
			// Named broker is set but not attached: never fall through to
			// defaultBroker. Webull answering ErrOrderNotFound here would
			// finalize the tracker as terminal_absent and deletePhantom
			// another broker's journal row (AU-P0-2).
			e.markBrokerDisconnected(t)
			return true, nil
		}
		return true, nil
	}
	detail, derr := br.OrderDetail(id)
	status := "unknown"
	if derr != nil {
		e.logAuto("order_poll_failed", e.metaCorr(id), map[string]any{
			"clientOrderId": id, "error": derr.Error(),
		})
		if errors.Is(derr, ErrOrderNotFound) {
			e.finalizeTracker(t, "terminal_absent")
			return true, nil
		}
		if errors.Is(derr, ErrOrderUnavailable) {
			if e.listingLagExpired(t) {
				e.markExecutionUnknown(t, derr)
				return true, nil
			}
			if n, _ := e.DB.BumpOrderTrackerAttempts(id); n >= 64 {
				e.markExecutionUnknown(t, derr)
				return true, derr
			}
			return false, derr
		}
		if n, _ := e.DB.BumpOrderTrackerAttempts(id); n >= 64 {
			e.finalizeTracker(t, "expired")
			return true, derr
		}
		return false, derr
	}
	if detail != nil {
		status = NormalizeOrderStatus(orderStatusField(detail))
		if status == "unknown" {
			if snap := e.findOrderSnapshotOn(br, id); snap != nil {
				detail = snap
				status = NormalizeOrderStatus(orderStatusField(snap))
			}
		}
	}
	if !IsFinalOrderStatus(status) && detail != nil {
		// A fully executed quantity is proof of a fill regardless of what the
		// broker calls the state, so an unrecognised status word cannot leave a
		// real position polling until it "expires".
		if ordered := asFloat(t["quantity"]); ordered > 0 && fillQtyFrom(detail) >= ordered-1e-9 {
			status = "filled"
		}
	}
	if !IsFinalOrderStatus(status) {
		_ = e.DB.SetOrderTrackerStatus(id, status)
		e.logAuto("order_poll", e.metaCorr(id), map[string]any{
			"clientOrderId": id, "status": status, "symbol": t["symbol"],
		})
		if n, _ := e.DB.BumpOrderTrackerAttempts(id); n >= 64 {
			e.finalizeTracker(t, "expired")
			return true, nil
		}
		return false, nil
	}
	e.finalizeTrackerStatus(t, detail, status)
	return true, nil
}

func listingLagExpired(t map[string]any, now time.Time) bool {
	started := strings.TrimSpace(fmt.Sprint(t["startedAt"]))
	if started == "" || started == "<nil>" {
		return false
	}
	ts, err := time.Parse(time.RFC3339Nano, started)
	if err != nil {
		ts, err = time.Parse(time.RFC3339, started)
	}
	if err != nil {
		return false
	}
	return !ts.IsZero() && now.Sub(ts) >= ListingLagWait
}

func (e *Engine) listingLagExpired(t map[string]any) bool {
	now := time.Now()
	if e != nil {
		now = e.now()
	}
	return listingLagExpired(t, now)
}

func trackerBrokerName(t map[string]any) string {
	if t == nil {
		return ""
	}
	name := strings.TrimSpace(fmt.Sprint(t["broker"]))
	if name == "" || name == "<nil>" {
		return ""
	}
	return name
}

func trackerBrokerLabel(t map[string]any) string {
	name := trackerBrokerName(t)
	if name == "" {
		name = "webull"
	}
	return brokerLabel(name)
}

// brokerForTracker returns the attached broker named on the tracker. A
// non-empty t["broker"] whose BrokerNamed lookup is nil is not replaced by
// defaultBroker — the caller must treat that as disconnected.
// Unlabeled rows are pre-broker-name Webull trackers; defaultBroker is that
// Webull adapter (e.Broker), not a stand-in for a named other broker.
func (e *Engine) brokerForTracker(t map[string]any) Broker {
	if name := trackerBrokerName(t); name != "" {
		return e.BrokerNamed(name)
	}
	return e.defaultBroker()
}

func (e *Engine) markBrokerDisconnected(t map[string]any) {
	id := fmt.Sprint(t["clientOrderId"])
	name := trackerBrokerName(t)
	_ = e.DB.SetOrderTrackerStatus(id, "execution_unknown")
	e.logAuto("order_execution_unknown", e.metaCorr(id), map[string]any{
		"clientOrderId": id, "symbol": t["symbol"], "action": t["action"],
		"broker": name, "error": "broker_not_connected",
	})
	_ = e.Send(e.chat(), fmt.Sprintf(
		"<b>Статус заявки неизвестен</b>\n%s • %s\nclientOrderId: %s\nБрокер %s не подключён. Заявка не опрашивалась, вход заблокирован.",
		t["symbol"], t["action"], id, brokerLabel(name)))
}

func (e *Engine) markExecutionUnknown(t map[string]any, cause error) {
	id := fmt.Sprint(t["clientOrderId"])
	_ = e.DB.SetOrderTrackerStatus(id, "execution_unknown")
	msg := ""
	if cause != nil {
		msg = cause.Error()
	}
	e.logAuto("order_execution_unknown", e.metaCorr(id), map[string]any{
		"clientOrderId": id, "symbol": t["symbol"], "action": t["action"], "error": msg,
	})
	_ = e.Send(e.chat(), fmt.Sprintf(
		"<b>Статус заявки неизвестен</b>\n%s • %s\nclientOrderId: %s\nЛистинг брокера не подтвердил заявку. Повтор не отправлен, вход заблокирован.",
		t["symbol"], t["action"], id))
}

// resolvableTrackerStatus reports whether ResolveTracker may act on a
// tracker in this status: anything that has not already reached a
// certain, automatically-determined outcome. execution_unknown and
// unresolved are exactly the states an operator has to be able to close
// out by hand (P0-2); a merely slow "working"/"submitted" tracker is left
// resolvable too so a stuck cycle is never a true dead end.
func resolvableTrackerStatus(status string) bool {
	switch status {
	case "filled", "cancelled", "canceled", "rejected", "expired", "terminal_absent":
		return false
	}
	return true
}

// ResolveTracker lets an operator manually close out a tracker the
// automatic wheel could not resolve on its own - most commonly
// execution_unknown (P0-2) or its stale-day dead end, unresolved - after
// checking the order at the broker by hand. outcome "absent" behaves like a
// confirmed terminal_absent (finalizeTracker -> recordFill -> deletePhantom);
// outcome "filled" behaves like a confirmed fill from a synthetic detail
// payload, so recordFill journals it exactly as a normal fill would. note is
// mandatory and is recorded in autotrade_logs alongside the outcome.
func (e *Engine) ResolveTracker(clientOrderID, outcome, note string, filledPrice, filledQty float64) (map[string]any, error) {
	if e == nil || e.DB == nil {
		return nil, fmt.Errorf("engine not configured")
	}
	clientOrderID = strings.TrimSpace(clientOrderID)
	if clientOrderID == "" {
		return nil, fmt.Errorf("clientOrderId required")
	}
	note = strings.TrimSpace(note)
	if note == "" {
		return nil, fmt.Errorf("note is required")
	}
	if outcome != "filled" && outcome != "absent" {
		return nil, fmt.Errorf(`outcome must be "filled" or "absent"`)
	}
	t := e.DB.GetOrderTracker(clientOrderID)
	if t == nil {
		return nil, fmt.Errorf("tracker not found")
	}
	if !resolvableTrackerStatus(fmt.Sprint(t["status"])) {
		return nil, fmt.Errorf("tracker already resolved")
	}
	corr := e.metaCorr(clientOrderID)
	if outcome == "absent" {
		e.finalizeTracker(t, "terminal_absent")
	} else {
		detail := map[string]any{}
		if filledPrice > 0 {
			detail["filled_price"] = filledPrice
		}
		if filledQty > 0 {
			detail["filled_qty"] = filledQty
		}
		e.finalizeTrackerStatus(t, detail, "filled")
	}
	e.logAuto("tracker_resolved_manually", corr, map[string]any{
		"clientOrderId": clientOrderID, "outcome": outcome, "note": note, "author": "operator",
		"symbol": t["symbol"], "action": t["action"], "broker": t["broker"],
	})
	return e.DB.GetOrderTracker(clientOrderID), nil
}

func (e *Engine) finalizeTracker(t map[string]any, status string) {
	e.finalizeTrackerStatus(t, nil, status)
}

func (e *Engine) finalizeTrackerStatus(t map[string]any, detail map[string]any, status string) {
	id := fmt.Sprint(t["clientOrderId"])
	// Record the trade before marking the tracker final so a waiter that
	// keys off pending status cannot observe a filled tracker with no row.
	e.recordFill(t, detail, status)
	_ = e.DB.SetOrderTrackerStatus(id, status)
	e.logAuto("order_tracking_finished", e.metaCorr(id), map[string]any{
		"clientOrderId": id, "status": status, "symbol": t["symbol"], "action": t["action"],
	})
	sym := store.SafeTicker(fmt.Sprint(t["symbol"]))
	side := "BUY"
	if fmt.Sprint(t["action"]) == "exit" {
		side = "SELL"
	}
	if status == "filled" {
		fillPrice := fillPriceFrom(detail)
		qty := fillQtyFrom(detail)
		if !(qty > 0) {
			qty = asFloat(t["quantity"])
		}
		priceS := "—"
		if fillPrice > 0 {
			priceS = fmt.Sprintf("$%.2f", fillPrice)
		}
		_ = e.Send(e.chat(), fmt.Sprintf("<b>%s исполнено</b>\n%s • %s • %s\nqty: %v\nsource: %v", trackerBrokerLabel(t), sym, side, priceS, qty, t["source"]))
	} else {
		// Node notifies on every terminal status (autotrade.js finalizeTracker),
		// not just fills: a rejected or expired order is the case an operator
		// most needs to see.
		_ = e.Send(e.chat(), fmt.Sprintf("<b>%s статус заявки</b>\n%s • %s\nstatus: %s\nsource: %v", trackerBrokerLabel(t), sym, side, status, t["source"]))
	}
	e.mu.Lock()
	delete(e.orderMeta, id)
	e.mu.Unlock()
}

func (e *Engine) findOrderSnapshotOn(br Broker, clientOrderID string) map[string]any {
	if br == nil {
		return nil
	}
	match := func(rows []any) map[string]any {
		for _, row := range rows {
			m := extractOrderDetailPayload(row)
			if m == nil {
				m = mapOf(row)
			}
			if clientOrderIDOf(m) == clientOrderID {
				return m
			}
		}
		return nil
	}
	if open, err := br.OpenOrders(); err == nil {
		if m := match(open); m != nil {
			return m
		}
	}
	today := tradingdate.TodayNYSE(e.now())
	start := tradingdate.AddDays(today, -7)
	if hist, err := br.OrderHistory(start, today); err == nil {
		return match(hist)
	}
	return nil
}

func (e *Engine) metaCorr(clientOrderID string) string {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.orderMeta == nil {
		return ""
	}
	return e.orderMeta[clientOrderID].CorrelationID
}

func (e *Engine) rememberOrder(clientOrderID string, meta orderMeta) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.orderMeta == nil {
		e.orderMeta = map[string]orderMeta{}
	}
	e.orderMeta[clientOrderID] = meta
}

func firstNonEmpty(vals ...any) any {
	for _, v := range vals {
		s := strings.TrimSpace(fmt.Sprint(v))
		if s != "" && s != "<nil>" {
			return v
		}
	}
	return ""
}

// exitFillWaitAttempts bounds the wait for a market exit to fill before the
// same T-1 cycle is allowed to open the next position. A market order on a
// liquid ticker fills in well under a second; the budget only has to cover a
// slow round trip, and it must stay far inside the closing minute.
const exitFillWaitAttempts = 10

var exitFillWaitStep = 500 * time.Millisecond

// awaitFlatAfterExit polls the pending exit until the broker journal reports
// no open trade. "Flat" is the same condition Evaluate uses to allow an entry,
// so a true return means the re-entry decision sees the position as gone.
func (e *Engine) awaitFlatAfterExit() bool {
	for attempt := 0; attempt < exitFillWaitAttempts; attempt++ {
		rows, _ := e.DB.ListTrades("broker_trades")
		if store.OpenBrokerTrade(rows) == nil {
			return true
		}
		t, err := e.DB.FindPendingTracker("", "exit")
		if err != nil || t == nil {
			// Nothing left to wait on: the tracker reached a terminal status
			// that did not close the trade (rejected, cancelled, expired).
			// A DB error is not a vanished tracker; do not re-enter on it.
			return false
		}
		// Poll here rather than waiting on trackerWheel's own backoff.
		e.pollOneTracker(t)
		e.sleep(exitFillWaitStep)
	}
	rows, _ := e.DB.ListTrades("broker_trades")
	return store.OpenBrokerTrade(rows) == nil
}
