package live

import (
	"fmt"
	"mktorder.com/go/internal/store"
	"testing"
	"time"

	"mktorder.com/go/internal/types"
)

// Боевое состояние 2026-09-08: MSFT открыт с 04.09 по $499.60 и реально лежит
// у брокера, но исполнение в журнал не попало. Раньше это была пара находок —
// live_broker_position_without_journal глушила весь цикл T-1, а
// broker_position_not_in_journal запрещала выход, и позиция не закрывалась
// никогда. Теперь это одна починяемая находка, которая ничего не блокирует.
func TestMonitorOnlyPositionExitsAndClosesMonitorTrade(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-08", Open: 480, High: 520, Low: 470, Close: 520, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	_ = db.SaveDataset("MSFT", "MSFT", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "MSFT", "lowIBS": 0.1, "highIBS": 0.75})
	e.Quotes = &MemoryQuotes{Bars: map[string][]types.OHLC{"MSFT": bars}}
	_ = db.SavePosition(store.Position{ID: "m-msft", Symbol: "MSFT", Status: "open", EntryDate: "2026-09-04", EntryPrice: store.Ptr[float64](499.60), Quantity: 3})
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
	if BlockingMismatch(snap) != nil {
		t.Fatalf("эта находка не должна глушить цикл: %+v", issues)
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

	oid := br.Orders[0].ClientOrderID
	br.SetDetail(oid, map[string]any{
		"status": "FILLED", "filled_qty": 3.0, "filled_price": 510.0, "client_order_id": oid,
	})
	waitTrackerFinal(t, e, db, "MSFT", "exit")

	trades, _ := db.ListPositions()
	if len(trades) != 1 || fmt.Sprint(trades[0].Status) != "closed" {
		t.Fatalf("позиция мониторинга должна закрыться: %+v", trades)
	}
	// (510 - 499.60) * 3
	if got := pv(trades[0].PnLAbsolute); got < 31.19 || got > 31.21 {
		t.Fatalf("реализованный PnL %v, ждём 31.2", got)
	}
}
