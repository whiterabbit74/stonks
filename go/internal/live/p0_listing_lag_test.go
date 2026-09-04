package live

import (
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"mktorder.com/go/internal/types"
)

func TestListingLagDoesNotMintSecondOrder(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	br.ListingLag = true
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})
	res := e.Execute("t1")
	if !res.Executed {
		t.Fatalf("first submit %+v", res.Broker)
	}
	if len(br.Orders) != 1 {
		t.Fatalf("want 1 order, got %+v", br.Orders)
	}
	oid := br.Orders[0].ClientOrderID
	e.PollTrackers()
	if db.FindPendingTracker("AAPL", "entry") == nil {
		t.Fatal("listing lag must keep the tracker pending")
	}
	_ = e.Execute("t1")
	if len(br.Orders) != 1 {
		t.Fatalf("second place during listing lag: %+v", br.Orders)
	}
	br.SetDetail(oid, map[string]any{"status": "FILLED", "avg_price": 8.2, "filled_qty": 1, "client_order_id": oid})
	waitTrackerFinal(t, e, db, "AAPL", "entry")
	trades, _ := db.ListTrades("broker_trades")
	if len(trades) != 1 {
		t.Fatalf("want one journal row after delayed fill, got %+v", trades)
	}
}

func TestListingLagThenRejectedDoesNotDeleteJournal(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	br.ListingLag = true
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "allowExits": false})
	res := e.Execute("t1")
	if !res.Executed {
		t.Fatalf("submit %+v", res.Broker)
	}
	oid := br.Orders[0].ClientOrderID
	_ = db.InsertTrade("broker_trades", map[string]any{
		"id": oid, "symbol": "AAPL", "status": "open",
		"entryDate": "2026-09-01", "entryPrice": 8.2, "quantity": 1.0, "broker": "webull",
	})
	e.PollTrackers()
	if db.GetTrade("broker_trades", oid) == nil {
		t.Fatal("listing lag deleted the live journal row")
	}
	br.SetDetail(oid, map[string]any{"status": "REJECTED", "client_order_id": oid})
	waitTrackerFinal(t, e, db, "AAPL", "entry")
	if db.GetTrade("broker_trades", oid) == nil {
		t.Fatal("rejected-after-lag must not deletePhantom a journal row")
	}
}

func TestListingLagAfterRestartKeepsJournal(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	br.ListingLag = true
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})
	_ = db.InsertTrade("broker_trades", map[string]any{
		"id": "oid-restart", "symbol": "AAPL", "status": "open",
		"entryDate": "2026-09-01", "entryPrice": 8.2, "quantity": 1.0, "broker": "webull",
	})
	if err := db.SaveOrderTracker(map[string]any{
		"clientOrderId": "oid-restart", "symbol": "AAPL", "action": "entry",
		"status": "submitted", "quantity": 1.0, "source": "t1", "dateKey": "2026-09-01",
		"broker": "webull", "startedAt": e.now().UTC().Format(time.RFC3339Nano),
	}); err != nil {
		t.Fatal(err)
	}
	e.PollTrackers()
	row := db.GetTrade("broker_trades", "oid-restart")
	if row == nil || fmt.Sprint(row["status"]) != "open" {
		t.Fatalf("restart listing lag deleted journal: %+v", row)
	}
	if db.FindPendingTracker("AAPL", "entry") == nil {
		t.Fatal("tracker should stay pending through listing lag")
	}
}

func TestSubmitErrorWithAcceptedOrderDoesNotDuplicate(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	br.ListingLag = true
	br.SetFailPlace("i/o timeout", 1, true)
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})
	_ = e.Execute("t1")
	if len(br.Orders) != 1 {
		t.Fatalf("listing-unavailable after accept minted a second order: %+v", br.Orders)
	}
}

func TestListingLagBudgetMarksExecutionUnknown(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	br.ListingLag = true
	prev := ListingLagWait
	ListingLagWait = 0
	t.Cleanup(func() { ListingLagWait = prev })
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})
	res := e.Execute("t1")
	if !res.Executed {
		t.Fatalf("submit %+v", res.Broker)
	}
	oid := br.Orders[0].ClientOrderID
	e.PollTrackers()
	st := trackerStatus(t, db, oid)
	if st != "execution_unknown" {
		t.Fatalf("status %q want execution_unknown", st)
	}
	trades, _ := db.ListTrades("broker_trades")
	if len(trades) != 0 {
		t.Fatalf("execution_unknown must not delete/create journal %+v", trades)
	}
	if db.AnyPendingTrackerFor("webull") == nil {
		t.Fatal("execution_unknown must still block a new entry")
	}
}

func TestRobinhoodOrderDetailMissingIsUnavailable(t *testing.T) {
	b := &RobinhoodBroker{
		account: "RH1",
		Call: func(name string, args map[string]any) (json.RawMessage, error) {
			if name == "get_equity_orders" {
				return json.RawMessage(`{"content":[{"type":"text","text":"{\"orders\":[]}"}]}`), nil
			}
			return json.RawMessage(`{}`), nil
		},
	}
	_, err := b.OrderDetail("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
	if !errors.Is(err, ErrOrderUnavailable) {
		t.Fatalf("want ErrOrderUnavailable, got %v", err)
	}
	if errors.Is(err, ErrOrderNotFound) {
		t.Fatal("listing miss must not be terminal-absent")
	}
}

func trackerStatus(t *testing.T, db interface{ ListRecentTrackers(int) ([]map[string]any, error) }, id string) string {
	t.Helper()
	rows, err := db.ListRecentTrackers(20)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range rows {
		if fmt.Sprint(r["clientOrderId"]) == id {
			return fmt.Sprint(r["status"])
		}
	}
	t.Fatalf("tracker %s not found", id)
	return ""
}
