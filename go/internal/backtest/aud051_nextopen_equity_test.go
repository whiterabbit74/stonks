package backtest

import (
	"math"
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-051: при входе по nextOpen эквити дня сигнала считалась уже с позицией,
// купленной по завтрашнему открытию, и переоценённой по сегодняшнему закрытию.
func TestCleanNextOpenKeepsSignalDayEquityFlat(t *testing.T) {
	data := []types.OHLC{
		{Date: "2026-01-01", Open: 100, High: 110, Low: 90, Close: 91},
		{Date: "2026-01-02", Open: 50, High: 60, Low: 45, Close: 55},
		{Date: "2026-01-03", Open: 55, High: 60, Low: 50, Close: 58},
	}
	low, high, hold := 0.2, 0.99, 50.0
	capital := 10000.0
	st := types.Strategy{
		Parameters:     types.StrategyParameters{LowIBS: &low, HighIBS: &high, MaxHoldDays: &hold},
		RiskManagement: types.RiskManagement{InitialCapital: &capital},
	}
	res := RunClean(data, st, &CleanOptions{EntryExecution: "nextOpen"})
	if len(res.Equity) == 0 {
		t.Fatal("no equity")
	}
	if math.Abs(res.Equity[0].Value-capital) > 1e-9 {
		t.Fatalf("signal-day equity %v, want %v", res.Equity[0].Value, capital)
	}
}
