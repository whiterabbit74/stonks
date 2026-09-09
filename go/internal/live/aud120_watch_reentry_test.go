package live

import (
	"testing"

	"mktorder.com/go/internal/store"
)

// AUD-120: the watch card is a cache of the journal, but it was refreshed only
// when the isOpenPosition flag changed. A same-day re-entry keeps the flag and
// changes the position, so the card kept showing the closed trade's id, price
// and entry date.
func TestWatchCardFollowsTheNewPosition(t *testing.T) {
	db, e, _ := testEngine(t, nil)
	if err := db.SavePosition(store.Position{
		ID: "p1", Symbol: "AAPL", Status: "open", Quantity: 4, EntryDate: "2026-09-01",
		EntryPrice: store.Ptr(10.0), Webull: store.BrokerLeg{Qty: 4, EntryOrderID: "w1"},
	}); err != nil {
		t.Fatal(err)
	}
	e.UpdatePositions()

	if _, err := db.ClosePosition("p1", store.PositionExit{Date: "2026-09-01", Price: 11}); err != nil {
		t.Fatal(err)
	}
	if err := db.SavePosition(store.Position{
		ID: "p2", Symbol: "AAPL", Status: "open", Quantity: 4, EntryDate: "2026-09-01",
		EntryPrice: store.Ptr(20.0), Webull: store.BrokerLeg{Qty: 4, EntryOrderID: "w2"},
	}); err != nil {
		t.Fatal(err)
	}
	e.UpdatePositions()

	watches, err := db.ListWatches()
	if err != nil || len(watches) == 0 {
		t.Fatal(err)
	}
	w := watches[0]
	if w["currentTradeId"] != "p2" || asFloat(w["entryPrice"]) != 20 {
		t.Fatalf("watch card = %v/%v; want the open position p2 at 20", w["currentTradeId"], w["entryPrice"])
	}
}
