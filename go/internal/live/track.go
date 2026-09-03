package live

import (
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

func (e *Engine) PollTrackers() int {
	if e.Broker == nil {
		return 0
	}
	e.expireStaleTrackers()
	pending, err := e.DB.ListPendingTrackers()
	if err != nil || len(pending) == 0 {
		return 0
	}
	n := 0
	for _, t := range pending {
		n++
		e.pollOneTracker(t)
	}
	return n
}

func (e *Engine) ResumeTrackers() {
	e.expireStaleTrackers()
	pending, err := e.DB.ListPendingTrackers()
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
	n, err := e.DB.ExpireStaleTrackers(today, 64)
	if err != nil {
		e.logAuto("expire_trackers_failed", "", map[string]any{"error": err.Error()})
		return
	}
	if n > 0 {
		e.logAuto("order_tracking_finished", "", map[string]any{"status": "expired", "count": n, "reason": "stale_or_max_attempts"})
	}
}

func (e *Engine) TrackSubmitted(clientOrderID string) {
	if clientOrderID == "" || clientOrderID == "<nil>" || e.Broker == nil {
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
	id := fmt.Sprint(t["clientOrderId"])
	if id == "" || e.Broker == nil {
		return true
	}
	e.mu.Lock()
	if e.inFlight == nil {
		e.inFlight = map[string]bool{}
	}
	if e.inFlight[id] {
		e.mu.Unlock()
		return false
	}
	e.inFlight[id] = true
	e.mu.Unlock()
	defer func() {
		e.mu.Lock()
		delete(e.inFlight, id)
		e.mu.Unlock()
	}()

	detail, derr := e.Broker.OrderDetail(id)
	status := "unknown"
	if derr != nil {
		e.logAuto("order_poll_failed", e.metaCorr(id), map[string]any{
			"clientOrderId": id, "error": derr.Error(),
		})
		if n, _ := e.DB.BumpOrderTrackerAttempts(id); n >= 64 {
			e.finalizeTracker(t, "expired")
			return true
		}
		return false
	}
	if detail != nil {
		status = NormalizeOrderStatus(orderStatusField(detail))
		if status == "unknown" {
			if snap := e.findOrderSnapshot(id); snap != nil {
				detail = snap
				status = NormalizeOrderStatus(orderStatusField(snap))
			}
		}
	}
	if !IsFinalOrderStatus(status) {
		_ = e.DB.SetOrderTrackerStatus(id, status)
		e.logAuto("order_poll", e.metaCorr(id), map[string]any{
			"clientOrderId": id, "status": status, "symbol": t["symbol"],
		})
		if n, _ := e.DB.BumpOrderTrackerAttempts(id); n >= 64 {
			e.finalizeTracker(t, "expired")
			return true
		}
		return false
	}
	e.finalizeTrackerStatus(t, detail, status)
	return true
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
		_ = e.Send(e.chat(), fmt.Sprintf("<b>Webull исполнено</b>\n%s • %s • %s\nqty: %v\nsource: %v", sym, side, priceS, qty, t["source"]))
	} else {
		// Node notifies on every terminal status (autotrade.js finalizeTracker),
		// not just fills: a rejected or expired order is the case an operator
		// most needs to see.
		_ = e.Send(e.chat(), fmt.Sprintf("<b>Webull статус заявки</b>\n%s • %s\nstatus: %s\nsource: %v", sym, side, status, t["source"]))
	}
	e.mu.Lock()
	delete(e.orderMeta, id)
	e.mu.Unlock()
}

func (e *Engine) findOrderSnapshot(clientOrderID string) map[string]any {
	if e.Broker == nil {
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
	if open, err := e.Broker.OpenOrders(); err == nil {
		if m := match(open); m != nil {
			return m
		}
	}
	today := tradingdate.TodayNYSE(e.now())
	start := tradingdate.AddDays(today, -7)
	if hist, err := e.Broker.OrderHistory(start, today); err == nil {
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
