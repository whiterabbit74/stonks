package backtest

import (
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-093: на дате, которой нет у тикера, позиция переоценивалась по цене
// входа, поэтому equity падала обратно к капиталу и давала ложную просадку.
func TestEmaKeepsLastKnownPriceOnMissingBar(t *testing.T) {
	x := TickerIndexed{Ticker: "X", Data: []types.OHLC{
		emaBar("2024-01-01", 100),
		emaBar("2024-01-02", 100),
		emaBar("2024-01-03", 90),
		emaBar("2024-01-04", 120),
	}}
	y := TickerIndexed{Ticker: "Y", Data: []types.OHLC{emaBar("2024-01-05", 50)}}
	params := EmaParams{
		InitialCapital: 10000, Leverage: 1, EmaPeriod: 3,
		BuyZones:     []EmaZone{{ID: "buy-5", LevelPct: -5, Enabled: true}},
		SellZones:    []EmaZone{{ID: "sell-99", LevelPct: 99, Enabled: true}},
		SignalSource: "close", EmaStartMode: "full_history",
	}
	got := RunEmaZone([]TickerIndexed{x, y}, params)
	if len(got.Equity) < 2 {
		t.Fatalf("equity %+v", got.Equity)
	}
	prev := got.Equity[len(got.Equity)-2]
	last := got.Equity[len(got.Equity)-1]
	if last.Value < prev.Value*0.99 {
		t.Fatalf("equity collapsed on the gap date: %v -> %v", prev.Value, last.Value)
	}
	if last.Drawdown > 1 {
		t.Fatalf("false drawdown %v on the gap date", last.Drawdown)
	}
}
