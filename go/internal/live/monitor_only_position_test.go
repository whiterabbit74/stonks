package live

import (
	"fmt"
	"testing"
	"time"

	"mktorder.com/go/internal/types"
)

// Боевое состояние 2026-09-08: в мониторинге MSFT открыт с 04.09 по $499.60,
// журнал брокера пуст, а сама позиция у брокера есть. Раньше это давало
// одновременно live_broker_position_without_journal (глушило весь цикл T-1) и
// broker_position_not_in_journal (запрещало выход), и позиция не закрывалась
// никогда.
func TestMonitorOnlyPositionExitsAndClosesMonitorTrade(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-08", Open: 480, High: 520, Low: 470, Close: 520, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	_ = db.SaveDataset("MSFT", "MSFT", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "MSFT", "lowIBS": 0.1, "highIBS": 0.75})
	e.Quotes = &MemoryQuotes{Bars: map[string][]types.OHLC{"MSFT": bars}}
	_ = db.InsertTrade("trades", map[string]any{
		"id": "m-msft", "symbol": "MSFT", "status": "open",
		"entryDate": "2026-09-04", "entryPrice": 499.60, "quantity": 3,
	})
	br.Pos = []any{map[string]any{"symbol": "MSFT", "quantity": 3.0}}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.1, "highIBS": 0.75,
		"allowExits": true, "allowNewEntries": true, "symbols": "MSFT",
	})

	// Обе находки consistency должны быть на месте — и не мешать торговле.
	issues, _ := e.Consistency()["issues"].([]map[string]any)
	codes := map[string]bool{}
	for _, iss := range issues {
		codes[fmt.Sprint(iss["code"])] = true
	}
	if !codes["monitor_trade_without_broker_position"] || !codes["live_broker_position_without_journal"] {
		t.Fatalf("ждём обе находки боевого состояния: %+v", issues)
	}
	if BlockingMismatch(e.Consistency()) == nil {
		t.Fatal("находка обязана остаться видимой в отчёте")
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

	trades, _ := db.ListTrades("trades")
	if len(trades) != 1 || fmt.Sprint(trades[0]["status"]) != "closed" {
		t.Fatalf("позиция мониторинга должна закрыться: %+v", trades)
	}
	// (510 - 499.60) * 3
	if got := asFloat(trades[0]["pnlAbsolute"]); got < 31.19 || got > 31.21 {
		t.Fatalf("реализованный PnL %v, ждём 31.2", got)
	}
}
