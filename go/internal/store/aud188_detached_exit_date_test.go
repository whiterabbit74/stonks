package store

import "testing"

// AUD-188: both brokers entered on the 20th, Webull sold on the 21st while
// Robinhood kept holding, Webull re-entered on the 22nd. The finished Webull
// round carved out at the re-entry was stamped with the re-entry date: an
// exit on the 22nd at the price of the 21st.
func TestDetachedLegKeepsItsOwnExitDate(t *testing.T) {
	db := openTestDB(t)
	buy := func(broker, id, date string) {
		t.Helper()
		if _, err := db.AttachEntry(EntryFill{Symbol: "AAPL", Broker: broker, OrderID: id, Qty: 1,
			Price: Ptr(10.0), EntryDate: date, Source: "test_buy", IsTest: true}); err != nil {
			t.Fatal(err)
		}
	}
	buy("webull", "w1", "2026-10-20")
	buy("robinhood", "r1", "2026-10-20")
	if err := db.SaveOrderTracker(Tracker{
		ClientOrderID: "ws1", Symbol: "AAPL", Action: "exit", Status: "submitted",
		Quantity: 1, Source: "test_sell", DateKey: "2026-10-21", Broker: "webull",
	}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := db.ExitLeg("w1", "webull", "ws1", 1, PositionExit{Date: "2026-10-21", Price: 11}); err != nil {
		t.Fatal(err)
	}
	buy("webull", "w2", "2026-10-22")

	list, err := db.ListPositions()
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, p := range list {
		if p.Status != "closed" {
			continue
		}
		found = true
		if p.EntryDate != "2026-10-20" || p.ExitDate != "2026-10-21" || p.HoldingDays == nil || *p.HoldingDays != 1 {
			t.Fatalf("closed part %s→%s holding %v, want 2026-10-20→2026-10-21, 1 day", p.EntryDate, p.ExitDate, p.HoldingDays)
		}
	}
	if !found {
		t.Fatal("finished Webull round not carved out")
	}
}
