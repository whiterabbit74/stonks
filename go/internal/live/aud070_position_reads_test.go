package live

import (
	"testing"
	"time"

	"mktorder.com/go/internal/types"
)

// Webull ограничивает /account/positions примерно одним запросом в две секунды,
// а T-1 укладывается в последнюю минуту сессии. Расчёт и исполнение обязаны
// делить одно чтение книги: лишний запрос возвращался как
// broker_positions_unavailable и стоил дня.
func TestExecuteReadsPositionsOncePerCycle(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 12, Volume: 1}}
	_, e, wb := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	rh := &MemoryBroker{Name: "robinhood"}
	e.Broker = nil
	e.Brokers = nil
	e.AttachBroker("webull", wb)
	e.AttachBroker("robinhood", rh)
	wb.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 7.0}}
	rh.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 42.0}}
	mustInsertBrokerTrade(t, e, "wb-aapl", "AAPL", "webull", "2026-08-20", 7)
	mustInsertBrokerTrade(t, e, "rh-aapl", "AAPL", "robinhood", "2026-09-01", 42)
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.05, "highIBS": 0.75, "symbols": "AAPL",
		"allowNewEntries": false, "allowExits": true,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowExits": true},
		},
	})
	e.Execute("telegram_t1")
	if len(wb.Orders) != 1 || len(rh.Orders) != 1 {
		t.Fatalf("both brokers must exit: %+v %+v", wb.Orders, rh.Orders)
	}
	// Одно чтение на расчёт (executeAll переиспользует его) плюс одно в
	// sizeOrder — количество продаётся ровно то, что у брокера сейчас.
	for _, c := range []struct {
		name string
		n    int
	}{{"webull", wb.PosCalls}, {"robinhood", rh.PosCalls}} {
		if c.n > 2 {
			t.Fatalf("%s: %d positions reads in one cycle, want <= 2", c.name, c.n)
		}
	}
}
