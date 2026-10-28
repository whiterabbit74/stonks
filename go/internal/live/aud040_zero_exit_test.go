package live

import (
	"path/filepath"
	"testing"

	"mktorder.com/go/internal/store"
)

// AUD-040: ответ брокера без цены исполнения закрывал позицию по нулю и
// записывал в журнал выдуманный убыток «минус весь вход». Неизвестная цена
// остаётся NULL (CORE_TRADING_LOGIC, инвариант J).
func TestExitWithoutPriceLeavesPriceAndPnLUnknown(t *testing.T) {
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

	e.recordFill(store.Tracker{
		ClientOrderID: "exit", Symbol: "AAPL", Action: "exit",
		Quantity: 10.0, Broker: "webull", DateKey: "2026-09-01",
	}, od(map[string]any{"filled_qty": 10.0}), "filled")

	p, err := db.GetPosition("p")
	if err != nil {
		t.Fatal(err)
	}
	// The fill writes the leg only; the monitoring closes its row by signal.
	if p.Status != "open" || p.Webull.Qty != 0 || p.Webull.ExitOrderID != "exit" {
		t.Fatalf("продажа должна обнулить ногу и не трогать строку: %+v", p)
	}
	if p.Webull.ExitPrice != nil {
		t.Fatalf("цена исполнения не подтверждена, ожидался NULL: %v", *p.Webull.ExitPrice)
	}
}
