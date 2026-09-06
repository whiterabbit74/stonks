package live

import (
	"fmt"
	"testing"

	"mktorder.com/go/internal/types"
)

// TestEntryBlockedWhenOwnOrderCancelFails covers AUD-025: a manual Execute
// finds our own working order on the entry symbol and fails to cancel it. The
// new MARKET BUY must not go out next to the order still live at the broker.
func TestEntryBlockedWhenOwnOrderCancelFails(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})

	// Our own limit order from an earlier cycle: journalled (so IsOwnOrder
	// sees it) but already terminal in our books, so it blocks nothing itself.
	const stale = "own-stale-1"
	if err := db.SaveOrderTracker(map[string]any{
		"clientOrderId": stale, "symbol": "AAPL", "action": "entry",
		"status": "filled", "quantity": 1.0, "dateKey": "2026-09-01",
	}); err != nil {
		t.Fatal(err)
	}
	br.Open = []any{map[string]any{"symbol": "AAPL", "status": "WORKING", "client_order_id": stale}}
	br.FailCancel = fmt.Errorf("cancel order: 503")

	res := e.Execute("test")
	if res.Executed || res.Submitted {
		t.Fatalf("entry must be blocked while our order may still be live: %+v", res.Broker)
	}
	if len(br.Orders) != 0 {
		t.Fatalf("no MARKET may leave after a failed cancel: %d placements", len(br.Orders))
	}
	byBroker, _ := res.Broker.(map[string]any)
	bk, _ := byBroker["webull"].(map[string]any)
	if got := fmt.Sprint(bk["error"]); got != "open_order_cancel_failed" {
		t.Fatalf("block reason = %q, want open_order_cancel_failed", got)
	}
}
