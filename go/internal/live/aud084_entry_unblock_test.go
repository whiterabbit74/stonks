package live

import (
	"path/filepath"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

// AUD-084 в новой модели: мониторинг держит AAPL (автоторговля его не
// покупала — на счёте AAPL, купленный руками). Выход мониторинга очищает счёт,
// и в том же цикле, когда продажа подтверждена и книга пуста, брокер входит в
// новый сигнал (CORE §3.2).
func TestMonitorExitClearsAccountThenEntryBuys(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	exitBars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 11.9, Volume: 1}} // IBS ~0.98
	entryBars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.1, Volume: 1}} // IBS ~0.03
	_ = db.SaveDataset("AAPL", "AAPL", "", "", exitBars, false)
	_ = db.SaveDataset("MSFT", "MSFT", "", "", entryBars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.10, "highIBS": 0.75})
	_ = db.UpsertWatch(map[string]any{"symbol": "MSFT", "lowIBS": 0.10, "highIBS": 0.75})
	wb := &MemoryBroker{Name: "webull"}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": exitBars, "MSFT": entryBars}})
	e.AttachBroker("webull", wb)
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.Now = nearCloseNow()
	e.Sleep = func(time.Duration) {}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.10, "highIBS": 0.75,
		"allowNewEntries": true, "allowExits": true, "entryCapitalMode": "cash_100",
		"brokers": map[string]any{
			"webull": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})
	if _, err := db.OpenMonitorPosition(store.Position{ID: "m-aapl", Symbol: "AAPL", EntryDate: "2026-08-28", EntryPrice: store.Ptr(10.0)}); err != nil {
		t.Fatal(err)
	}
	wb.Acct = map[string]any{"cash_balance": 10000.0}
	wb.FillStatus = "FILLED"
	wb.FillPrice = 11.9
	wb.FillQty = 7
	holding := []any{map[string]any{"symbol": "AAPL", "quantity": 7.0}}
	wb.SetPos(holding)
	wb.OnPositions = func() []any {
		wb.mu.Lock()
		defer wb.mu.Unlock()
		if len(wb.Orders) > 0 {
			return []any{}
		}
		return holding
	}
	if _, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true}); err != nil {
		t.Fatal(err)
	}
	var sells, buys int
	for _, o := range wb.Orders {
		switch o.Side {
		case "SELL":
			sells++
		case "BUY":
			buys++
			if o.Symbol != "MSFT" {
				t.Fatalf("re-entry must pick the lowest IBS ticker, got %s", o.Symbol)
			}
		}
	}
	if sells != 1 {
		t.Fatalf("want exactly one exit, got %d: %+v", sells, wb.Orders)
	}
	if buys != 1 {
		t.Fatalf("the cleared account must take the new entry, got %d buys: %+v", buys, wb.Orders)
	}
}
