package backtest

import (
	"testing"

	"mktorder.com/go/internal/goldens"
	"mktorder.com/go/internal/types"
)

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
