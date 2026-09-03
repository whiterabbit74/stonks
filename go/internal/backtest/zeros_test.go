package backtest

import (
	"testing"

	"mktorder.com/go/internal/types"
)

func TestIbsParamsKeepsExplicitZeros(t *testing.T) {
	z := 0.0
	s := types.Strategy{
		Parameters:     types.StrategyParameters{LowIBS: &z, HighIBS: &z, MaxHoldDays: &z},
		RiskManagement: types.RiskManagement{InitialCapital: &z, CapitalUsage: &z},
	}
	low, high, hold, initial := ibsParams(s)
	if low != 0 || high != 0 || hold != 0 || initial != 0 {
		t.Fatalf("explicit zeros got low=%v high=%v hold=%v initial=%v", low, high, hold, initial)
	}
}

func TestIbsParamsDefaultsWhenMissing(t *testing.T) {
	low, high, hold, initial := ibsParams(types.Strategy{})
	if low != 0.1 || high != 0.75 || hold != 30 || initial != 10000 {
		t.Fatalf("defaults got low=%v high=%v hold=%v initial=%v", low, high, hold, initial)
	}
}

func TestCleanMaxHoldDaysPrefersParametersZero(t *testing.T) {
	z := 0.0
	rm := 15.0
	s := types.Strategy{
		Parameters:     types.StrategyParameters{MaxHoldDays: &z},
		RiskManagement: types.RiskManagement{MaxHoldDays: &rm},
	}
	if got := cleanMaxHoldDays(s); got != 0 {
		t.Fatalf("parameters 0 should win, got %v", got)
	}
	s.Parameters.MaxHoldDays = nil
	if got := cleanMaxHoldDays(s); got != 15 {
		t.Fatalf("riskManagement fallback got %v", got)
	}
	s.RiskManagement.MaxHoldDays = &z
	if got := cleanMaxHoldDays(s); got != 0 {
		t.Fatalf("riskManagement 0 should be kept, got %v", got)
	}
	s.RiskManagement.MaxHoldDays = nil
	if got := cleanMaxHoldDays(s); got != 30 {
		t.Fatalf("both missing should default 30, got %v", got)
	}
}

func TestCleanCapitalUsageZeroOpensNothing(t *testing.T) {
	data := []types.OHLC{
		{Date: "2024-01-02", Open: 100, High: 110, Low: 90, Close: 91, Volume: 1000},
		{Date: "2024-01-03", Open: 91, High: 120, Low: 90, Close: 119, Volume: 1000},
	}
	s := types.DefaultIBSStrategy()
	s.RiskManagement.CapitalUsage = types.F64(0)
	got := RunClean(data, s, nil)
	if len(got.Trades) != 0 {
		t.Fatalf("capitalUsage 0 should not invest, got %d trades", len(got.Trades))
	}
	s.RiskManagement.CapitalUsage = nil
	got = RunClean(data, s, nil)
	if len(got.Trades) == 0 {
		t.Fatal("omitted capitalUsage should still trade at default 100%")
	}
}

func TestMarginExplicitZeroUsageAndMaintenance(t *testing.T) {
	market := []types.OHLC{
		{Date: "2024-01-01", Open: 100, High: 101, Low: 99, Close: 100, Volume: 1000},
		{Date: "2024-01-02", Open: 100, High: 101, Low: 99, Close: 100, Volume: 1000},
	}
	trades := []types.Trade{
		{ID: "t1", EntryDate: "2024-01-01", ExitDate: "2024-01-02", EntryPrice: 100, ExitPrice: 100, Quantity: 1, ExitReason: "ibs_signal"},
	}
	zero := SimulateMargin(MarginParams{
		Market: market, Trades: trades, InitialCapital: 10000, Leverage: 2,
		MaintenanceMarginPct: types.F64(0), CapitalUsagePct: types.F64(0),
	})
	if len(zero.Trades) != 0 {
		t.Fatalf("capitalUsagePct 0 should not open, got %+v", zero.Trades)
	}
	omitted := SimulateMargin(MarginParams{
		Market: market, Trades: trades, InitialCapital: 10000, Leverage: 2,
	})
	if len(omitted.Trades) == 0 {
		t.Fatal("omitted capitalUsagePct should default to 100%")
	}
}

func TestOptionsKeepsExplicitZeroRiskFreeRate(t *testing.T) {
	z := 0.0
	hold := 0
	weeks := 0
	cfg := OptionsConfig{RiskFreeRate: &z, ExpirationWeeks: &weeks, MaxHoldingDays: &hold}.resolve()
	if cfg.RiskFreeRate != 0 || cfg.ExpirationWeeks != 0 || cfg.MaxHoldingDays != 0 {
		t.Fatalf("explicit zeros got %+v", cfg)
	}
	def := OptionsConfig{}.resolve()
	if def.RiskFreeRate != 0.05 || def.ExpirationWeeks != 4 || def.MaxHoldingDays != 30 {
		t.Fatalf("omitted defaults got %+v", def)
	}
}
