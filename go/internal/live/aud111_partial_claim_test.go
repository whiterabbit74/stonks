package live

import (
	"path/filepath"
	"testing"

	"mktorder.com/go/internal/store"
)

// AUD-111: подтверждение обработки частичного исполнения фиксировалось раньше
// самой записи в журнал. Сбой записи оставлял объём «уже разнесённым», и повтор
// того же ответа брокера не восстанавливал потерянное исполнение.
func TestPartialFillSurvivesJournalWriteFailure(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := New(db, &MemoryQuotes{})
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.Now = nearCloseNow()
	if err := db.SavePosition(store.Position{
		ID: "p", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-20",
		EntryPrice: store.Ptr(10.0), Quantity: 10,
		Webull: store.BrokerLeg{Qty: 10, EntryPrice: store.Ptr(10.0)},
	}); err != nil {
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

	if _, err := db.SQL.Exec(`CREATE TRIGGER audit_fail BEFORE INSERT ON positions
		BEGIN SELECT RAISE(ABORT, 'injected failure'); END`); err != nil {
		t.Fatal(err)
	}
	e.recordFill(tracker, detail, "partially_filled")
	if _, err := db.SQL.Exec(`DROP TRIGGER audit_fail`); err != nil {
		t.Fatal(err)
	}
	// Тот же ответ брокера приходит повторно — теперь он должен разнестись.
	e.recordFill(tracker, detail, "partially_filled")

	rows, err := db.ListPositions()
	if err != nil {
		t.Fatal(err)
	}
	var open, closed float64
	for _, r := range rows {
		if r.Status == "open" {
			open += r.Quantity
		} else {
			closed += r.Quantity
		}
	}
	if open != 6 || closed != 4 {
		t.Fatalf("исполнение 4 из 10 должно оставить 6 открытых и 4 закрытых, получено open=%v closed=%v rows=%+v", open, closed, rows)
	}

	// И не списаться дважды: третий тот же ответ ничего не меняет (CORE-04).
	e.recordFill(tracker, detail, "partially_filled")
	rows, err = db.ListPositions()
	if err != nil {
		t.Fatal(err)
	}
	open, closed = 0, 0
	for _, r := range rows {
		if r.Status == "open" {
			open += r.Quantity
		} else {
			closed += r.Quantity
		}
	}
	if open != 6 || closed != 4 {
		t.Fatalf("повтор исполнения списал акции второй раз: open=%v closed=%v", open, closed)
	}
}
