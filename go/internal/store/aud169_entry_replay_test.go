package store

import "testing"

func saveEntryTracker(t *testing.T, db *DB, id string, qty float64) {
	t.Helper()
	if err := db.SaveOrderTracker(map[string]any{
		"clientOrderId": id, "symbol": "AAPL", "action": "entry", "status": "submitted",
		"quantity": qty, "source": "t1", "dateKey": "2026-09-01", "broker": "webull",
	}); err != nil {
		t.Fatal(err)
	}
}

// AUD-169: the BUY fill was journaled, the tracker stamp failed, the position
// was closed, and the next poll replayed the BUY. AttachEntry looked only at
// open rows, found none and wrote the old fill over the closed row by id —
// exit price and P&L gone — or into the next entry of the ticker.
func TestEntryReplayAfterCloseBooksNothing(t *testing.T) {
	db := openTestDB(t)
	saveEntryTracker(t, db, "b1", 1)
	b1 := EntryFill{Symbol: "AAPL", Broker: "webull", OrderID: "b1", Qty: 1, Price: Ptr(10.0), EntryDate: "2026-09-01"}
	if _, err := db.AttachEntry(b1); err != nil {
		t.Fatal(err)
	}
	if _, _, err := db.ExitLeg("b1", "webull", "s1", 1, PositionExit{Date: "2026-09-02", Price: 11}); err != nil {
		t.Fatal(err)
	}

	if _, err := db.AttachEntry(b1); err != nil {
		t.Fatal(err)
	}
	closed, err := db.GetPosition("b1")
	if err != nil || closed == nil || closed.Status != "closed" || closed.PnLAbsolute == nil || *closed.PnLAbsolute != 1 {
		t.Fatalf("replay rewrote the closed row: %+v err %v", closed, err)
	}
	if open, err := db.OpenPositionBySymbol("AAPL"); err != nil || open != nil {
		t.Fatalf("replay opened a position: %+v err %v", open, err)
	}

	saveEntryTracker(t, db, "b2", 2)
	if _, err := db.AttachEntry(EntryFill{Symbol: "AAPL", Broker: "webull", OrderID: "b2", Qty: 2, Price: Ptr(20.0), EntryDate: "2026-09-03"}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.AttachEntry(b1); err != nil {
		t.Fatal(err)
	}
	open, err := db.OpenPositionBySymbol("AAPL")
	if err != nil || open == nil || open.Webull.Qty != 2 || open.Webull.EntryOrderID != "b2" || *open.Webull.EntryPrice != 20 {
		t.Fatalf("replay leaked into the next entry: %+v err %v", open, err)
	}
}

// AUD-180: two separate buys of one share each, the second after the first
// tracker finished. max(1, 1) left one share in the journal at the second
// price while the broker held two.
func TestSeparateEntryOrdersAddUp(t *testing.T) {
	db := openTestDB(t)
	saveEntryTracker(t, db, "t1", 1)
	saveEntryTracker(t, db, "t2", 1)
	f1 := EntryFill{Symbol: "AAPL", Broker: "webull", OrderID: "t1", Qty: 1, Price: Ptr(10.0), EntryDate: "2026-09-01", Source: "test_buy", IsTest: true}
	f2 := f1
	f2.OrderID, f2.Price = "t2", Ptr(12.0)
	for _, f := range []EntryFill{f1, f2, f1, f2} { // the last two are replays
		if _, err := db.AttachEntry(f); err != nil {
			t.Fatal(err)
		}
	}
	p, err := db.OpenPositionBySymbol("AAPL")
	if err != nil || p == nil {
		t.Fatalf("open position = %v, %v", p, err)
	}
	if p.Webull.Qty != 2 || p.Quantity != 2 || *p.Webull.EntryPrice != 11 || *p.EntryPrice != 11 {
		t.Fatalf("two buys booked as %+v leg %+v, want 2 shares at 11", p, p.Webull)
	}

	// A second buy whose price is not confirmed leaves the average unknown.
	saveEntryTracker(t, db, "t3", 1)
	if _, err := db.AttachEntry(EntryFill{Symbol: "AAPL", Broker: "webull", OrderID: "t3", Qty: 1, EntryDate: "2026-09-01", IsTest: true}); err != nil {
		t.Fatal(err)
	}
	p, _ = db.OpenPositionBySymbol("AAPL")
	if p.Webull.Qty != 3 || p.Webull.EntryPrice != nil || p.EntryPrice != nil {
		t.Fatalf("unconfirmed third buy: %+v leg %+v, want 3 shares, price NULL", p, p.Webull)
	}
}

// One order reported in parts is the same shares counted again, not new
// ones: the leg follows its cumulative quantity and average price, with or
// without a tracker to claim against.
func TestSameEntryOrderGrowsToItsCumulativeFill(t *testing.T) {
	for _, tracked := range []bool{true, false} {
		db := openTestDB(t)
		if tracked {
			saveEntryTracker(t, db, "o1", 10)
		}
		f := EntryFill{Symbol: "AAPL", Broker: "webull", OrderID: "o1", Qty: 4, Price: Ptr(10.0), EntryDate: "2026-09-01"}
		if _, err := db.AttachEntry(f); err != nil {
			t.Fatal(err)
		}
		f.Qty, f.Price = 10, Ptr(10.5)
		for i := 0; i < 2; i++ {
			if _, err := db.AttachEntry(f); err != nil {
				t.Fatal(err)
			}
		}
		p, _ := db.OpenPositionBySymbol("AAPL")
		if p == nil || p.Webull.Qty != 10 || *p.Webull.EntryPrice != 10.5 || *p.EntryPrice != 10.5 {
			t.Fatalf("tracked=%v: %+v leg %+v, want 10 shares at 10.5", tracked, p, p.Webull)
		}
	}
}

// A row booked before entries claimed against their tracker: the replay of
// its order still books nothing, and the claim is set from then on.
func TestLegacyEntryReplayBooksNothing(t *testing.T) {
	db := openTestDB(t)
	if err := db.SavePosition(Position{
		ID: "b1", Symbol: "AAPL", Status: "open", Quantity: 3, EntryDate: "2026-09-01", EntryPrice: Ptr(10.0),
		Webull: BrokerLeg{Qty: 3, EntryPrice: Ptr(10.0), EntryOrderID: "b1"},
	}); err != nil {
		t.Fatal(err)
	}
	saveEntryTracker(t, db, "b1", 3)
	if _, err := db.AttachEntry(EntryFill{Symbol: "AAPL", Broker: "webull", OrderID: "b1", Qty: 3, Price: Ptr(10.0), EntryDate: "2026-09-01"}); err != nil {
		t.Fatal(err)
	}
	if p, _ := db.GetPosition("b1"); p.Webull.Qty != 3 {
		t.Fatalf("legacy replay changed the leg: %+v", p.Webull)
	}
	if got := db.RecordedFillQty("b1"); got != 3 {
		t.Fatalf("recorded_qty = %v, want 3", got)
	}
}
