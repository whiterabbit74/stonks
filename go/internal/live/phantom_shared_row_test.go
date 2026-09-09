package live

import (
	"testing"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

// An order the broker says never existed used to delete the whole position
// row. The row is shared between the brokers now, so deleting it would throw
// away the peer's real execution: only the phantom leg goes.
func TestPhantomEntryKeepsPeerLeg(t *testing.T) {
	_, e, _ := testEngine(t, []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 9, Volume: 1}})
	if err := e.DB.SavePosition(store.Position{
		ID: "w-1", Symbol: "MSFT", Status: "open", EntryDate: "2026-09-01", Quantity: 5,
		Webull:    store.BrokerLeg{Qty: 2, EntryOrderID: "w-1"},
		Robinhood: store.BrokerLeg{Qty: 3, EntryOrderID: "rh-9", EntryPrice: store.Ptr[float64](10)},
	}); err != nil {
		t.Fatal(err)
	}
	e.deletePhantom("w-1", "MSFT", "webull")

	p, err := e.DB.GetPosition("w-1")
	if err != nil {
		t.Fatal(err)
	}
	if p == nil {
		t.Fatal("position deleted: the robinhood execution went with it")
	}
	if p.Robinhood.Qty != 3 || p.Robinhood.EntryOrderID != "rh-9" {
		t.Fatalf("robinhood leg damaged: %+v", p.Robinhood)
	}
	if p.Webull.Executed() {
		t.Fatalf("phantom webull leg kept: %+v", p.Webull)
	}
	if p.Quantity != 3 {
		t.Fatalf("quantity %v, want 3", p.Quantity)
	}
}

// With nothing else in the row, the phantom position still goes away whole.
func TestPhantomEntryAloneDeletesRow(t *testing.T) {
	_, e, _ := testEngine(t, []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 9, Volume: 1}})
	if err := e.DB.SavePosition(store.Position{
		ID: "w-1", Symbol: "MSFT", Status: "open", EntryDate: "2026-09-01",
		Quantity: 2, Webull: store.BrokerLeg{Qty: 2, EntryOrderID: "w-1"},
	}); err != nil {
		t.Fatal(err)
	}
	e.deletePhantom("w-1", "MSFT", "webull")
	p, _ := e.DB.GetPosition("w-1")
	if p != nil {
		t.Fatalf("phantom row survived: %+v", p)
	}
}
