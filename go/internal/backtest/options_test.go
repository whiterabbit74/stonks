package backtest

import (
	"testing"

	"mktorder.com/go/internal/goldens"
	"mktorder.com/go/internal/types"
)

func TestRunOptionsDoesNotMutateCallerContext(t *testing.T) {
	bars := goldens.Bars("googl-bars.json")
	clean := RunClean(bars, types.DefaultIBSStrategy(), nil)
	if len(clean.Trades) == 0 {
		t.Fatal("need stock trades")
	}
	orig := make([]types.TradeContext, len(clean.Trades))
	origMaps := make([]map[string]float64, len(clean.Trades))
	for i, tr := range clean.Trades {
		if tr.Context == nil {
			continue
		}
		orig[i] = *tr.Context
		if tr.Context.IndicatorValues != nil {
			m := make(map[string]float64, len(tr.Context.IndicatorValues))
			for k, v := range tr.Context.IndicatorValues {
				m[k] = v
			}
			origMaps[i] = m
		}
	}
	cfg := OptionsConfig{StrikePct: 10, VolAdjPct: 20, CapitalPct: 10, RiskFreeRate: types.F64(0.05), ExpirationWeeks: types.Int(4), MaxHoldingDays: types.Int(30)}
	RunOptions(clean.Trades, bars, cfg)
	RunOptions(clean.Trades, bars, cfg)
	for i, tr := range clean.Trades {
		if tr.Context == nil {
			if origMaps[i] != nil || orig[i].CurrentCapitalAfterExit != 0 {
				t.Fatalf("trade %d context became nil", i)
			}
			continue
		}
		if tr.Context.CurrentCapitalAfterExit != orig[i].CurrentCapitalAfterExit {
			t.Fatalf("trade %d CurrentCapitalAfterExit mutated %v -> %v", i, orig[i].CurrentCapitalAfterExit, tr.Context.CurrentCapitalAfterExit)
		}
		if tr.Context.InitialInvestment != orig[i].InitialInvestment {
			t.Fatalf("trade %d InitialInvestment mutated %v -> %v", i, orig[i].InitialInvestment, tr.Context.InitialInvestment)
		}
		if tr.Context.NetProceeds != orig[i].NetProceeds {
			t.Fatalf("trade %d NetProceeds mutated %v -> %v", i, orig[i].NetProceeds, tr.Context.NetProceeds)
		}
		for k, v := range origMaps[i] {
			if tr.Context.IndicatorValues[k] != v {
				t.Fatalf("trade %d indicator %s mutated %v -> %v", i, k, v, tr.Context.IndicatorValues[k])
			}
		}
	}
}

func TestRunMultiOptionsDoesNotMutateCallerContext(t *testing.T) {
	bars := goldens.Bars("googl-bars.json")
	clean := RunClean(bars, types.DefaultIBSStrategy(), nil)
	for i := range clean.Trades {
		if clean.Trades[i].Context == nil {
			clean.Trades[i].Context = &types.TradeContext{}
		}
		clean.Trades[i].Context.Ticker = "GOOGL"
		clean.Trades[i].Context.InitialInvestment = 123
	}
	before := make([]types.TradeContext, len(clean.Trades))
	for i, tr := range clean.Trades {
		before[i] = *tr.Context
	}
	tickers := []TickerIndexed{{Ticker: "GOOGL", Data: bars}}
	cfg := OptionsConfig{StrikePct: 10, VolAdjPct: 20, CapitalPct: 10, RiskFreeRate: types.F64(0.05), ExpirationWeeks: types.Int(4), MaxHoldingDays: types.Int(30)}
	RunMultiOptions(clean.Trades, tickers, cfg)
	RunMultiOptions(clean.Trades, tickers, cfg)
	for i, tr := range clean.Trades {
		if tr.Context == nil {
			t.Fatalf("multi trade %d context became nil", i)
		}
		if tr.Context.Ticker != before[i].Ticker || tr.Context.InitialInvestment != before[i].InitialInvestment {
			t.Fatalf("multi trade %d context mutated: %+v", i, tr.Context)
		}
		if tr.Context.NetProceeds != before[i].NetProceeds || tr.Context.CurrentCapitalAfterExit != before[i].CurrentCapitalAfterExit {
			t.Fatalf("multi trade %d accumulated options fields: %+v want afterExit=%v net=%v", i, tr.Context, before[i].CurrentCapitalAfterExit, before[i].NetProceeds)
		}
	}
}
