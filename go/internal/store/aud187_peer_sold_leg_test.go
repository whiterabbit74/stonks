package store

import "testing"

// AUD-187: Webull and Robinhood each bought 1, Webull sold its share while
// Robinhood kept holding, then Robinhood bought 1 more. Quantity was reset to
// what the legs still hold (2) and forgot Webull's sold share, so the later
// re-entry of Webull had nothing to carve out and its finished round was gone.
func TestPeerBuyKeepsTheSoldLegQuantity(t *testing.T) {
	db := openTestDB(t)
	buy := func(broker, id string, price float64, date string) {
		t.Helper()
		if _, err := db.AttachEntry(EntryFill{Symbol: "AAPL", Broker: broker, OrderID: id, Qty: 1,
			Price: Ptr(price), EntryDate: date, Source: "test_buy", IsTest: true}); err != nil {
			t.Fatal(err)
		}
	}
	buy("webull", "w1", 10, "2026-10-20")
	buy("robinhood", "r1", 10, "2026-10-20")
	if _, _, err := db.ExitLeg("w1", "webull", "ws1", 1, PositionExit{Date: "2026-10-21", Price: 11}); err != nil {
		t.Fatal(err)
	}
	buy("robinhood", "r2", 12, "2026-10-21")
	p, _ := db.GetPosition("w1")
	if p == nil || p.Status != "open" || p.Quantity != 3 || p.Robinhood.Qty != 2 {
		t.Fatalf("after the peer buy: %+v, want Quantity 3 (1 sold by Webull + 2 held by Robinhood)", p)
	}

	buy("webull", "w2", 13, "2026-10-22")
	list, err := db.ListPositions()
	if err != nil {
		t.Fatal(err)
	}
	var closedQty, openQty float64
	for _, row := range list {
		if row.Status == "closed" {
			closedQty += row.Quantity
			if row.Webull.ExitOrderID != "ws1" || row.Webull.Holds() {
				t.Fatalf("closed part does not carry the Webull round: %+v", row)
			}
		} else {
			openQty += row.Quantity
		}
	}
	if closedQty != 1 || openQty != 3 {
		t.Fatalf("closed %v + open %v shares, want 1 + 3 of the 4 bought", closedQty, openQty)
	}
}
