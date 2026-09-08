package live

import (
	"testing"

	"mktorder.com/go/internal/types"
)

// «Купил руками тикер, которого нет в мониторинге, у второго брокера».
// Котировки собирались по книге брокера-витрины, поэтому такую позицию нечем
// было оценить: выход навсегда упирался в open_position_quote_unavailable, а
// вход у этого брокера оставался заблокирован позицией.
func TestUnwatchedPositionOnSecondBrokerIsQuotedAndExited(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-08", Open: 100, High: 120, Low: 90, Close: 120, Volume: 1}}
	db, e, wb := testEngine(t, bars)
	_ = db.SaveDataset("TQQQ", "TQQQ", "", "", bars, false)
	e.Quotes = &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars, "TQQQ": bars}}
	rh := &MemoryBroker{Name: "robinhood"}
	e.Broker = nil
	e.Brokers = nil
	// Витрина — Webull, и она пуста. TQQQ есть только у Robinhood и только у
	// брокера: ни в watchlist, ни в журнале его нет.
	e.AttachBroker("webull", wb)
	e.AttachBroker("robinhood", rh)
	rh.Pos = []any{map[string]any{"symbol": "TQQQ", "quantity": 11.0}}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.1, "highIBS": 0.75, "symbols": "AAPL",
		"allowExits": true, "allowNewEntries": true,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})

	res := e.Execute("telegram_t1")
	if len(rh.Orders) != 1 || rh.Orders[0].Side != "SELL" || rh.Orders[0].Quantity != 11 {
		t.Fatalf("неотслеживаемая позиция у второго брокера должна закрыться целиком: %+v decisions=%+v", rh.Orders, res.BrokerDecisions)
	}
}
