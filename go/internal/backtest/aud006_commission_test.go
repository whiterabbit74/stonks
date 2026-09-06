package backtest

import (
	"testing"

	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

// AUD-006a (docs/audits/REGISTRY.md): RunClean receives a Strategy whose
// RiskManagement.Commission is filled in by httpapi/helpers.go, and used to
// ignore it entirely — a commission the operator set changed nothing.

func commissionBars() []types.OHLC {
	var bars []types.OHLC
	date := "2026-01-05"
	px := 100.0
	for i := 0; i < 60; i++ {
		lo, hi := px-5, px+5
		cl := lo + 0.5
		if i%3 == 0 {
			cl = hi - 0.5
		}
		bars = append(bars, types.OHLC{Date: date, Open: px, High: hi, Low: lo, Close: cl, Volume: 1000})
		date = tradingdate.AddDays(date, 1)
		px += 0.3
	}
	return bars
}

// capitalUsage stays under 100 so the fee has cash to come out of. At 100%
// the whole balance is committed to shares and any fee that does not fit in
// the whole-share rounding slack skips the entry — the same rule
// RunSinglePosition applies, and the reason the last case below trades zero
// times.
func runWithCommission(c types.Commission) types.BacktestResult {
	s := types.DefaultIBSStrategy()
	s.RiskManagement.Commission = c
	s.RiskManagement.CapitalUsage = types.F64(90)
	return RunClean(commissionBars(), s, nil)
}

func TestAUD006CleanAppliesCommission(t *testing.T) {
	free := runWithCommission(types.Commission{Type: "percentage", Percentage: 0})
	if len(free.Trades) == 0 {
		t.Fatal("the fixture must trade, otherwise it proves nothing")
	}

	// A commission the strategy carries has to cost something.
	charged := runWithCommission(types.Commission{Type: "percentage", Percentage: 0.5})
	if len(charged.Trades) != len(free.Trades) {
		t.Fatalf("half a percent should not change the trade count: %d vs %d", len(charged.Trades), len(free.Trades))
	}
	if !(charged.Metrics.TotalReturn < free.Metrics.TotalReturn) {
		t.Fatalf("commission did not reduce the return: %.4f with, %.4f without",
			charged.Metrics.TotalReturn, free.Metrics.TotalReturn)
	}

	// And it has to be charged on both legs, so twice the rate costs more.
	double := runWithCommission(types.Commission{Type: "percentage", Percentage: 1})
	if !(double.Metrics.TotalReturn < charged.Metrics.TotalReturn) {
		t.Fatalf("doubling the rate did not cost more: %.4f vs %.4f",
			double.Metrics.TotalReturn, charged.Metrics.TotalReturn)
	}

	// An entry the account cannot cover once the fee is added is not taken,
	// the same rule RunSinglePosition applies: 90% of 10000 in shares plus a
	// 5000 fee does not fit in the balance.
	unaffordable := runWithCommission(types.Commission{Type: "fixed", Fixed: 5000})
	if len(unaffordable.Trades) != 0 {
		t.Fatalf("a fee larger than the free cash must block the entry, got %d trades", len(unaffordable.Trades))
	}
}
