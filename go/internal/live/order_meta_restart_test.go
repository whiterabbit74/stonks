package live

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
)

// Метаданные заявки (correlationId, IBS решения, котировка) живут в трекере, а
// не в памяти процесса: перезапуск между отправкой и исполнением не рвёт
// цепочку в логе и не оставляет exit_ibs пустым.
func TestOrderMetaSurvivesRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "t.db")
	db, err := store.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.SavePosition(store.Position{
		ID: "p", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-20",
		EntryPrice: store.Ptr(10.0), Quantity: 10, IsTest: true, // lives by its fills
		Webull: store.BrokerLeg{Qty: 10, EntryPrice: store.Ptr(10.0)},
	}); err != nil {
		t.Fatal(err)
	}
	now := func() time.Time { return time.Date(2026, 9, 1, 19, 59, 0, 0, time.UTC) }

	// Процесс до перезапуска: заявка отправлена и записана, исполнения ещё нет.
	before := New(db, &MemoryQuotes{})
	before.Broker, before.Telegram, before.Now = nil, &MemoryTelegram{}, now
	before.startTracking(OrderResult{Submitted: true, ClientOrderID: "x-exit"}, orderMeta{
		CorrelationID: "corr-1", IBS: 0.8, DateKey: "2026-09-01", QuotePrice: 11,
		Action: "exit", Symbol: "AAPL", Quantity: 10, Source: "telegram_t1", Broker: "webull",
	})

	// Новый процесс на той же базе получает исполнение.
	after := New(db, &MemoryQuotes{})
	br := &MemoryBroker{Name: "webull"}
	br.SetDetail("x-exit", map[string]any{"status": "FILLED", "filled_qty": 10.0, "filled_price": 11.0})
	after.Broker, after.Telegram, after.ChatID, after.Now = br, &MemoryTelegram{}, "c", now
	after.Sleep = func(time.Duration) {}
	after.PollTrackers()

	p, err := db.GetPosition("p")
	if err != nil || p == nil {
		t.Fatalf("position: %+v %v", p, err)
	}
	if p.Status != "closed" || p.ExitIBS == nil || *p.ExitIBS != 0.8 {
		t.Fatalf("exit after restart: status=%s exit_ibs=%v, want closed at 0.8", p.Status, p.ExitIBS)
	}
	logs, err := db.ListAutotradeLogs(50)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range logs {
		if msg, _ := row["message"].(string); strings.Contains(msg, "event=local_trade_recorded") {
			if !strings.Contains(msg, "correlationId=corr-1") {
				t.Fatalf("fill log lost the correlation id: %s", msg)
			}
			return
		}
	}
	t.Fatal("no local_trade_recorded log")
}
