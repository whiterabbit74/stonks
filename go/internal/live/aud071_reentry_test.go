package live

import (
	"path/filepath"
	"sync"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

// Выход и повторный вход в один день, в одну минуту. Лента позиций брокера
// обновляется не мгновенно: сразу после fill /account/positions ещё отдаёт
// проданные акции, и второй проход отвечал broker_position_exists —
// повторный вход терялся (AUD-071).
func TestSameDayReentryWaitsForStaleBrokerBook(t *testing.T) {
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
	wb.SetPos([]any{map[string]any{"symbol": "AAPL", "quantity": 7.0}})
	wb.Acct = map[string]any{"cash_balance": 10000.0}
	mustInsertBrokerTrade(t, e, "wb-aapl", "AAPL", "webull", "2026-08-20", 7)
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.10, "highIBS": 0.75,
		"allowNewEntries": true, "allowExits": true, "entryCapitalMode": "cash_100",
		"brokers": map[string]any{
			"webull": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})
	// Заявка исполняется сразу, но лента позиций отстаёт: после SELL она
	// отдаёт проданные акции ещё два чтения.
	e.Sleep = func(time.Duration) {}
	wb.FillStatus = "FILLED"
	wb.FillPrice = 11.9
	wb.FillQty = 7
	holding := []any{map[string]any{"symbol": "AAPL", "quantity": 7.0}}
	var lagMu sync.Mutex
	stale := 2
	wb.OnPositions = func() []any {
		wb.mu.Lock()
		sold := len(wb.Orders) > 0
		wb.mu.Unlock()
		if !sold {
			return holding
		}
		lagMu.Lock()
		defer lagMu.Unlock()
		if stale > 0 {
			stale--
			return holding
		}
		return []any{}
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
		t.Fatalf("same-day re-entry must go out after the exit filled, got %d buys: %+v", buys, wb.Orders)
	}
}

// Крайний случай: лента позиций так и не догнала fill. Второй проход обязан
// не отправлять вторую продажу тех же акций — вход при этом просто не
// открывается, это безопасный исход.
func TestStaleBrokerBookNeverClearsDoesNotSellTwice(t *testing.T) {
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
	wb := &MemoryBroker{Name: "webull"}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": exitBars, "MSFT": entryBars}})
	e.AttachBroker("webull", wb)
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.Now = nearCloseNow()
	e.Sleep = func(time.Duration) {}
	wb.Acct = map[string]any{"cash_balance": 10000.0}
	wb.FillStatus = "FILLED"
	wb.FillPrice = 11.9
	wb.FillQty = 7
	wb.SetPos([]any{map[string]any{"symbol": "AAPL", "quantity": 7.0}})
	mustInsertBrokerTrade(t, e, "wb-aapl", "AAPL", "webull", "2026-08-20", 7)
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.10, "highIBS": 0.75,
		"allowNewEntries": true, "allowExits": true, "entryCapitalMode": "cash_100",
		"brokers": map[string]any{
			"webull": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})
	if _, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true}); err != nil {
		t.Fatal(err)
	}
	sells := 0
	for _, o := range wb.Orders {
		if o.Side == "SELL" {
			sells++
		}
	}
	if sells != 1 {
		t.Fatalf("shares already sold must not be sold again, got %d SELL: %+v", sells, wb.Orders)
	}
}

// CORE-03: позиция, купленная руками, без входной строки в журнале. Выходу
// нечего закрывать, поэтому защита по закрытой строке не срабатывала, и
// второй проход отправлял вторую MARKET SELL по уже проданным акциям.
func TestUnjournaledPositionIsNotSoldTwice(t *testing.T) {
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
	wb := &MemoryBroker{Name: "webull", FillStatus: "FILLED", FillPrice: 11.9, FillQty: 7,
		Acct: map[string]any{"cash_balance": 10000.0}}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": exitBars, "MSFT": entryBars}})
	e.AttachBroker("webull", wb)
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.Now = nearCloseNow()
	// Пока движок ждёт, брокер подтверждает исполнение: к моменту второго
	// прохода трекер выхода уже финальный и больше ничего не сторожит.
	e.Sleep = func(time.Duration) { e.PollTrackers() }
	// Ни одной строки в broker_trades: акции куплены руками. Лента позиций
	// брокера так и не догоняет исполнение.
	wb.OnPositions = func() []any {
		return []any{map[string]any{"symbol": "AAPL", "quantity": 7.0}}
	}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.10, "highIBS": 0.75, "entryCapitalMode": "cash_100",
		"allowNewEntries": true, "allowExits": true,
		"brokers": map[string]any{
			"webull": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})
	if _, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true}); err != nil {
		t.Fatal(err)
	}
	sells := 0
	for _, o := range wb.Orders {
		if o.Side == "SELL" {
			sells++
		}
	}
	if sells != 1 {
		t.Fatalf("a manual position must be sold exactly once, got %d SELL: %+v", sells, wb.Orders)
	}
}

// Обратная сторона той же защиты: если у брокера акций больше, чем мы сегодня
// продали, это настоящая покупка, а не отставшая лента — выход обязан уйти.
func TestRealPositionLargerThanTodaysExitStillExits(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	exitBars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 11.9, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", exitBars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.10, "highIBS": 0.75})
	wb := &MemoryBroker{Name: "webull", Acct: map[string]any{"cash_balance": 10000.0}}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": exitBars}})
	e.AttachBroker("webull", wb)
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.Now = nearCloseNow()
	e.Sleep = func(time.Duration) {}
	// Сегодня уже продали 7 AAPL, а у брокера их 10: три куплены руками.
	if err := db.SaveOrderTracker(map[string]any{
		"clientOrderId": "old-exit", "symbol": "AAPL", "action": "exit", "status": "filled",
		"quantity": 7.0, "broker": "webull", "dateKey": "2026-09-01",
	}); err != nil {
		t.Fatal(err)
	}
	wb.SetPos([]any{map[string]any{"symbol": "AAPL", "quantity": 10.0}})
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.10, "highIBS": 0.75,
		"allowNewEntries": false, "allowExits": true,
		"brokers": map[string]any{
			"webull": map[string]any{"enabled": true, "allowExits": true},
		},
	})
	e.Execute("telegram_t1")
	if len(wb.Orders) != 1 || wb.Orders[0].Side != "SELL" || wb.Orders[0].Quantity != 10 {
		t.Fatalf("a genuinely larger position must still be closed in full: %+v", wb.Orders)
	}
}
