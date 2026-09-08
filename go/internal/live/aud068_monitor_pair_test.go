package live

import (
	"fmt"
	"testing"

	"mktorder.com/go/internal/types"
)

// Оба брокера держат один тикер. Выход у Webull должен закрыть монитор-строку
// именно Webull, а не строку Robinhood, которая просто оказалась первой.
func TestExitClosesOwnMonitorRowInMultiBroker(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 12, Volume: 1}}
	db, e, wb := testEngine(t, bars)
	rh := &MemoryBroker{Name: "robinhood"}
	e.Broker = nil
	e.Brokers = nil
	e.AttachBroker("webull", wb)
	e.AttachBroker("robinhood", rh)
	wb.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 7.0}}
	rh.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 42.0}}
	mustInsertBrokerTrade(t, e, "wb-aapl", "AAPL", "webull", "2026-08-20", 7)
	mustInsertBrokerTrade(t, e, "rh-aapl", "AAPL", "robinhood", "2026-09-01", 42)
	mustInsertMonitorTrade(t, e, "m-wb-aapl", "AAPL", "wb-aapl", "2026-08-20")
	mustInsertMonitorTrade(t, e, "m-rh-aapl", "AAPL", "rh-aapl", "2026-09-01")
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.05, "highIBS": 0.75, "symbols": "AAPL",
		"allowNewEntries": false, "allowExits": true,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowNewEntries": false, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": false, "allowExits": false},
		},
	})
	e.Execute("telegram_t1")
	if len(wb.Orders) != 1 || wb.Orders[0].Side != "SELL" {
		t.Fatalf("webull must exit: %+v", wb.Orders)
	}
	if len(rh.Orders) != 0 {
		t.Fatalf("robinhood exits disabled: %+v", rh.Orders)
	}
	oid := wb.Orders[0].ClientOrderID
	wb.SetDetail(oid, map[string]any{"status": "FILLED", "deal_price": 12.0, "filled_quantity": 7})
	waitTrackerFinal(t, e, db, "AAPL", "exit")
	mwb, _ := db.GetTrade("trades", "m-wb-aapl")
	mrh, _ := db.GetTrade("trades", "m-rh-aapl")
	if mwb == nil || fmt.Sprint(mwb["status"]) != "closed" {
		t.Fatalf("webull monitor row must close: %+v", mwb)
	}
	if mrh == nil || fmt.Sprint(mrh["status"]) != "open" {
		t.Fatalf("robinhood monitor row must stay open: %+v", mrh)
	}
}
