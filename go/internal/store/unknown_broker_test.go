package store

import "testing"

// A fill under a broker the journal has no leg for is an error, not Webull's
// leg: legColumn used to map every unknown name to webull and the fill landed
// on a broker that never made it.
func TestUnknownBrokerFillIsRefused(t *testing.T) {
	db := openTestDB(t)
	if _, err := db.AttachEntry(EntryFill{Symbol: "AAPL", Broker: "schwab", OrderID: "s1", Qty: 1, Price: Ptr(10.0), EntryDate: "2026-09-01", IsTest: true}); err == nil {
		t.Fatal("entry fill of an unknown broker accepted")
	}
	if p, _ := db.OpenPositionBySymbol("AAPL"); p != nil {
		t.Fatalf("unknown broker opened a row: %+v", p)
	}

	if _, err := db.AttachEntry(EntryFill{Symbol: "AAPL", Broker: "webull", OrderID: "w1", Qty: 2, Price: Ptr(10.0), EntryDate: "2026-09-01", IsTest: true}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := db.ExitLeg("w1", "schwab", "x1", 2, PositionExit{Date: "2026-09-02", Price: 11}); err == nil {
		t.Fatal("exit fill of an unknown broker accepted")
	}
	if _, err := db.ClaimPartialExit("x2", "w1", "schwab", 1, PositionExit{Date: "2026-09-02", Price: 11}); err == nil {
		t.Fatal("partial exit of an unknown broker accepted")
	}
	if _, err := db.ExitRowFor("AAPL", "schwab", "2026-09-02"); err == nil {
		t.Fatal("exit row looked up for an unknown broker")
	}
	p, _ := db.GetPosition("w1")
	if p == nil || p.Webull.Qty != 2 || p.Webull.ExitOrderID != "" || p.Status != "open" {
		t.Fatalf("webull leg touched by an unknown broker: %+v", p)
	}
}
