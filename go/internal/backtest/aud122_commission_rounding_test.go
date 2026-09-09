package backtest

import (
	"testing"

	"mktorder.com/go/internal/indicators"
	"mktorder.com/go/internal/types"
)

// AUD-122: capital that divides evenly by the entry price leaves nothing for
// the commission, and the run used to skip the day's signal entirely instead of
// buying one share less.
func TestEntryShrinksWhenCommissionDoesNotFit(t *testing.T) {
	data := []types.OHLC{
		{Date: "2026-01-01", Open: 100, High: 110, Low: 100, Close: 100}, // IBS 0 → entry
		{Date: "2026-01-02", Open: 100, High: 110, Low: 100, Close: 110}, // IBS 1 → exit
	}
	low, high := 0.5, 0.5
	capital, fee := 1000.0, 1.0
	st := types.Strategy{
		Parameters: types.StrategyParameters{LowIBS: &low, HighIBS: &high},
		RiskManagement: types.RiskManagement{
			InitialCapital: &capital,
			Commission:     types.Commission{Type: "fixed", Fixed: fee},
		},
	}
	td := TickerIndexed{Ticker: "X", Data: data, IBSValues: indicators.IBS(data)}
	_, _, _, trades, _, _ := RunSinglePosition([]TickerIndexed{td}, st, 1, SingleOptions{})
	if len(trades) == 0 {
		t.Fatal("the signal was skipped because the commission did not fit the rounding remainder")
	}
	if trades[0].Quantity != 9 {
		t.Fatalf("quantity = %v, want 9 (10 shares leave nothing for the fee)", trades[0].Quantity)
	}
}
