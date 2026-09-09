package store

import "testing"

// AUD-118: an exit order larger than the journalled quantity takes the whole
// remainder. The position closed, but the leg kept showing the shares it had
// just sold, with no exit price and no order id (invariant K.1).
func TestPartialExitCoveringTheRestFlattensTheLeg(t *testing.T) {
	db := openTestDB(t)
	if err := db.SavePosition(Position{
		ID: "p1", Symbol: "AAPL", Status: "open", Quantity: 4, EntryPrice: Ptr(10.0),
		Webull: BrokerLeg{Qty: 4, EntryPrice: Ptr(10.0), EntryOrderID: "w1"},
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.SaveOrderTracker(map[string]any{
		"clientOrderId": "w1-exit", "symbol": "AAPL", "action": "exit", "quantity": 10,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ClaimPartialExit("w1-exit", "p1", "webull", 4, 11, "2026-09-01"); err != nil {
		t.Fatal(err)
	}
	p, err := db.GetPosition("p1")
	if err != nil || p == nil {
		t.Fatal(err)
	}
	if p.Status != "closed" || p.Webull.Qty != 0 || p.Webull.ExitPrice == nil ||
		*p.Webull.ExitPrice != 11 || p.Webull.ExitOrderID != "w1-exit" {
		t.Fatalf("position = %s / leg %+v", p.Status, p.Webull)
	}
}

// The manual close has no order id to record, but a closed row must still not
// claim the broker is holding.
func TestManualCloseFlattensTheLeg(t *testing.T) {
	db := openTestDB(t)
	if err := db.SavePosition(Position{
		ID: "p1", Symbol: "AAPL", Status: "open", Quantity: 4, EntryPrice: Ptr(10.0),
		Webull: BrokerLeg{Qty: 4, EntryPrice: Ptr(10.0), EntryOrderID: "w1"},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ClosePosition("p1", PositionExit{Date: "2026-09-01", Price: 11}); err != nil {
		t.Fatal(err)
	}
	p, _ := db.GetPosition("p1")
	if p.Webull.Qty != 0 || p.Webull.ExitPrice == nil || *p.Webull.ExitPrice != 11 {
		t.Fatalf("leg = %+v", p.Webull)
	}
}
