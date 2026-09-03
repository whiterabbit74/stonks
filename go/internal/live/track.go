package live

import (
	"fmt"
	"strings"
	"time"

	"mktorder.com/go/internal/store"
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
	pending, err := e.DB.ListPendingTrackers()
	if err != nil {
		return
	}
	for _, t := range pending {
		e.TrackSubmitted(fmt.Sprint(t["clientOrderId"]))
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
		e.mu.Lock()
		delete(e.wheels, clientOrderID)
		e.mu.Unlock()
	}()
	for attempt := 0; attempt < 64; attempt++ {
		e.sleep(trackingDelay(attempt))
		var rec map[string]any
		pending, _ := e.DB.ListPendingTrackers()
		for _, t := range pending {
			if fmt.Sprint(t["clientOrderId"]) == clientOrderID {
				rec = t
				break
			}
		}
		if rec == nil {
			return
		}
		if e.pollOneTracker(rec) {
			return
		}
		if FastTrackers && e.Sleep == nil {
			return
		}
	}
}

func (e *Engine) pollOneTracker(t map[string]any) bool {
	id := fmt.Sprint(t["clientOrderId"])
	if id == "" || e.Broker == nil {
		return true
	}
	detail, derr := e.Broker.OrderDetail(id)
	status := "unknown"
	if derr != nil {
		_ = e.DB.AppendAutotradeLog("order_poll_failed " + id + " " + derr.Error())
		return false
	}
	if detail != nil {
		status = NormalizeOrderStatus(fmt.Sprint(firstNonEmpty(detail["status"], detail["order_status"], detail["orderStatus"])))
		if status == "unknown" {
			status = NormalizeOrderStatus(fmt.Sprint(detail["raw"]))
		}
	}
	if !IsFinalOrderStatus(status) {
		_ = e.DB.SetOrderTrackerStatus(id, status)
		_ = e.DB.AppendAutotradeLog("order_poll " + id + " " + status)
		return false
	}
	_ = e.DB.SetOrderTrackerStatus(id, status)
	_ = e.DB.AppendAutotradeLog("order_tracking_finished " + id + " " + status)
	if status == "filled" {
		sym := store.SafeTicker(fmt.Sprint(t["symbol"]))
		side := "BUY"
		if fmt.Sprint(t["action"]) == "exit" {
			side = "SELL"
		}
		_ = e.Send(e.chat(), fmt.Sprintf("<b>Webull исполнено</b>\n%s • %s\nqty: %v\nsource: %v", sym, side, t["quantity"], t["source"]))
	}
	return true
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
