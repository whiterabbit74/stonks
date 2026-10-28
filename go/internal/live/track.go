package live

import (
	"context"
	"errors"
	"fmt"
	"html"
	"log"
	"strings"
	"sync"
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
		e.TrackSubmitted(t.ClientOrderID)
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
		attempts := int(t.Attempts)
		dk := t.DateKey
		staleDay := dk != "" && today != "" && dk < today
		maxed := attempts >= 64
		if t.Status == "execution_unknown" {
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
			id := t.ClientOrderID
			e.pollTracker(t)
			after := e.DB.GetOrderTracker(id)
			if after == nil || after.Status != "execution_unknown" {
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
	if clientOrderID == "" || len(e.brokerMap()) == 0 {
		return
	}
	e.mu.Lock()
	if e.stopWheels {
		e.mu.Unlock()
		return
	}
	if e.wheels == nil {
		e.wheels = map[string]bool{}
	}
	if e.wheels[clientOrderID] {
		e.mu.Unlock()
		return
	}
	e.wheels[clientOrderID] = true
	e.wheelWG.Add(1)
	e.mu.Unlock()
	go e.trackerWheel(clientOrderID)
}

func (e *Engine) wheelsStopping() bool {
	if e == nil {
		return false
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.stopWheels
}

func (e *Engine) StopTrackers() {
	if e == nil {
		return
	}
	e.mu.Lock()
	e.stopWheels = true
	e.mu.Unlock()
	e.wheelWG.Wait()
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
		e.wheelWG.Done()
	}()
	for attempt := 0; attempt < 64; attempt++ {
		if e.wheelsStopping() {
			return
		}
		e.sleep(trackingDelay(attempt))
		if e.wheelsStopping() {
			return
		}
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
			var rec *store.Tracker
			pending, err := e.DB.ListPendingTrackers()
			if err != nil {
				e.logAuto("tracker_pending_read_failed", e.metaCorr(clientOrderID), map[string]any{
					"clientOrderId": clientOrderID, "error": err.Error(),
				})
				return
			}
			for i := range pending {
				if pending[i].ClientOrderID == clientOrderID {
					rec = &pending[i]
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
			if e.pollOneTracker(*rec) {
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
	pending, err := e.DB.ListPendingTrackers()
	if err != nil {
		e.logAuto("tracker_pending_read_failed", e.metaCorr(clientOrderID), map[string]any{
			"clientOrderId": clientOrderID, "error": err.Error(),
		})
		return
	}
	for _, t := range pending {
		if t.ClientOrderID == clientOrderID {
			e.finalizeTracker(t, "expired")
			e.logAuto("order_tracking_finished", e.metaCorr(clientOrderID), map[string]any{
				"clientOrderId": clientOrderID, "status": "expired", "reason": "max_attempts",
			})
			return
		}
	}
}

func (e *Engine) pollOneTracker(t store.Tracker) bool {
	done, err := e.pollTracker(t)
	if err != nil {
		e.logAuto("tracker_poll_failed", e.metaCorr(t.ClientOrderID), map[string]any{
			"clientOrderId": t.ClientOrderID, "error": err.Error(),
		})
	}
	return done
}

func (e *Engine) pollTracker(t store.Tracker) (bool, error) {
	id := t.ClientOrderID
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
	detail, derr := br.OrderDetail(context.Background(), id)
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
			n, aerr := e.DB.BumpOrderTrackerAttempts(id)
			if aerr != nil {
				return false, aerr
			}
			if n >= 64 {
				e.markExecutionUnknown(t, derr)
				return true, derr
			}
			return false, derr
		}
		n, aerr := e.DB.BumpOrderTrackerAttempts(id)
		if aerr != nil {
			return false, aerr
		}
		if n >= 64 {
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
		if ordered := t.Quantity; ordered > 0 && fillQtyFrom(detail) >= ordered-1e-9 {
			status = "filled"
		}
	}
	if !IsFinalOrderStatus(status) {
		if err := e.stampTrackerStatus(id, status); err != nil {
			return false, err
		}
		// A partial fill is known only from this answer. Keep it, so that a
		// tracker ending later with no answer still journals these shares
		// (AUD-135).
		if q := fillQtyFrom(detail); q > 0 {
			if err := e.DB.NoteTrackerFill(id, q, fillPriceFrom(detail)); err != nil {
				e.logAuto("tracker_fill_persist_failed", e.metaCorr(id), map[string]any{
					"clientOrderId": id, "filledQty": q, "error": err.Error(),
				})
				return false, err
			}
		}
		e.logAuto("order_poll", e.metaCorr(id), map[string]any{
			"clientOrderId": id, "status": status, "symbol": t.Symbol,
		})
		n, aerr := e.DB.BumpOrderTrackerAttempts(id)
		if aerr != nil {
			return false, aerr
		}
		if n >= 64 {
			// The last answer goes with it: its filled_qty is the only record
			// of shares already executed, and nil dropped them (AUD-135).
			e.finalizeTrackerStatus(t, detail, "expired")
			return true, nil
		}
		return false, nil
	}
	e.finalizeTrackerStatus(t, detail, status)
	return true, nil
}

func listingLagExpired(t store.Tracker, now time.Time) bool {
	started := strings.TrimSpace(t.StartedAt)
	if started == "" {
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

func (e *Engine) listingLagExpired(t store.Tracker) bool {
	now := time.Now()
	if e != nil {
		now = e.now()
	}
	return listingLagExpired(t, now)
}

func trackerBrokerName(t store.Tracker) string {
	return strings.TrimSpace(t.Broker)
}

func trackerBrokerLabel(t store.Tracker) string {
	name := trackerBrokerName(t)
	if name == "" {
		name = "webull"
	}
	return brokerLabel(name)
}

// brokerForTracker returns the attached broker named on the tracker. A
// non-empty t.Broker whose BrokerNamed lookup is nil is not replaced by
// defaultBroker — the caller must treat that as disconnected.
// Unlabeled rows are pre-broker-name Webull trackers; defaultBroker is that
// Webull adapter (e.Broker), not a stand-in for a named other broker.
func (e *Engine) brokerForTracker(t store.Tracker) Broker {
	if name := trackerBrokerName(t); name != "" {
		return e.BrokerNamed(name)
	}
	return e.defaultBroker()
}

// alreadyUnknown reports that this tracker was already in execution_unknown
// before this poll. The wheel keeps polling such a tracker, so sending the
// Telegram alert unconditionally repeated the same message every cycle until
// an operator resolved it by hand.
func alreadyUnknown(t store.Tracker) bool {
	return strings.TrimSpace(t.Status) == "execution_unknown"
}

func (e *Engine) markBrokerDisconnected(t store.Tracker) {
	id := t.ClientOrderID
	name := trackerBrokerName(t)
	repeat := alreadyUnknown(t)
	if err := e.stampTrackerStatus(id, "execution_unknown"); err != nil {
		e.logAuto("order_execution_unknown_persist_failed", e.metaCorr(id), map[string]any{"clientOrderId": id, "error": err.Error()})
	}
	e.logAuto("order_execution_unknown", e.metaCorr(id), map[string]any{
		"clientOrderId": id, "symbol": t.Symbol, "action": t.Action,
		"broker": name, "error": "broker_not_connected",
	})
	if repeat {
		return
	}
	_ = e.Send(e.chat(), fmt.Sprintf(
		"<b>Статус заявки неизвестен</b>\n%s • %s\nclientOrderId: %s\nБрокер %s не подключён. Заявка не опрашивалась, вход заблокирован.",
		t.Symbol, t.Action, id, brokerLabel(name)))
}

func (e *Engine) markExecutionUnknown(t store.Tracker, cause error) {
	id := t.ClientOrderID
	repeat := alreadyUnknown(t)
	if err := e.stampTrackerStatus(id, "execution_unknown"); err != nil {
		e.logAuto("order_execution_unknown_persist_failed", e.metaCorr(id), map[string]any{"clientOrderId": id, "error": err.Error()})
	}
	msg := ""
	if cause != nil {
		msg = cause.Error()
	}
	e.logAuto("order_execution_unknown", e.metaCorr(id), map[string]any{
		"clientOrderId": id, "symbol": t.Symbol, "action": t.Action, "error": msg,
	})
	if repeat {
		return
	}
	_ = e.Send(e.chat(), fmt.Sprintf(
		"<b>Статус заявки неизвестен</b>\n%s • %s\nclientOrderId: %s\nЛистинг брокера не подтвердил заявку. Повтор не отправлен, вход заблокирован.",
		t.Symbol, t.Action, id))
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
func (e *Engine) ResolveTracker(clientOrderID, outcome, note string, filledPrice, filledQty float64) (*store.Tracker, error) {
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
	if !resolvableTrackerStatus(t.Status) {
		return nil, fmt.Errorf("tracker already resolved")
	}
	corr := e.metaCorr(clientOrderID)
	var done bool
	if outcome == "absent" {
		done = e.finalizeTrackerAsIs(*t, nil, "terminal_absent")
	} else {
		detail := map[string]any{}
		if filledPrice > 0 {
			detail["filled_price"] = filledPrice
		}
		if filledQty > 0 {
			detail["filled_qty"] = filledQty
		}
		done = e.finalizeTrackerAsIs(*t, detail, "filled")
	}
	// Отказ записи исполнения или статуса — не «разрешено»: оператор получал
	// ok, а заявка оставалась висеть (AUD-163).
	if !done {
		return nil, fmt.Errorf("не удалось записать исход заявки, она осталась неразрешённой")
	}
	e.logAuto("tracker_resolved_manually", corr, map[string]any{
		"clientOrderId": clientOrderID, "outcome": outcome, "note": note, "author": "operator",
		"symbol": t.Symbol, "action": t.Action, "broker": t.Broker,
	})
	return e.DB.GetOrderTracker(clientOrderID), nil
}

func (e *Engine) stampTrackerStatus(id, status string) error {
	err := e.DB.SetOrderTrackerStatus(id, status)
	if err != nil {
		e.logAuto("tracker_finalize_failed", e.metaCorr(id), map[string]any{
			"clientOrderId": id, "status": status, "error": err.Error(),
		})
	}
	return err
}

func (e *Engine) finalizeTracker(t store.Tracker, status string) bool {
	return e.finalizeTrackerStatus(t, nil, status)
}

// finalizeTrackerStatus reports whether the fill and the final status were
// both written; false leaves the tracker pending for the next poll.
//
// An ending whose answer carries no executed quantity — a network error on the
// last poll, a stale day, the wheel running out — takes the last fill the
// broker confirmed while the order was working. Ending it on nothing dropped
// shares already bought or sold from the journal (AUD-135). "filled" without
// a quantity means the whole order and keeps its own fallback.
func (e *Engine) finalizeTrackerStatus(t store.Tracker, detail map[string]any, status string) bool {
	if status != "filled" && !(fillQtyFrom(detail) > 0) {
		id := t.ClientOrderID
		qty, price, err := e.DB.TrackerFill(id)
		if err != nil {
			e.logAuto("tracker_fill_read_failed", e.metaCorr(id), map[string]any{
				"clientOrderId": id, "status": status, "error": err.Error(),
			})
			return false
		}
		if qty > 0 {
			known := map[string]any{}
			for k, v := range detail {
				known[k] = v
			}
			known["filled_qty"] = qty
			if price > 0 {
				known["filled_price"] = price
			}
			detail = known
		}
	}
	return e.finalizeTrackerAsIs(t, detail, status)
}

// finalizeTrackerAsIs is finalizeTrackerStatus without the last known fill:
// for an operator's resolution, which states the outcome itself.
func (e *Engine) finalizeTrackerAsIs(t store.Tracker, detail map[string]any, status string) bool {
	id := t.ClientOrderID
	// Record the trade before marking the tracker final so a waiter that
	// keys off pending status cannot observe a filled tracker with no row.
	if !e.recordFill(t, detail, status) {
		// The journal did not take the fill: leave the tracker pending so the
		// next poll retries, rather than going final over a lost trade (AUD-134).
		return false
	}
	// The journal has the fill now; a replay will not book it again, so this
	// is the only chance to report the result.
	result := e.takeCloseNotice(id)
	if err := e.stampTrackerStatus(id, status); err != nil {
		if result != "" {
			_ = e.Send(e.chat(), result)
		}
		return false
	}
	e.logAuto("order_tracking_finished", e.metaCorr(id), map[string]any{
		"clientOrderId": id, "status": status, "symbol": t.Symbol, "action": t.Action,
	})
	_ = e.Send(e.chat(), trackerNoticeText(t, detail, status))
	if result != "" {
		_ = e.Send(e.chat(), result)
	}
	return true
}

// trackerNoticeText is the operator's line for an order that reached a final
// status: "Robinhood: продано 1 MSFT по $535.12". The source is named only when
// the order did not come from the regular T-1 cycle.
func trackerNoticeText(t store.Tracker, detail map[string]any, status string) string {
	sym := store.SafeTicker(t.Symbol)
	exit := t.Action == "exit"
	var text string
	if status == "filled" {
		qty := fillQtyFrom(detail)
		if !(qty > 0) {
			qty = t.Quantity
		}
		price := "— цена не подтверждена"
		if p := fillPriceFrom(detail); p > 0 {
			price = fmt.Sprintf("по $%.2f", p)
		}
		verb := "куплено"
		if exit {
			verb = "продано"
		}
		text = fmt.Sprintf("<b>%s</b>: %s %v %s %s", trackerBrokerLabel(t), verb, qty, sym, price)
	} else {
		// Node notifies on every terminal status (autotrade.js finalizeTracker),
		// not just fills: a rejected or expired order is the case an operator
		// most needs to see.
		kind := "покупку"
		if exit {
			kind = "продажу"
		}
		text = fmt.Sprintf("<b>%s</b>: заявка на %s %s — %s", trackerBrokerLabel(t), kind, sym, trackerStatusText(status))
	}
	if src := strings.TrimSpace(t.Source); src != "" && src != "telegram_t1" {
		text += "\nисточник: " + html.EscapeString(src)
	}
	return text
}

func trackerStatusText(status string) string {
	switch status {
	case "cancelled", "canceled":
		return "отменена"
	case "rejected":
		return "отклонена"
	case "expired":
		return "истекла без исполнения"
	case "terminal_absent":
		return "брокер её не знает"
	case "unresolved":
		return "статус не выяснен"
	}
	return html.EscapeString(status)
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
	if open, err := br.OpenOrders(context.Background()); err == nil {
		if m := match(open); m != nil {
			return m
		}
	}
	today := tradingdate.TodayNYSE(e.now())
	start := tradingdate.AddDays(today, -7)
	if hist, err := br.OrderHistory(context.Background(), start, today); err == nil {
		return match(hist)
	}
	return nil
}

// metaCorr is the correlation id the order was sent with, from its tracker.
func (e *Engine) metaCorr(clientOrderID string) string {
	if e.DB == nil {
		return ""
	}
	if t := e.DB.GetOrderTracker(clientOrderID); t != nil {
		return t.CorrelationID
	}
	return ""
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

// exitBookWaitAttempts bounds the wait for the broker's own position feed to
// catch up with a filled sell. /account/positions can still list the sold
// shares for a second or two, and an entry checks that very book for being
// empty (AUD-071).
const exitBookWaitAttempts = 6

// awaitBrokerBooksFlat waits for each named broker's own position feed to stop
// reporting the shares it just sold. Best effort: when the feed does not catch
// up in the budget, the entry finds the book not empty and is skipped
// (broker_not_flat) — no order is sent on a guess. Brokers are
// polled concurrently, so Webull's lag never delays Robinhood.
func (e *Engine) awaitBrokerBooksFlat(w execWindow, brokers []string) {
	var wg sync.WaitGroup
	for _, name := range brokers {
		br := e.BrokerNamed(name)
		if br == nil {
			continue
		}
		wg.Add(1)
		go func(name string, br Broker) {
			defer wg.Done()
			for attempt := 0; attempt < exitBookWaitAttempts; attempt++ {
				held, err := e.heldSymbolsOn(br, w)
				if err != nil || len(held) == 0 {
					return
				}
				if e.deadlineExceeded(w, exitFillWaitStep) {
					e.logAuto("exit_book_still_stale", "", map[string]any{
						"broker": name, "reason": "deadline", "symbols": len(held),
					})
					return
				}
				e.sleep(exitFillWaitStep)
			}
			e.logAuto("exit_book_still_stale", "", map[string]any{"broker": name, "reason": "timeout"})
		}(name, br)
	}
	wg.Wait()
}

// pendingExitFor returns the first unfilled exit tracker on the given brokers.
func (e *Engine) pendingExitFor(brokers []string) (*store.Tracker, error) {
	for _, b := range brokerScope(brokers) {
		t, err := e.DB.FindPendingTrackerBroker("", "exit", b)
		if err != nil || t != nil {
			return t, err
		}
	}
	return nil, nil
}

// brokerScope normalises an empty list to the "any broker" scope.
func brokerScope(brokers []string) []string {
	if len(brokers) == 0 {
		return []string{""}
	}
	return brokers
}
