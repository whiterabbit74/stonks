package live

import (
	"errors"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

// isolationEngine: два брокера, у каждого своя открытая позиция в AAPL с
// сигналом на выход и MSFT как кандидат на вход.
func isolationEngine(t *testing.T) (*Engine, *MemoryBroker, *MemoryBroker) {
	t.Helper()
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
	e.Sleep = func(time.Duration) {}
	wb := &MemoryBroker{Name: "webull", FillStatus: "FILLED", FillPrice: 11.9, FillQty: 7,
		Acct: map[string]any{"cash_balance": 10000.0}}
	rh := &MemoryBroker{Name: "robinhood", FillStatus: "FILLED", FillPrice: 11.9, FillQty: 42,
		Acct: map[string]any{"cash_balance": 10000.0}}
	e.AttachBroker("webull", wb)
	e.AttachBroker("robinhood", rh)
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.10, "highIBS": 0.75, "entryCapitalMode": "cash_100",
		"allowNewEntries": true, "allowExits": true,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})
	return e, wb, rh
}

func sidesOf(br *MemoryBroker) (sell, buy int, buySym string) {
	for _, o := range br.Orders {
		if o.Side == "SELL" {
			sell++
		}
		if o.Side == "BUY" {
			buy++
			buySym = o.Symbol
		}
	}
	return sell, buy, buySym
}

// Полностью сломанный Webull не должен стоить Robinhood ни выхода, ни входа в
// тот же день.
func TestBrokenWebullCostsRobinhoodNothing(t *testing.T) {
	e, wb, rh := isolationEngine(t)
	boom := errors.New("webull: 429 too many requests")
	wb.FailPositions = boom
	wb.FailOpenOrders = boom
	wb.SetFailPlace("webull: 500", 0, false)
	wb.Acct = nil
	rh.SetPos([]any{map[string]any{"symbol": "AAPL", "quantity": 42.0}})
	mustInsertBrokerTrade(t, e, "rh-aapl", "AAPL", "robinhood", "2026-08-20", 42)
	// Лента позиций Robinhood очищается сразу после продажи.
	rh.OnPositions = func() []any {
		rh.mu.Lock()
		sold := len(rh.Orders) > 0
		rh.mu.Unlock()
		if sold {
			return []any{}
		}
		return []any{map[string]any{"symbol": "AAPL", "quantity": 42.0}}
	}
	if _, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true}); err != nil {
		t.Fatal(err)
	}
	sell, buy, sym := sidesOf(rh)
	if sell != 1 {
		t.Fatalf("Robinhood must close AAPL exactly once: %+v", rh.Orders)
	}
	if buy != 1 || sym != "MSFT" {
		t.Fatalf("Robinhood must re-enter MSFT the same minute: buy=%d sym=%s %+v", buy, sym, rh.Orders)
	}
	if len(wb.Orders) != 0 {
		t.Fatalf("broken Webull must not have traded: %+v", wb.Orders)
	}
}

// И симметрично: сломанный Robinhood не влияет на Webull.
func TestBrokenRobinhoodCostsWebullNothing(t *testing.T) {
	e, wb, rh := isolationEngine(t)
	boom := errors.New("robinhood: 503")
	rh.FailPositions = boom
	rh.FailOpenOrders = boom
	rh.SetFailPlace("robinhood: 500", 0, false)
	wb.SetPos([]any{map[string]any{"symbol": "AAPL", "quantity": 7.0}})
	mustInsertBrokerTrade(t, e, "wb-aapl", "AAPL", "webull", "2026-08-20", 7)
	wb.OnPositions = func() []any {
		wb.mu.Lock()
		sold := len(wb.Orders) > 0
		wb.mu.Unlock()
		if sold {
			return []any{}
		}
		return []any{map[string]any{"symbol": "AAPL", "quantity": 7.0}}
	}
	if _, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true}); err != nil {
		t.Fatal(err)
	}
	sell, buy, sym := sidesOf(wb)
	if sell != 1 || buy != 1 || sym != "MSFT" {
		t.Fatalf("Webull must exit AAPL and re-enter MSFT: sell=%d buy=%d sym=%s %+v", sell, buy, sym, wb.Orders)
	}
	if len(rh.Orders) != 0 {
		t.Fatalf("broken Robinhood must not have traded: %+v", rh.Orders)
	}
}

// Оба брокера здоровы и держат один тикер: каждый закрывает своё количество и
// каждый входит заново, независимо друг от друга.
func TestBothBrokersExitAndReenterIndependently(t *testing.T) {
	e, wb, rh := isolationEngine(t)
	wb.SetPos([]any{map[string]any{"symbol": "AAPL", "quantity": 7.0}})
	rh.SetPos([]any{map[string]any{"symbol": "AAPL", "quantity": 42.0}})
	mustInsertBrokerTrade(t, e, "wb-aapl", "AAPL", "webull", "2026-08-20", 7)
	mustInsertBrokerTrade(t, e, "rh-aapl", "AAPL", "robinhood", "2026-08-20", 42)
	mustInsertMonitorTrade(t, e, "m-wb-aapl", "AAPL", "wb-aapl", "2026-08-20")
	mustInsertMonitorTrade(t, e, "m-rh-aapl", "AAPL", "rh-aapl", "2026-08-20")
	for id, qty := range map[string]float64{"m-wb-aapl": 7, "m-rh-aapl": 42} {
		if _, err := e.DB.SQL.Exec(`UPDATE trades SET quantity=? WHERE id=?`, qty, id); err != nil {
			t.Fatal(err)
		}
	}
	for _, br := range []*MemoryBroker{wb, rh} {
		br := br
		qty := 7.0
		if br.Name == "robinhood" {
			qty = 42
		}
		br.OnPositions = func() []any {
			br.mu.Lock()
			sold := len(br.Orders) > 0
			br.mu.Unlock()
			if sold {
				return []any{}
			}
			return []any{map[string]any{"symbol": "AAPL", "quantity": qty}}
		}
	}
	if _, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true}); err != nil {
		t.Fatal(err)
	}
	drainTrackers(t, e)
	for _, br := range []*MemoryBroker{wb, rh} {
		sell, buy, sym := sidesOf(br)
		if sell != 1 || buy != 1 || sym != "MSFT" {
			t.Fatalf("%s: sell=%d buy=%d sym=%s %+v", br.Name, sell, buy, sym, br.Orders)
		}
	}
	if wb.Orders[0].Quantity != 7 || rh.Orders[0].Quantity != 42 {
		t.Fatalf("each broker sells its own size: %v %v", wb.Orders[0], rh.Orders[0])
	}
	rows, _ := e.DB.ListTrades("broker_trades")
	open := 0
	for _, r := range rows {
		if fmt.Sprint(r["status"]) == "open" {
			open++
		}
	}
	if open != 2 {
		t.Fatalf("want one open MSFT row per broker after re-entry, got %d: %+v", open, rows)
	}
	// Каждая монитор-строка закрылась своим выходом: 7 x $1.9 и 42 x $1.9
	// (AUD-068 — раньше PnL менялся местами между брокерами).
	for id, want := range map[string]float64{"m-wb-aapl": 13.3, "m-rh-aapl": 79.8} {
		row, _ := e.DB.GetTrade("trades", id)
		if row == nil || fmt.Sprint(row["status"]) != "closed" {
			t.Fatalf("%s must be closed: %+v", id, row)
		}
		if got := asFloat(row["pnlAbsolute"]); got < want-0.01 || got > want+0.01 {
			t.Fatalf("%s pnlAbsolute=%v want %v", id, got, want)
		}
	}
}

// drainTrackers доводит асинхронные трекеры до финального статуса.
func drainTrackers(t *testing.T, e *Engine) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		e.PollTrackers()
		pending, err := e.DB.ListPendingTrackers()
		if err != nil {
			t.Fatal(err)
		}
		if len(pending) == 0 {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("trackers still pending")
}

// Битая монитор-строка одного брокера не должна блокировать вход у другого:
// linked_monitor_trade_missing_broker_match не называл брокера и глушил всех.
func TestBrokenMonitorRowBlocksOnlyItsOwnBroker(t *testing.T) {
	e, wb, rh := isolationEngine(t)
	// Монитор-строка ссылается на сделку Webull, которой в журнале нет.
	mustInsertMonitorTrade(t, e, "m-ghost", "AAPL", "wb-ghost", "2026-08-20")
	if err := e.DB.SaveOrderTracker(map[string]any{
		"clientOrderId": "wb-ghost", "symbol": "AAPL", "action": "entry",
		"status": "filled", "quantity": 7.0, "broker": "webull", "dateKey": "2026-08-20",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true}); err != nil {
		t.Fatal(err)
	}
	drainTrackers(t, e)
	if _, buy, sym := sidesOf(rh); buy != 1 || sym != "MSFT" {
		t.Fatalf("Robinhood must enter despite Webull's broken monitor row: %+v", rh.Orders)
	}
	if _, buy, _ := sidesOf(wb); buy != 0 {
		t.Fatalf("Webull's own entry stays blocked: %+v", wb.Orders)
	}
}
