package live

import (
	"testing"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

// AUD-068: оба брокера держат один тикер. Мониторинг закрывает позицию своим
// сигналом; продажа Webull закрывает ногу Webull и не трогает Robinhood, у
// которого выходы выключены, — его нога честно показывает непроданное.
//
// Раньше это были две отдельные строки журнала на брокера, и выход одного мог
// закрыть строку другого. Теперь строка одна, а ноги две, так что перепутать
// нечего: проверяем, что закрывается именно нога продавшего брокера.
func TestExitClosesOwnLegInMultiBroker(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 12, Volume: 1}}
	db, e, wb := testEngine(t, bars)
	rh := &MemoryBroker{Name: "robinhood"}
	e.Broker = nil
	e.Brokers = nil
	e.AttachBroker("webull", wb)
	e.AttachBroker("robinhood", rh)
	wb.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 7.0}}
	rh.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 42.0}}
	if err := db.SavePosition(store.Position{
		ID: "aapl", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-20",
		EntryPrice: store.Ptr[float64](10.0), Quantity: 49,
		Webull:    store.BrokerLeg{Qty: 7, EntryPrice: store.Ptr[float64](10.0), EntryOrderID: "wb-aapl"},
		Robinhood: store.BrokerLeg{Qty: 42, EntryPrice: store.Ptr[float64](10.0), EntryOrderID: "rh-aapl"},
	}); err != nil {
		t.Fatal(err)
	}
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

	p, err := db.GetPosition("aapl")
	if err != nil || p == nil {
		t.Fatalf("position: %v %v", p, err)
	}
	if p.Webull.Qty != 0 || p.Webull.ExitOrderID != oid {
		t.Fatalf("webull leg must be closed: %+v", p.Webull)
	}
	if p.Robinhood.Qty != 42 {
		t.Fatalf("robinhood leg must be untouched: %+v", p.Robinhood)
	}
	if p.Status != "closed" || p.ExitPrice == nil || *p.ExitPrice != 12 {
		t.Fatalf("the monitoring closes its position on the signal: %+v", p)
	}
}
