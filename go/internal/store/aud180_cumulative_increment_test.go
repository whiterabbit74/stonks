package store

import (
	"math"
	"testing"
)

// AUD-180 (reopened): the leg holds order A and part of order B, and B
// reports a larger cumulative fill. The new shares cost what B's cumulative
// cost grew by, not B's whole average: A=10@100, B 2@120 then 4@130 is
// (1000 + 4×130) / 14 = 108.571429, not (1240 + 2×130) / 14.
func TestCumulativeFillOfSecondOrderPricesOnlyItsIncrement(t *testing.T) {
	db := openTestDB(t)
	saveEntryTracker(t, db, "a", 10)
	saveEntryTracker(t, db, "b", 4)
	fill := func(id string, qty, price float64) *Position {
		t.Helper()
		p, err := db.AttachEntry(EntryFill{Symbol: "AAPL", Broker: "webull", OrderID: id, Qty: qty,
			Price: Ptr(price), EntryDate: "2026-09-01", Source: "test_buy", IsTest: true})
		if err != nil {
			t.Fatal(err)
		}
		return p
	}
	fill("a", 10, 100)
	fill("b", 2, 120)
	want := (1000.0 + 4*130) / 14
	for i := 0; i < 2; i++ { // the second is an identical replay
		p := fill("b", 4, 130)
		if p == nil || p.Webull.Qty != 14 || p.Webull.EntryPrice == nil || math.Abs(*p.Webull.EntryPrice-want) > 1e-6 {
			t.Fatalf("pass %d: leg %+v, want 14 shares at %.6f", i, p.Webull, want)
		}
	}
}
