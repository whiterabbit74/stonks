package live

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
	if err := db.SavePosition(store.Position{ID: "wb-aapl", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-20", EntryPrice: store.Ptr[float64](10.0), Quantity: 10.0, Webull: store.BrokerLeg{Qty: 10.0, EntryPrice: store.Ptr[float64](10.0)}}); err != nil {
		t.Fatal(err)
	}
	tracker := map[string]any{
		"clientOrderId": "x-exit", "symbol": "AAPL", "action": "exit", "status": "submitted",
		"quantity": 10.0, "source": "telegram_t1", "dateKey": "2026-09-01", "broker": "webull",
	}
	if err := db.SaveOrderTracker(tracker); err != nil {
		t.Fatal(err)
	}
	detail := map[string]any{"status": "PARTIAL_FILLED", "filled_qty": 4.0, "filled_price": 11.0}

	e.recordFill(tracker, detail, "partially_filled")
	e.recordFill(tracker, detail, "partially_filled")

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
	if err := db.SavePosition(store.Position{ID: "wb-aapl", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-20", EntryPrice: store.Ptr[float64](10.0), Quantity: 10.0, Webull: store.BrokerLeg{Qty: 10.0, EntryPrice: store.Ptr[float64](10.0)}}); err != nil {
		t.Fatal(err)
	}
	tracker := map[string]any{
		"clientOrderId": "x-exit", "symbol": "AAPL", "action": "exit", "status": "submitted",
		"quantity": 10.0, "source": "telegram_t1", "dateKey": "2026-09-01", "broker": "webull",
	}
	if err := db.SaveOrderTracker(tracker); err != nil {
		t.Fatal(err)
	}
	e.recordFill(tracker, map[string]any{"status": "PARTIAL_FILLED", "filled_qty": 4.0, "filled_price": 11.0}, "partially_filled")
	e.recordFill(tracker, map[string]any{"status": "PARTIAL_FILLED", "filled_qty": 7.0, "filled_price": 11.0}, "partially_filled")

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
