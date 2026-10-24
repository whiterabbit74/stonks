package backtest

import (
	"testing"
	"time"

	"mktorder.com/go/internal/indicators"
	"mktorder.com/go/internal/types"
)

func feeStrategy(capital float64, c types.Commission) types.Strategy {
	low, high := 0.5, 0.5
	return types.Strategy{
		Parameters:     types.StrategyParameters{LowIBS: &low, HighIBS: &high},
		RiskManagement: types.RiskManagement{InitialCapital: &capital, Commission: c},
	}
}

var entryExitBars = []types.OHLC{
	{Date: "2026-01-01", Open: 100, High: 110, Low: 100, Close: 100}, // IBS 0 → entry
	{Date: "2026-01-02", Open: 100, High: 110, Low: 100, Close: 110}, // IBS 1 → exit
}

// AUD-144: on huge capital q-- no longer changes a float64, and the
// one-share-at-a-time shrink loop never ended.
func TestHugeCapitalSizingTerminates(t *testing.T) {
	st := feeStrategy(1e20, types.Commission{Type: "fixed", Fixed: 1e10})
	td := TickerIndexed{Ticker: "X", Data: entryExitBars, IBSValues: indicators.IBS(entryExitBars)}
	done := make(chan []types.Trade, 1)
	go func() {
		_, _, _, trades, _, _ := RunSinglePosition([]TickerIndexed{td}, st, 1, SingleOptions{})
		done <- trades
	}()
	select {
	case trades := <-done:
		if len(trades) != 1 {
			t.Fatalf("trades = %d, want 1", len(trades))
		}
	case <-time.After(3 * time.Second):
		t.Fatal("RunSinglePosition did not finish: sizing loop is stuck")
	}
}

func TestAffordableSharesFitsCommission(t *testing.T) {
	cases := []struct {
		c    types.Commission
		lev  float64
		want float64
	}{
		{types.Commission{Type: "fixed", Fixed: 1}, 1, 9},
		{types.Commission{Type: "percentage", Percentage: 1}, 1, 9},
		{types.Commission{Type: "combined", Fixed: 1, Percentage: 1}, 1, 9},
		{types.Commission{}, 1, 10},
		{types.Commission{Type: "fixed", Fixed: 1}, 2, 19},
	}
	for _, c := range cases {
		got := affordableShares(1000*c.lev, 1000, 100, c.lev, feeStrategy(1000, c.c))
		if got != c.want {
			t.Errorf("%+v lev %v: got %v want %v", c.c, c.lev, got, c.want)
		}
	}
}
