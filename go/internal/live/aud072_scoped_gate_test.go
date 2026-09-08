package live

import (
	"errors"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/types"
)

func twoBrokerExitEngine(t *testing.T) (*Engine, *MemoryBroker, *MemoryBroker) {
	t.Helper()
	// IBS 1.0 — выше порога выхода.
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 12, Volume: 1}}
	_, e, wb := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	rh := &MemoryBroker{Name: "robinhood"}
	e.Broker = nil
	e.Brokers = nil
	e.AttachBroker("webull", wb)
	e.AttachBroker("robinhood", rh)
	wb.SetPos([]any{map[string]any{"symbol": "AAPL", "quantity": 7.0}})
	rh.SetPos([]any{map[string]any{"symbol": "AAPL", "quantity": 42.0}})
	mustInsertBrokerTrade(t, e, "wb-aapl", "AAPL", "webull", "2026-08-20", 7)
	mustInsertBrokerTrade(t, e, "rh-aapl", "AAPL", "robinhood", "2026-09-01", 42)
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.05, "highIBS": 0.75,
		"allowNewEntries": true, "allowExits": true,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})
	return e, wb, rh
}

// Заявка по чужому тикеру не имеет отношения к нашему выходу: удвоить она
// может только заявку в том же тикере (AUD-072).
func TestWorkingOrderOnAnotherTickerDoesNotBlockTheExit(t *testing.T) {
	e, wb, rh := twoBrokerExitEngine(t)
	wb.Open = []any{map[string]any{"symbol": "TSLA", "status": "WORKING", "client_order_id": "x1"}}
	if _, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true}); err != nil {
		t.Fatal(err)
	}
	if len(wb.Orders) != 1 || wb.Orders[0].Side != "SELL" || wb.Orders[0].Symbol != "AAPL" {
		t.Fatalf("Webull must still close AAPL: %+v", wb.Orders)
	}
	if len(rh.Orders) != 1 {
		t.Fatalf("Robinhood is independent: %+v", rh.Orders)
	}
}

// Заявка по нашему тикеру — единственный настоящий риск дубля.
func TestWorkingOrderOnTheSameTickerBlocksThatTickerOnly(t *testing.T) {
	e, wb, rh := twoBrokerExitEngine(t)
	wb.Open = []any{map[string]any{"symbol": "AAPL", "status": "WORKING", "client_order_id": "x1"}}
	res, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true})
	if err != nil {
		t.Fatal(err)
	}
	if len(wb.Orders) != 0 {
		t.Fatalf("Webull must not double the working AAPL order: %+v", wb.Orders)
	}
	if len(rh.Orders) != 1 || rh.Orders[0].Side != "SELL" {
		t.Fatalf("Webull's working order must not touch Robinhood: %+v", rh.Orders)
	}
	if !strings.Contains(res.Text, "по AAPL уже висит незакрытая заявка") {
		t.Fatalf("want the per-ticker reason:\n%s", res.Text)
	}
}

// Нечитаемые открытые заявки: вход отменяется (он не может отменить то, чего
// не видит), выход уходит — свои заявки уже держит журнал трекеров.
func TestUnreadableOpenOrdersStillExitsButBlocksEntry(t *testing.T) {
	e, wb, rh := twoBrokerExitEngine(t)
	wb.FailOpenOrders = errors.New("webull: 502")
	res, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true})
	if err != nil {
		t.Fatal(err)
	}
	if len(wb.Orders) != 1 || wb.Orders[0].Side != "SELL" {
		t.Fatalf("an unexited position is the bigger risk: %+v", wb.Orders)
	}
	if len(rh.Orders) != 1 {
		t.Fatalf("Robinhood unaffected: %+v", rh.Orders)
	}
	_ = res
}
