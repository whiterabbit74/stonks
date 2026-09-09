package store

import "testing"

// AUD-117: webull exits while robinhood still holds, so the row stays open. The
// same-day re-entry by webull used to be written into the leg that carried the
// recorded exit: the first round vanished from the journal and its realised
// P&L with it.
func TestReentryKeepsTheExitedRoundInTheJournal(t *testing.T) {
	db := openTestDB(t)
	if err := db.SavePosition(Position{
		ID: "p1", Symbol: "AAPL", Status: "open", Quantity: 8, EntryDate: "2026-09-01",
		EntryPrice: Ptr(10.0),
		Webull:     BrokerLeg{Qty: 4, EntryPrice: Ptr(10.0), EntryOrderID: "w1"},
		Robinhood:  BrokerLeg{Qty: 4, EntryPrice: Ptr(10.0), EntryOrderID: "r1"},
	}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := db.ExitLeg("p1", "webull", 11, "w1-exit", 4); err != nil {
		t.Fatal(err)
	}

	if _, err := db.AttachEntry(EntryFill{
		Symbol: "AAPL", Broker: "webull", OrderID: "w2", Qty: 4,
		Price: Ptr(12.0), EntryDate: "2026-09-01",
	}); err != nil {
		t.Fatal(err)
	}

	open, err := db.OpenPositionBySymbol("AAPL")
	if err != nil || open == nil {
		t.Fatalf("open position = %v, %v", open, err)
	}
	if open.Webull.ExitOrderID != "" || open.Webull.EntryOrderID != "w2" || *open.Webull.EntryPrice != 12 {
		t.Fatalf("re-entry leg = %+v; want a clean leg holding the new round", open.Webull)
	}
	if open.Robinhood.Qty != 4 {
		t.Fatalf("peer leg = %+v; the carve-out must not touch it", open.Robinhood)
	}

	all, err := db.ListPositions()
	if err != nil {
		t.Fatal(err)
	}
	var closed *Position
	for i, p := range all {
		if p.Status == "closed" {
			closed = &all[i]
		}
	}
	if closed == nil {
		t.Fatal("the exited round left no closed row in the journal")
	}
	if closed.Quantity != 4 || closed.Webull.ExitOrderID != "w1-exit" || *closed.Webull.ExitPrice != 11 {
		t.Fatalf("closed round = %+v / %+v", closed, closed.Webull)
	}
	if closed.PnLAbsolute == nil || *closed.PnLAbsolute != 4 {
		t.Fatalf("realised P&L = %v, want 4", closed.PnLAbsolute)
	}
}
