package backtest

import (
	"math"
	"testing"

	"mktorder.com/go/internal/indicators"
	"mktorder.com/go/internal/metrics"
	"mktorder.com/go/internal/optionsmath"
	"mktorder.com/go/internal/types"
)

func TestSimulateMarginRecordsLastBarOpen(t *testing.T) {
	bars := []types.OHLC{
		{Date: "2026-01-01", Open: 100, High: 101, Low: 99, Close: 100},
		{Date: "2026-01-02", Open: 100, High: 102, Low: 99, Close: 101},
	}
	res := SimulateMargin(MarginParams{
		Market: bars, InitialCapital: 10000, Leverage: 1,
		Trades: []types.Trade{{ID: "t1", EntryDate: "2026-01-02", EntryPrice: 100, ExitDate: "2026-01-10", ExitPrice: 110}},
	})
	if len(res.Trades) != 1 {
		t.Fatalf("open-on-last-bar must appear in Trades, got %d", len(res.Trades))
	}
	if res.Trades[0].ExitReason != "end_of_data" {
		t.Fatalf("exit reason %q", res.Trades[0].ExitReason)
	}
}

func TestLeveragedSinglePositionDoesNotGoNegative(t *testing.T) {
	data := []types.OHLC{
		{Date: "2026-01-01", Open: 100, High: 100, Low: 100, Close: 100},
		{Date: "2026-01-02", Open: 50, High: 50, Low: 50, Close: 50},
	}
	low, high, hold := 1.0, 0.01, 1.0
	cap := 10000.0
	st := types.Strategy{
		Parameters:     types.StrategyParameters{LowIBS: &low, HighIBS: &high, MaxHoldDays: &hold},
		RiskManagement: types.RiskManagement{InitialCapital: &cap},
	}
	td := TickerIndexed{Ticker: "X", Data: data, IBSValues: indicators.IBS(data)}
	_, final, _, _, _, _ := RunSinglePosition([]TickerIndexed{td}, st, 3, SingleOptions{})
	if final < 0 {
		t.Fatalf("leveraged sim reported equity %v below 0", final)
	}
}

func TestBrokenOHLCIsNotNeutralIBS(t *testing.T) {
	v := indicators.IBS([]types.OHLC{{Date: "2026-01-01", Open: 12, High: 10, Low: 15, Close: 12}})
	if len(v) != 1 || !math.IsNaN(v[0]) {
		t.Fatalf("High<Low must not become IBS 0.5, got %v", v)
	}
}

func TestOptionsUsesCallerInitialCapital(t *testing.T) {
	market := []types.OHLC{{Date: "2026-01-01", Open: 100, High: 100, Low: 100, Close: 100}}
	_, _, final := RunOptions(nil, market, OptionsConfig{InitialCapital: 50000})
	if final != 50000 {
		t.Fatalf("empty options run must keep caller capital, got %v", final)
	}
}

func TestBlackScholesZeroSigmaIsFinite(t *testing.T) {
	v := optionsmath.BlackScholes("call", 100, 100, 1, 0, 0)
	if math.IsNaN(v) || math.IsInf(v, 0) {
		t.Fatalf("sigma 0 produced %v", v)
	}
}

func TestCAGRNonPositiveFinalIsZero(t *testing.T) {
	m := metrics.New(nil, []types.EquityPoint{{Date: "2020-01-01", Value: 10000}, {Date: "2022-01-01", Value: -500}}, 10000, nil).All()
	if math.IsNaN(m.CAGR) {
		t.Fatal("CAGR must be 0, not NaN, when final value is not positive")
	}
	if m.CAGR != 0 {
		t.Fatalf("CAGR %v want 0", m.CAGR)
	}
}
