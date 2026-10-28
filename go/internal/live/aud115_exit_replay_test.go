package live

import (
	"testing"

	"mktorder.com/go/internal/store"
)

// AUD-115: a broker answer can arrive twice (the poll after a restart between
// the journal write and the tracker status). The full exit had no "already
// booked" mark anywhere, so the replay closed whatever position the ticker held
// at that moment — the same day's re-entry included — at the old fill price.
func TestExitFillReplayLeavesReentryAlone(t *testing.T) {
	db, e, _ := testEngine(t, nil)
	if err := db.SavePosition(store.Position{
		ID: "p1", Symbol: "AAPL", Status: "open", Quantity: 4, EntryPrice: store.Ptr(10.0), IsTest: true, // lives by its fills
		Webull: store.BrokerLeg{Qty: 4, EntryPrice: store.Ptr(10.0), EntryOrderID: "w1"},
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.SaveOrderTracker(store.Tracker{
		ClientOrderID: "x-exit", Symbol: "AAPL", Action: "exit", Quantity: 4, Broker: "webull",
	}); err != nil {
		t.Fatal(err)
	}

	e.recordExitFill("AAPL", "x-exit", "webull", "2026-09-01", 4, 11, nil, orderMeta{})
	p1, err := db.GetPosition("p1")
	if err != nil || p1 == nil || p1.Status != "closed" {
		t.Fatalf("p1 = %+v, %v; want closed", p1, err)
	}

	if _, err := db.AttachEntry(store.EntryFill{
		Symbol: "AAPL", Broker: "webull", OrderID: "w2", Qty: 4,
		Price: store.Ptr(12.0), EntryDate: "2026-09-01",
	}); err != nil {
		t.Fatal(err)
	}

	e.recordExitFill("AAPL", "x-exit", "webull", "2026-09-01", 4, 11, nil, orderMeta{})
	p2, err := db.OpenPositionBySymbol("AAPL")
	if err != nil {
		t.Fatal(err)
	}
	if p2 == nil {
		t.Fatal("the re-entry was closed by a replay of the previous exit")
	}
	if p2.Webull.ExitOrderID != "" || p2.Webull.Qty != 4 {
		t.Fatalf("re-entry leg = %+v; the replay must not touch it", p2.Webull)
	}
}
