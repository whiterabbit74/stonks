package live

import (
	"fmt"
	"strings"
	"testing"

	"mktorder.com/go/internal/types"

	"mktorder.com/go/internal/store"
)

func TestManualOrderGuardsPendingThenTracks(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	if err := db.SaveOrderTracker(store.Tracker{
		ClientOrderID: "pend-aapl-exit", Symbol: "AAPL", Action: "exit",
		Status: "submitted", Quantity: 1, DateKey: "2026-09-01",
		Broker: "webull",
	}); err != nil {
		t.Fatal(err)
	}

	res, err := e.manualOrder(br, "webull", "AAPL", "SELL", 1, "manual_close")
	if len(br.Orders) != 0 {
		t.Fatalf("must not PlaceMarket while a tracker is pending: %+v", br.Orders)
	}
	msg := res.Error
	if err != nil {
		msg = err.Error()
	}
	if !strings.Contains(msg, "pending_") || !strings.Contains(msg, "tracker_exists") {
		t.Fatalf("want pending_..._tracker_exists, got res=%+v err=%v", res, err)
	}

	if err := db.SetOrderTrackerStatus("pend-aapl-exit", "filled"); err != nil {
		t.Fatal(err)
	}
	res, err = e.manualOrder(br, "webull", "AAPL", "BUY", 1, "test_buy")
	if err != nil || !res.Submitted {
		t.Fatalf("clear book must send the order: %+v %v", res, err)
	}
	if len(br.Orders) != 1 {
		t.Fatalf("want 1 placed order, got %+v", br.Orders)
	}
	row := db.GetOrderTracker(res.ClientOrderID)
	if row == nil {
		t.Fatal("order_trackers must have a row")
	}
	if fmt.Sprint(row.Source) != "test_buy" {
		t.Fatalf("source=%v want test_buy", row.Source)
	}
	if row.Broker != "webull" {
		t.Fatalf("broker=%v want webull", row.Broker)
	}
}
