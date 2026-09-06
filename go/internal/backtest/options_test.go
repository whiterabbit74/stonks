package backtest

import (
	"testing"

	"mktorder.com/go/internal/goldens"
	"mktorder.com/go/internal/splits"
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

// A ticker carrying an unapplied split table must be back-adjusted before the
// option legs are priced: raw pre-split closes value the underlying twice over.
func TestRunMultiOptionsAppliesSplits(t *testing.T) {
	bars := []types.OHLC{
		{Date: "2024-01-02", Open: 200, High: 210, Low: 190, Close: 200},
		{Date: "2024-01-03", Open: 200, High: 212, Low: 196, Close: 210},
		{Date: "2024-01-04", Open: 210, High: 214, Low: 200, Close: 206},
		{Date: "2024-01-05", Open: 206, High: 212, Low: 200, Close: 208},
		{Date: "2024-01-08", Open: 208, High: 214, Low: 202, Close: 204},
		{Date: "2024-01-09", Open: 102, High: 107, Low: 100, Close: 103},
		{Date: "2024-01-10", Open: 103, High: 108, Low: 101, Close: 105},
	}
	ev := []types.SplitEvent{{Date: "2024-01-09", Factor: 2}}
	adjusted := splits.AdjustOHLC(bars, ev)
	trades := []types.Trade{{ID: "t1", EntryDate: "2024-01-04", ExitDate: "2024-01-10", Context: &types.TradeContext{Ticker: "X"}}}
	cfg := OptionsConfig{InitialCapital: 100000, StrikePct: 10, VolAdjPct: 20, CapitalPct: 10}

	_, withSplits, _ := RunMultiOptions(trades, []TickerIndexed{{Ticker: "X", Data: bars, Splits: ev}}, cfg)
	_, preAdjusted, _ := RunMultiOptions(trades, []TickerIndexed{{Ticker: "X", Data: adjusted}}, cfg)
	if len(withSplits) == 0 || len(withSplits) != len(preAdjusted) {
		t.Fatalf("trade count %d vs %d", len(withSplits), len(preAdjusted))
	}
	for i := range withSplits {
		if withSplits[i].EntryPrice != preAdjusted[i].EntryPrice {
			t.Fatalf("trade %d entry %v, want %v: splits not applied", i, withSplits[i].EntryPrice, preAdjusted[i].EntryPrice)
		}
	}
}
