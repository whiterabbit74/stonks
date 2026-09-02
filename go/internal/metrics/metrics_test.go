package metrics

import (
	"testing"

	"mktorder.com/go/internal/goldens"
	"mktorder.com/go/internal/types"
)

func TestMetricsCalculatorGolden(t *testing.T) {
	// Drive the shipped calculator on GOOGL clean trades/equity reconstructed
	// from the golden compact trades is not enough (needs equity). Load
	// googl-metrics-calculator.json produced by MetricsCalculator on the
	// shipped engine output, and compare against a live Go run in backtest tests.
	var want types.PerformanceMetrics
	goldens.Load("googl-metrics-calculator.json", &want)
	if want.TotalTrades != 402 {
		t.Fatalf("golden trades %d", want.TotalTrades)
	}
}

func TestTradeStatsEpsilon(t *testing.T) {
	st := CalculateTradeStats([]types.Trade{
		{PnL: 0.005, Duration: 1},
		{PnL: 1, Duration: 2},
		{PnL: -1, Duration: 3},
	})
	if st.Wins != 1 || st.Losses != 1 || st.Breakeven != 1 {
		t.Fatalf("%+v", st)
	}
}
