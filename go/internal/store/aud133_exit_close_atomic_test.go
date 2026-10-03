package store

import "testing"

// AUD-133: the leg write and the close commit together, and an open row left
// with a flat leg by a crash before the fix is closed when the fill replays.
func TestExitLegClosesFlatPositionAtomically(t *testing.T) {
	db := openTestDB(t)
	for _, id := range []string{"w-exit", "z-exit"} {
		if err := db.SaveOrderTracker(map[string]any{
			"clientOrderId": id, "symbol": "AAPL", "action": "exit", "status": "working",
			"quantity": 4.0, "dateKey": "2026-09-02", "startedAt": "2026-09-02T19:59:00Z",
		}); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.SavePosition(Position{
		ID: "p1", Symbol: "AAPL", Status: "open", Quantity: 4, EntryDate: "2026-09-01", EntryPrice: Ptr(10.0),
		Webull: BrokerLeg{Qty: 4, EntryPrice: Ptr(10.0), EntryOrderID: "w1"},
	}); err != nil {
		t.Fatal(err)
	}
	p, booked, err := db.ExitLeg("p1", "webull", "w-exit", 4, PositionExit{Date: "2026-09-02", Price: 11})
	if err != nil || !booked || p.Status != "closed" || p.PnLAbsolute == nil || *p.PnLAbsolute != 4 {
		t.Fatalf("exit: %+v booked=%v err=%v", p, booked, err)
	}

	// Zombie: claim and flat leg committed, close never happened.
	if err := db.SavePosition(Position{
		ID: "p2", Symbol: "MSFT", Status: "open", Quantity: 4, EntryDate: "2026-09-01", EntryPrice: Ptr(10.0),
		Webull: BrokerLeg{Qty: 0, EntryPrice: Ptr(10.0), EntryOrderID: "w2", ExitOrderID: "z-exit", ExitPrice: Ptr(12.0)},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ClaimFillQty("z-exit", 4); err != nil {
		t.Fatal(err)
	}
	p, booked, err = db.ExitLeg("p2", "webull", "z-exit", 4, PositionExit{Date: "2026-09-02", Price: 12})
	if err != nil || !booked || p.Status != "closed" || p.ExitDate != "2026-09-02" {
		t.Fatalf("replay: %+v booked=%v err=%v", p, booked, err)
	}
	// A further replay of a closed row writes nothing.
	if _, booked, err = db.ExitLeg("p2", "webull", "z-exit", 4, PositionExit{Date: "2026-09-03", Price: 13}); err != nil || booked {
		t.Fatalf("second replay booked=%v err=%v", booked, err)
	}
}
