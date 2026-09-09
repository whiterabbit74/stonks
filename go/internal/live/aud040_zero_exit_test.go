package live

import (
	"path/filepath"
	"testing"

	"mktorder.com/go/internal/store"
)

// AUD-040: ответ брокера без цены исполнения закрывал позицию по нулю и
// записывал в журнал выдуманный убыток «минус весь вход». Неизвестная цена
// остаётся NULL, и PnL вместе с ней (CORE_TRADING_LOGIC §12).
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

	e.recordFill(map[string]any{
		"clientOrderId": "exit", "symbol": "AAPL", "action": "exit",
		"quantity": 10.0, "broker": "webull", "dateKey": "2026-09-01",
	}, map[string]any{"filled_qty": 10.0}, "filled")

	p, err := db.GetPosition("p")
	if err != nil {
		t.Fatal(err)
	}
	if p.Status != "closed" {
		t.Fatalf("позиция должна закрыться: %s", p.Status)
	}
	if p.ExitPrice != nil {
		t.Fatalf("цена выхода не подтверждена, ожидался NULL: %v", *p.ExitPrice)
	}
	if p.PnLAbsolute != nil || p.PnLPercent != nil {
		t.Fatalf("PnL без цены выхода должен быть NULL: abs=%v pct=%v", p.PnLAbsolute, p.PnLPercent)
	}
}
