package live

import (
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/types"
)

// Когда у всех брокеров висит чужая незакрытая заявка, T-1 не отправляет
// ничего — и раньше писал «Действий нет», хотя в журнале открытая позиция с
// сигналом на выход. Причина пропуска обязана быть в сообщении.
func TestT1SaysWhyEveryBrokerWasSkipped(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 12, Volume: 1}}
	_, e, wb := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	rh := &MemoryBroker{Name: "robinhood"}
	e.Broker = nil
	e.Brokers = nil
	e.AttachBroker("webull", wb)
	e.AttachBroker("robinhood", rh)
	working := []any{map[string]any{"symbol": "AAPL", "status": "WORKING", "client_order_id": "x1"}}
	wb.Open = working
	rh.Open = working
	wb.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 7.0}}
	rh.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 42.0}}
	mustInsertBrokerTrade(t, e, "wb-aapl", "AAPL", "webull", "2026-08-20", 7)
	mustInsertBrokerTrade(t, e, "rh-aapl", "AAPL", "robinhood", "2026-09-01", 42)
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.05, "highIBS": 0.75, "symbols": "AAPL",
		"allowNewEntries": true, "allowExits": true,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})
	res, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true})
	if err != nil {
		t.Fatal(err)
	}
	if len(wb.Orders) != 0 || len(rh.Orders) != 0 {
		t.Fatalf("nothing may be submitted: %+v %+v", wb.Orders, rh.Orders)
	}
	if strings.Contains(res.Text, "Действий нет") {
		t.Fatalf("a skipped run must not read as no-action:\n%s", res.Text)
	}
	for _, want := range []string{"Webull:", "Robinhood:", "незакрытая заявка"} {
		if !strings.Contains(res.Text, want) {
			t.Fatalf("want %q in the T-1 text:\n%s", want, res.Text)
		}
	}
}
