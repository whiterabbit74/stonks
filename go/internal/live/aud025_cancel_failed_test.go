package live

import (
	"errors"
	"fmt"
	"testing"

	"mktorder.com/go/internal/types"

	"mktorder.com/go/internal/store"
)

// TestEntryBlockedWhenOwnOrderCancelFails covers AUD-025: the cycle finds our
// own working order on the entry symbol and fails to cancel it. The
// new MARKET BUY must not go out next to the order still live at the broker.
func TestEntryBlockedWhenOwnOrderCancelFails(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})

	// Our own limit order from an earlier cycle: journalled (so IsOwnOrder
	// sees it) but already terminal in our books, so it blocks nothing itself.
	const stale = "own-stale-1"
	if err := db.SaveOrderTracker(store.Tracker{
		ClientOrderID: stale, Symbol: "AAPL", Action: "entry",
		Status: "filled", Quantity: 1.0, DateKey: "2026-09-01",
	}); err != nil {
		t.Fatal(err)
	}
	br.Open = []any{map[string]any{"symbol": "AAPL", "status": "WORKING", "client_order_id": stale}}
	br.FailCancel = fmt.Errorf("cancel order: 503")

	// The cycle's preflight already holds the entry next to a working order in
	// the same ticker.
	res := e.Execute("test")
	if res.Executed || len(br.Orders) != 0 || res.Runs["webull"].Reason != "symbol_order_in_flight" {
		t.Fatalf("entry must be held while our order may still be live: %+v %+v", res.Runs["webull"], br.Orders)
	}
	// And the submission's own guard, should an order appear after the
	// preflight, refuses rather than buying next to it.
	if _, err := e.cancelOpenOrdersBeforeEntry(backgroundWindow(), "AAPL", br); !errors.Is(err, ErrOpenOrderCancelFailed) {
		t.Fatalf("a failed cancel must refuse the entry, got %v", err)
	}
}
