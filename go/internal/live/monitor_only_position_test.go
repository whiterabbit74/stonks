package live

import (
	"fmt"
	"mktorder.com/go/internal/store"
	"testing"
	"time"

	"mktorder.com/go/internal/types"
)

// Боевое состояние 2026-09-08: MSFT открыт по $499.60 и реально лежит
// у брокера, но исполнение в журнал не попало. Находка о пропавшей ноге видна
// оператору и ничего не блокирует: мониторинг выходит по своему сигналу и
// закрывает позицию ценой T-1, автоторговля очищает счёт.
func TestMonitorOnlyPositionExitsAndClosesMonitorTrade(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-08", Open: 480, High: 520, Low: 470, Close: 520, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	_ = db.SaveDataset("MSFT", "MSFT", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "MSFT", "lowIBS": 0.1, "highIBS": 0.75})
	e.Quotes = &MemoryQuotes{Bars: map[string][]types.OHLC{"MSFT": bars}}
	_ = db.SavePosition(store.Position{ID: "m-msft", Symbol: "MSFT", Status: "open", EntryDate: "2026-08-28", EntryPrice: store.Ptr[float64](499.60), Quantity: 3})
	br.Pos = []any{map[string]any{"symbol": "MSFT", "quantity": 3.0}}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.1, "highIBS": 0.75,
		"allowExits": true, "allowNewEntries": true, "symbols": "MSFT",
	})

	// Одна находка: у позиции нет ноги брокера, который её держит. Она видна
	// оператору, чинится Reconcile и не блокирует торговлю.
	snap := e.Consistency()
	issues, _ := snap["issues"].([]map[string]any)
	if len(issues) != 1 || fmt.Sprint(issues[0]["code"]) != "position_leg_missing" {
		t.Fatalf("ждём одну починяемую находку: %+v", issues)
	}

	// Через Aggregate, а не Execute: раньше именно тут находка глушила цикл.
	res, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true})
	if err != nil {
		t.Fatal(err)
	}
	if !res.Executed || len(br.Orders) != 1 {
		t.Fatalf("выход должен уйти несмотря на находки: %+v", br.Orders)
	}
	if br.Orders[0].Side != "SELL" || br.Orders[0].Quantity != 3 {
		t.Fatalf("продать надо всю позицию брокера: %+v", br.Orders[0])
	}

	trades, _ := db.ListPositions()
	if len(trades) != 1 || fmt.Sprint(trades[0].Status) != "closed" {
		t.Fatalf("позиция мониторинга закрывается сигналом, не дожидаясь филла: %+v", trades)
	}
	// (520 - 499.60) * 3: цена решения T-1, а не исполнение брокера.
	if got := pv(trades[0].PnLAbsolute); got < 61.19 || got > 61.21 {
		t.Fatalf("PnL по цене сигнала %v, ждём 61.2", got)
	}
}
