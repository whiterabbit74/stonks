package store

import (
	"errors"
	"testing"
)

// The monitoring's position (CORE §3, invariants I and K): the signal opens and
// closes it at the T-1 prices, and a broker fill only writes its own leg — on
// the open row, or on the row the signal closed that same trading day.
func TestMonitorPositionLivesBySignalAndLegsByFills(t *testing.T) {
	db := openTestDB(t)
	p, err := db.OpenMonitorPosition(Position{ID: "m1", Symbol: "aapl", EntryDate: "2026-09-01", EntryPrice: Ptr(10.0), EntryIBS: Ptr(0.05)})
	if err != nil || p.Source != SourceMonitor || p.Symbol != "AAPL" {
		t.Fatalf("open: %+v %v", p, err)
	}
	if _, err := db.OpenMonitorPosition(Position{ID: "m2", Symbol: "MSFT", EntryDate: "2026-09-01"}); !errors.Is(err, ErrMonitorPositionOpen) {
		t.Fatalf("a second monitoring position must be refused, got %v", err)
	}

	// The broker fills at its own price; the signal price stays the row's.
	if _, err := db.AttachEntry(EntryFill{Symbol: "AAPL", Broker: "webull", OrderID: "b1", Qty: 3, Price: Ptr(10.4), EntryDate: "2026-09-01"}); err != nil {
		t.Fatal(err)
	}
	p, _ = db.GetPosition("m1")
	if *p.EntryPrice != 10 || p.Webull.Qty != 3 || *p.Webull.EntryPrice != 10.4 {
		t.Fatalf("signal price must stay, the fill goes to the leg: %+v / %+v", *p.EntryPrice, p.Webull)
	}

	// The signal closes the row before anybody sold: the leg still holds.
	closed, err := db.ClosePosition("m1", PositionExit{Date: "2026-09-03", Price: 11, IBS: Ptr(0.8)})
	if err != nil || closed.Status != "closed" || *closed.PnLPercent != 10 || closed.Webull.Qty != 3 {
		t.Fatalf("close by signal: %+v %v", closed, err)
	}

	// The sell of the same day finds that row and writes the leg only.
	row, err := db.ExitRowFor("AAPL", "webull", "2026-09-03")
	if err != nil || row == nil || row.ID != "m1" {
		t.Fatalf("the sell must find the row the signal closed today: %+v %v", row, err)
	}
	if err := db.SaveOrderTracker(map[string]any{"clientOrderId": "s1", "symbol": "AAPL", "action": "exit", "quantity": 3}); err != nil {
		t.Fatal(err)
	}
	after, booked, err := db.ExitLeg("m1", "webull", "s1", 3, PositionExit{Date: "2026-09-03", Price: 10.9})
	if err != nil || !booked || after.Webull.Qty != 0 || *after.Webull.ExitPrice != 10.9 || after.Webull.ExitOrderID != "s1" {
		t.Fatalf("leg exit: %+v booked=%v err=%v", after, booked, err)
	}
	if *after.ExitPrice != 11 || *after.PnLPercent != 10 {
		t.Fatalf("the fill must not touch the signal side: %+v", after)
	}

	// Another day the same ticker in a broker's book is in nobody's leg.
	if row, err := db.ExitRowFor("AAPL", "webull", "2026-09-04"); err != nil || row != nil {
		t.Fatalf("an old position must not take a later sell: %+v %v", row, err)
	}
}

// A leg left unsold on the exit day is still the position's: the next
// clearing of the account sells it into that leg, days later. A row from
// before source=monitor keeps the old same-day rule (CORE §14.2, §14.5).
func TestUnsoldLegIsFoundAfterItsExitDay(t *testing.T) {
	db := openTestDB(t)
	if _, err := db.OpenMonitorPosition(Position{ID: "m1", Symbol: "AAPL", EntryDate: "2026-09-01", EntryPrice: Ptr(10.0),
		Webull: BrokerLeg{Qty: 3, EntryOrderID: "b1"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ClosePosition("m1", PositionExit{Date: "2026-09-03", Price: 11}); err != nil {
		t.Fatal(err)
	}
	if err := db.SavePosition(Position{ID: "old", Symbol: "MSFT", Status: "closed", Source: "manual",
		EntryDate: "2026-08-01", ExitDate: "2026-08-05", Webull: BrokerLeg{Qty: 2}}); err != nil {
		t.Fatal(err)
	}
	if row, err := db.ExitRowFor("AAPL", "webull", "2026-09-10"); err != nil || row == nil || row.ID != "m1" {
		t.Fatalf("a later sell belongs to the unsold leg: %+v %v", row, err)
	}
	if err := db.SaveOrderTracker(map[string]any{"clientOrderId": "s1", "symbol": "AAPL", "action": "exit", "quantity": 3}); err != nil {
		t.Fatal(err)
	}
	after, booked, err := db.ExitLeg("m1", "webull", "s1", 3, PositionExit{Date: "2026-09-10", Price: 9.5})
	if err != nil || !booked || after.Webull.Qty != 0 || *after.Webull.ExitPrice != 9.5 || *after.ExitPrice != 11 {
		t.Fatalf("the leg takes the sell, the signal side stays: %+v booked=%v err=%v", after, booked, err)
	}
	if row, err := db.ExitRowFor("MSFT", "webull", "2026-09-10"); err != nil || row != nil {
		t.Fatalf("a pre-monitor row takes no later sell: %+v %v", row, err)
	}
}

// A partial sell shrinks the leg of the monitoring's row by the new part; the
// row is not split, its P&L is the signal's.
func TestMonitorPositionPartialSellShrinksTheLeg(t *testing.T) {
	db := openTestDB(t)
	if _, err := db.OpenMonitorPosition(Position{ID: "m1", Symbol: "AAPL", EntryDate: "2026-09-01", EntryPrice: Ptr(10.0),
		Webull: BrokerLeg{Qty: 5, EntryOrderID: "b1"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ClosePosition("m1", PositionExit{Date: "2026-09-03", Price: 11}); err != nil {
		t.Fatal(err)
	}
	if err := db.SaveOrderTracker(map[string]any{"clientOrderId": "s1", "symbol": "AAPL", "action": "exit", "quantity": 5}); err != nil {
		t.Fatal(err)
	}
	for _, filled := range []float64{2, 2} { // the same answer twice: booked once
		if _, err := db.ClaimPartialExit("s1", "m1", "webull", filled, PositionExit{Date: "2026-09-03", Price: 10.8}); err != nil {
			t.Fatal(err)
		}
	}
	rows, _ := db.ListPositions()
	if len(rows) != 1 || rows[0].Webull.Qty != 3 || *rows[0].Webull.ExitPrice != 10.8 {
		t.Fatalf("want one row with 3 unsold: %+v", rows)
	}
}
