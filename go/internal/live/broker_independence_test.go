package live

import (
	"testing"

	"mktorder.com/go/internal/types"
)

// Выход у одного брокера не должен зависеть от состояния другого и от
// предупреждений о расхождении журнала: позиция закрывается целиком по своему
// сигналу, у каждого брокера отдельно.
func TestExitRunsPerBrokerDespiteOtherBrokerMismatch(t *testing.T) {
	// IBS 1.0 — выше порога выхода, значит выход должен сработать.
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 12, Volume: 1}}
	_, e, wb := testEngine(t, bars)
	rh := &MemoryBroker{Name: "robinhood"}
	e.Broker = nil
	e.Brokers = nil
	e.AttachBroker("webull", wb)
	e.AttachBroker("robinhood", rh)
	// Webull держит незаписанную в журнал позицию — раньше это давало
	// live_broker_position_without_journal и глушило весь цикл T-1.
	wb.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 7.0}}
	rh.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 42.0}}
	mustInsertBrokerTrade(t, e, "rh-aapl", "AAPL", "robinhood", "2026-09-01", 42)
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.05, "highIBS": 0.75, "symbols": "AAPL",
		"allowNewEntries": true, "allowExits": true,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})
	if _, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true}); err != nil {
		t.Fatal(err)
	}
	if len(rh.Orders) != 1 || rh.Orders[0].Side != "SELL" || rh.Orders[0].Quantity != 42 {
		t.Fatalf("Robinhood must close its own AAPL in full: %+v", rh.Orders)
	}
	if len(wb.Orders) != 1 || wb.Orders[0].Symbol != "AAPL" || wb.Orders[0].Quantity != 7 {
		t.Fatalf("Webull must close its own position in full: %+v", wb.Orders)
	}
}
