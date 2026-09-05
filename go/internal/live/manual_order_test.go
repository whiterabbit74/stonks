package live

import (
	"fmt"
	"strings"
	"testing"

	"mktorder.com/go/internal/types"
)

func TestManualOrderGuardsPendingThenTracks(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	if err := db.SaveOrderTracker(map[string]any{
		"clientOrderId": "pend-aapl-exit", "symbol": "AAPL", "action": "exit",
		"status": "submitted", "quantity": 1, "dateKey": "2026-09-01",
		"broker": "webull",
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
	if fmt.Sprint(row["source"]) != "test_buy" {
		t.Fatalf("source=%v want test_buy", row["source"])
	}
	if fmt.Sprint(row["broker"]) != "webull" {
		t.Fatalf("broker=%v want webull", row["broker"])
	}
}
