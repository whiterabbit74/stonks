package live

// The split of a partial exit into a closed part is how a test row — the kind
// that lives by its fills — records it; the monitoring's row only shrinks its
// leg (store/monitor_position_test.go).

import (
	"fmt"
	"path/filepath"
	"testing"

	"mktorder.com/go/internal/store"
)

// CORE-04: одно и то же частичное исполнение, применённое дважды (перезапуск
// между записью сделки и фиксацией статуса трекера), списывало акции дважды.
func TestPartialFillReplayDoesNotReduceTwice(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := New(db, &MemoryQuotes{})
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.Now = nearCloseNow()
	if err := db.SavePosition(store.Position{ID: "wb-aapl", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-20", EntryPrice: store.Ptr[float64](10.0), Quantity: 10.0, IsTest: true, Webull: store.BrokerLeg{Qty: 10.0, EntryPrice: store.Ptr[float64](10.0)}}); err != nil {
		t.Fatal(err)
	}
	tracker := store.Tracker{
		ClientOrderID: "x-exit", Symbol: "AAPL", Action: "exit", Status: "submitted",
		Quantity: 10.0, Source: "telegram_t1", DateKey: "2026-09-01", Broker: "webull",
	}
	if err := db.SaveOrderTracker(tracker); err != nil {
		t.Fatal(err)
	}
	detail := map[string]any{"status": "PARTIAL_FILLED", "filled_qty": 4.0, "filled_price": 11.0}

	e.recordFill(tracker, od(detail), "partially_filled")
	e.recordFill(tracker, od(detail), "partially_filled")

	rows, err := db.ListPositions()
	if err != nil {
		t.Fatal(err)
	}
	var open, closed float64
	for _, r := range rows {
		if fmt.Sprint(r.Status) == "open" {
			open += r.Quantity
		} else {
			closed += r.Quantity
		}
	}
	if open != 6 || closed != 4 {
		t.Fatalf("one fill of 4 out of 10 must leave 6 open and 4 closed, got open=%v closed=%v rows=%+v", open, closed, rows)
	}
}

// Догоняющее исполнение по той же заявке списывает только новую часть.
func TestSecondPartialFillRecordsOnlyTheDifference(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := New(db, &MemoryQuotes{})
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.Now = nearCloseNow()
	if err := db.SavePosition(store.Position{ID: "wb-aapl", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-20", EntryPrice: store.Ptr[float64](10.0), Quantity: 10.0, IsTest: true, Webull: store.BrokerLeg{Qty: 10.0, EntryPrice: store.Ptr[float64](10.0)}}); err != nil {
		t.Fatal(err)
	}
	tracker := store.Tracker{
		ClientOrderID: "x-exit", Symbol: "AAPL", Action: "exit", Status: "submitted",
		Quantity: 10.0, Source: "telegram_t1", DateKey: "2026-09-01", Broker: "webull",
	}
	if err := db.SaveOrderTracker(tracker); err != nil {
		t.Fatal(err)
	}
	e.recordFill(tracker, od(map[string]any{"status": "PARTIAL_FILLED", "filled_qty": 4.0, "filled_price": 11.0}), "partially_filled")
	e.recordFill(tracker, od(map[string]any{"status": "PARTIAL_FILLED", "filled_qty": 7.0, "filled_price": 11.0}), "partially_filled")

	rows, err := db.ListPositions()
	if err != nil {
		t.Fatal(err)
	}
	var open, closed float64
	for _, r := range rows {
		if fmt.Sprint(r.Status) == "open" {
			open += r.Quantity
		} else {
			closed += r.Quantity
		}
	}
	if open != 3 || closed != 7 {
		t.Fatalf("4 then 7 of 10 must leave 3 open and 7 closed, got open=%v closed=%v", open, closed)
	}
}
