package live

import (
	"fmt"
	"strings"

	"mktorder.com/go/internal/store"
)

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
		id := fmt.Sprint(t["clientOrderId"])
		if id == "" {
			continue
		}
		n++
		detail, derr := e.Broker.OrderDetail(id)
		status := "unknown"
		if derr != nil {
			_ = e.DB.AppendAutotradeLog("order_poll_failed " + id + " " + derr.Error())
			continue
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
			continue
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
	}
	return n
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
