package live

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// extractOrderDetailPayload ports autotrade.js extractOrderDetailPayload:
// descend into data, then data.orders[0] / list[0] / items[0].
func extractOrderDetailPayload(payload any) map[string]any {
	m := mapOf(payload)
	if m == nil {
		return nil
	}
	data := m
	if inner := mapOf(m["data"]); inner != nil {
		data = inner
	}
	for _, k := range []string{"orders", "list", "items"} {
		if rows, ok := data[k].([]any); ok && len(rows) > 0 {
			if first := mapOf(rows[0]); first != nil {
				return first
			}
		}
	}
	return data
}

func orderStatusField(detail map[string]any) string {
	if detail == nil {
		return ""
	}
	v := firstNonEmpty(detail["status"], detail["order_status"], detail["orderStatus"])
	s := strings.TrimSpace(fmt.Sprint(v))
	if s == "" || s == "<nil>" {
		return ""
	}
	return s
}

func fillPriceFrom(detail map[string]any) float64 {
	if detail == nil {
		return 0
	}
	return firstPositive(
		detail["filled_price"],
		detail["avg_price"],
		detail["average_price"],
		detail["filled_avg_price"],
		detail["deal_price"],
	)
}

func fillQtyFrom(detail map[string]any) float64 {
	if detail == nil {
		return 0
	}
	return firstPositive(
		detail["filled_qty"],
		detail["filled_quantity"],
		detail["cum_qty"],
		detail["deal_quantity"],
	)
}

// formatOrderQuantity renders the quantity Webull is sent. Entries are always
// whole shares, so this normally prints an integer; a fraction survives only
// when an exit has to sell a holding a split left fractional, and rounding it
// there would strand the remainder.
func formatOrderQuantity(qty float64) string {
	if whole := math.Floor(qty + 1e-9); math.Abs(qty-whole) < 1e-9 {
		return strconv.FormatInt(int64(whole), 10)
	}
	s := strconv.FormatFloat(qty, 'f', 5, 64)
	s = strings.TrimRight(s, "0")
	s = strings.TrimRight(s, ".")
	if s == "" || s == "-0" {
		return "0"
	}
	return s
}

func copyStringAnyMap(m map[string]any) map[string]any {
	if m == nil {
		return map[string]any{}
	}
	out := make(map[string]any, len(m)+4)
	for k, v := range m {
		out[k] = v
	}
	return out
}

func clientOrderIDOf(m map[string]any) string {
	if m == nil {
		return ""
	}
	s := strings.TrimSpace(fmt.Sprint(firstNonEmpty(m["client_order_id"], m["clientOrderId"], m["ref_id"])))
	if s == "" || s == "<nil>" {
		return ""
	}
	return s
}
