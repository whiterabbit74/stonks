package live

import (
	"testing"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

// TQQQ лежит у Robinhood: его нет ни в списке наблюдения, ни в журнале. Это
// остаток, и выход мониторинга из AAPL очищает счёт целиком — TQQQ продаётся
// вместе со всем остальным. Webull пуст и ничего не отправляет (CORE §3.2).
func TestMonitorExitSellsLeftoverOnTheBrokerThatHasIt(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-08", Open: 100, High: 120, Low: 90, Close: 120, Volume: 1}}
	db, e, wb := testEngine(t, bars)
	e.Quotes = &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}}
	rh := &MemoryBroker{Name: "robinhood"}
	e.Broker = nil
	e.Brokers = nil
	e.AttachBroker("webull", wb)
	e.AttachBroker("robinhood", rh)
	if _, err := db.OpenMonitorPosition(store.Position{ID: "m1", Symbol: "AAPL", EntryDate: "2026-08-28", EntryPrice: store.Ptr(100.0)}); err != nil {
		t.Fatal(err)
	}
	rh.Pos = []any{map[string]any{"symbol": "TQQQ", "quantity": 11.0}}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.1, "highIBS": 0.75, "symbols": "AAPL",
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})

	res := e.Execute("telegram_t1")
	if res.Monitor.Closed == nil {
		t.Fatalf("the monitoring must exit AAPL: %+v", res.Monitor)
	}
	if len(rh.Orders) != 1 || rh.Orders[0].Side != "SELL" || rh.Orders[0].Symbol != "TQQQ" || rh.Orders[0].Quantity != 11 {
		t.Fatalf("остаток у Robinhood должен продаться целиком: %+v", rh.Orders)
	}
	if len(wb.Orders) != 0 {
		t.Fatalf("Webull пуст — продавать нечего: %+v", wb.Orders)
	}
}
