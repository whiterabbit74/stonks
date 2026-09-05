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
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	res := e.Execute("t1")
	if !res.Executed {
		t.Fatalf("first submit %+v", res.Broker)
	}
	if len(br.Orders) != 1 {
		t.Fatalf("want 1 order, got %+v", br.Orders)
	}
	oid := br.Orders[0].ClientOrderID
	e.PollTrackers()
	row, err := db.FindPendingTracker("AAPL", "entry")
	if err != nil {
		t.Fatal(err)
	}
	if row == nil {
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
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true, "allowExits": false})
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
	if row, _ := db.GetTrade("broker_trades", oid); row == nil {
		t.Fatal("listing lag deleted the live journal row")
	}
	br.SetDetail(oid, map[string]any{"status": "REJECTED", "client_order_id": oid})
	waitTrackerFinal(t, e, db, "AAPL", "entry")
	if row, _ := db.GetTrade("broker_trades", oid); row == nil {
		t.Fatal("rejected-after-lag must not deletePhantom a journal row")
	}
}

func TestListingLagAfterRestartKeepsJournal(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	br.ListingLag = true
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
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
	row, _ := db.GetTrade("broker_trades", "oid-restart")
	if row == nil || fmt.Sprint(row["status"]) != "open" {
		t.Fatalf("restart listing lag deleted journal: %+v", row)
	}
	row, err := db.FindPendingTracker("AAPL", "entry")
	if err != nil {
		t.Fatal(err)
	}
	if row == nil {
		t.Fatal("tracker should stay pending through listing lag")
	}
}

func TestSubmitErrorWithAcceptedOrderDoesNotDuplicate(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	br.ListingLag = true
	br.SetFailPlace("i/o timeout", 1, true)
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
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
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
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
	row, err := db.AnyPendingTrackerFor("webull")
	if err != nil {
		t.Fatal(err)
	}
	if row == nil {
		t.Fatal("execution_unknown must still block a new entry")
	}
}

// TestExecutionUnknownRecoversWhenListingCatchesUp closes P0-2's first two
// "Что сделать" bullets end to end: execution_unknown must stay in
// ListPendingTrackers (or the wheel above and PollTrackers below would never
// look at it again), and once the broker's listing catches up, the very
// next poll has to record the fill and lift the entry block on its own -
// no operator action required.
func TestExecutionUnknownRecoversWhenListingCatchesUp(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	br.ListingLag = true
	prev := ListingLagWait
	ListingLagWait = 0
	t.Cleanup(func() { ListingLagWait = prev })
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	res := e.Execute("t1")
	if !res.Executed {
		t.Fatalf("submit %+v", res.Broker)
	}
	oid := br.Orders[0].ClientOrderID
	e.PollTrackers()
	if st := trackerStatus(t, db, oid); st != "execution_unknown" {
		t.Fatalf("status %q want execution_unknown", st)
	}
	row, err := db.AnyPendingTrackerFor("webull")
	if err != nil {
		t.Fatal(err)
	}
	if row == nil {
		t.Fatal("execution_unknown must block a new entry")
	}
	// The broker's listing catches up: OrderDetail now answers with a fill.
	br.SetDetail(oid, map[string]any{"status": "FILLED", "avg_price": 8.2, "filled_qty": 1, "client_order_id": oid})
	e.PollTrackers()
	if st := trackerStatus(t, db, oid); st != "filled" {
		t.Fatalf("status %q want filled after listing recovers", st)
	}
	trades, _ := db.ListTrades("broker_trades")
	if len(trades) != 1 {
		t.Fatalf("want one journal row after recovered fill, got %+v", trades)
	}
	row, err = db.AnyPendingTrackerFor("webull")
	if err != nil {
		t.Fatal(err)
	}
	if row != nil {
		t.Fatal("recovered fill must lift the entry block without operator action")
	}
}

// TestExpireStaleTrackersMarksUnresolvedAfterStaleDay closes P0-2's remaining
// "Что сделать" bullet: once execution_unknown survives into a new trading
// day and the broker still cannot answer, expireStaleTrackers must not spin
// on it forever, but it also must not silently expire it (that would delete
// a phantom journal row for an order that may have filled). It becomes the
// terminal "unresolved" state instead, which still blocks entries and can
// only be lifted by ResolveTracker.
func TestExpireStaleTrackersMarksUnresolvedAfterStaleDay(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	br.ListingLag = true
	prev := ListingLagWait
	ListingLagWait = 0
	t.Cleanup(func() { ListingLagWait = prev })
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	res := e.Execute("t1")
	if !res.Executed {
		t.Fatalf("submit %+v", res.Broker)
	}
	oid := br.Orders[0].ClientOrderID
	e.PollTrackers()
	if st := trackerStatus(t, db, oid); st != "execution_unknown" {
		t.Fatalf("status %q want execution_unknown", st)
	}
	// Advance to the next trading day; the broker still cannot confirm the id.
	ny, _ := time.LoadLocation("America/New_York")
	e.Now = func() time.Time { return time.Date(2026, 9, 2, 15, 59, 0, 0, ny) }
	e.PollTrackers()
	if st := trackerStatus(t, db, oid); st != "unresolved" {
		t.Fatalf("status %q want unresolved once stale", st)
	}
	row, err := db.AnyPendingTrackerFor("webull")
	if err != nil {
		t.Fatal(err)
	}
	if row == nil {
		t.Fatal("unresolved must still block a new entry")
	}
	trades, _ := db.ListTrades("broker_trades")
	if len(trades) != 0 {
		t.Fatalf("unresolved must not fabricate a journal row %+v", trades)
	}
	// Only an explicit operator action lifts it.
	if _, err := e.ResolveTracker(oid, "absent", "checked with broker support", 0, 0); err != nil {
		t.Fatalf("ResolveTracker: %v", err)
	}
	row, err = db.AnyPendingTrackerFor("webull")
	if err != nil {
		t.Fatal(err)
	}
	if row != nil {
		t.Fatal("resolve(absent) must lift the block")
	}
}

// TestResolveTrackerAbsentDeletesPhantomAndUnblocks closes P0-2's second
// "Что сделать" bullet directly against the resolve endpoint's engine
// method: outcome=absent must behave like a confirmed terminal_absent
// (delete the phantom journal row deletePhantom would have removed) and
// lift the entry block.
func TestResolveTrackerAbsentDeletesPhantomAndUnblocks(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	br.ListingLag = true
	prev := ListingLagWait
	ListingLagWait = 0
	t.Cleanup(func() { ListingLagWait = prev })
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	res := e.Execute("t1")
	if !res.Executed {
		t.Fatalf("submit %+v", res.Broker)
	}
	oid := br.Orders[0].ClientOrderID
	// A phantom journal row, as submitEvaluated writes optimistically before
	// the fill is confirmed.
	_ = db.InsertTrade("broker_trades", map[string]any{
		"id": oid, "symbol": "AAPL", "status": "open",
		"entryDate": "2026-09-01", "entryPrice": 8.2, "quantity": 1.0, "broker": "webull",
	})
	e.PollTrackers()
	if st := trackerStatus(t, db, oid); st != "execution_unknown" {
		t.Fatalf("status %q want execution_unknown", st)
	}
	tracker, err := e.ResolveTracker(oid, "absent", "checked broker, no such order", 0, 0)
	if err != nil {
		t.Fatalf("ResolveTracker: %v", err)
	}
	if fmt.Sprint(tracker["status"]) != "terminal_absent" {
		t.Fatalf("resolved tracker status = %v, want terminal_absent", tracker["status"])
	}
	if row, _ := db.GetTrade("broker_trades", oid); row != nil {
		t.Fatal("resolve(absent) must delete the phantom journal row")
	}
	row, err := db.AnyPendingTrackerFor("webull")
	if err != nil {
		t.Fatal(err)
	}
	if row != nil {
		t.Fatal("resolve(absent) must lift the entry block")
	}
	// Resolving twice must fail cleanly rather than double-record anything.
	if _, err := e.ResolveTracker(oid, "absent", "second try", 0, 0); err == nil {
		t.Fatal("resolving an already-resolved tracker must error")
	}
}

// TestResolveTrackerFilledRecordsJournal covers the outcome="filled" half of
// the same endpoint: it must journal the position exactly as a normal fill
// would, using the synthetic price/quantity supplied by the operator.
func TestResolveTrackerFilledRecordsJournal(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	br.ListingLag = true
	prev := ListingLagWait
	ListingLagWait = 0
	t.Cleanup(func() { ListingLagWait = prev })
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	res := e.Execute("t1")
	if !res.Executed {
		t.Fatalf("submit %+v", res.Broker)
	}
	oid := br.Orders[0].ClientOrderID
	e.PollTrackers()
	if st := trackerStatus(t, db, oid); st != "execution_unknown" {
		t.Fatalf("status %q want execution_unknown", st)
	}
	if _, err := e.ResolveTracker(oid, "filled", "confirmed fill via broker support", 8.25, 1); err != nil {
		t.Fatalf("ResolveTracker: %v", err)
	}
	trades, _ := db.ListTrades("broker_trades")
	if len(trades) != 1 {
		t.Fatalf("want one journal row after resolve(filled), got %+v", trades)
	}
	row, err := db.AnyPendingTrackerFor("webull")
	if err != nil {
		t.Fatal(err)
	}
	if row != nil {
		t.Fatal("resolve(filled) must lift the entry block")
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

func trackerStatus(t *testing.T, db interface {
	ListRecentTrackers(int) ([]map[string]any, error)
}, id string) string {
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
