package live

import (
	"path/filepath"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

// CORE-01: оба брокера продали AAPL. Robinhood получил подтверждение и стоит
// плоским, заявка Webull ещё WORKING. Повторный вход Robinhood не должен
// ждать чужого исполнения.
func TestPendingPeerExitDoesNotBlockReentry(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	exitBars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 11.9, Volume: 1}}
	entryBars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.1, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", exitBars, false)
	_ = db.SaveDataset("MSFT", "MSFT", "", "", entryBars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.10, "highIBS": 0.75})
	_ = db.UpsertWatch(map[string]any{"symbol": "MSFT", "lowIBS": 0.10, "highIBS": 0.75})
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": exitBars, "MSFT": entryBars}})
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.Now = nearCloseNow()
	e.Sleep = func(time.Duration) { e.PollTrackers() }
	// Webull подтверждения не даёт: заявка остаётся в работе.
	wb := &MemoryBroker{Name: "webull", FillStatus: "WORKING", Acct: map[string]any{"cash_balance": 10000.0}}
	rh := &MemoryBroker{Name: "robinhood", FillStatus: "FILLED", FillPrice: 11.9, FillQty: 42,
		Acct: map[string]any{"cash_balance": 10000.0}}
	e.AttachBroker("webull", wb)
	e.AttachBroker("robinhood", rh)
	wb.SetPos([]any{map[string]any{"symbol": "AAPL", "quantity": 7.0}})
	rh.SetPos([]any{map[string]any{"symbol": "AAPL", "quantity": 42.0}})
	mustInsertBrokerTrade(t, e, "wb-aapl", "AAPL", "webull", "2026-08-20", 7)
	mustInsertBrokerTrade(t, e, "rh-aapl", "AAPL", "robinhood", "2026-08-20", 42)
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.10, "highIBS": 0.75, "entryCapitalMode": "cash_100",
		"allowNewEntries": true, "allowExits": true,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})
	if _, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true}); err != nil {
		t.Fatal(err)
	}
	sell, buy, sym := sidesOf(rh)
	if sell != 1 {
		t.Fatalf("Robinhood must exit once: %+v", rh.Orders)
	}
	if buy != 1 || sym != "MSFT" {
		t.Fatalf("Robinhood filled and flat, so its re-entry must not wait for Webull: %+v", rh.Orders)
	}
	if _, wbBuy, _ := sidesOf(wb); wbBuy != 0 {
		t.Fatalf("Webull's exit is still working, it must not enter: %+v", wb.Orders)
	}
}
