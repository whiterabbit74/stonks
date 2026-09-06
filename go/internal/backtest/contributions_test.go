package backtest

import (
	"math"
	"testing"

	"mktorder.com/go/internal/indicators"
	"mktorder.com/go/internal/types"
)

// Бары с закрытием на максимуме дня: IBS = 1, сделок не будет.
func flatBars(dates []string) []types.OHLC {
	out := make([]types.OHLC, len(dates))
	for i, d := range dates {
		out[i] = types.OHLC{Date: d, Open: 100, High: 100, Low: 90, Close: 100, Volume: 1000}
	}
	return out
}

func runWithContrib(t *testing.T, bars []types.OHLC, monthly float64) (float64, types.BacktestMetrics) {
	t.Helper()
	td := TickerIndexed{Ticker: "AAA", Data: bars, IBSValues: indicators.IBS(bars)}
	_, final, _, trades, m, _ := RunSinglePosition([]TickerIndexed{td}, types.DefaultIBSStrategy(), 1, SingleOptions{AllowSameDayReentry: true, MonthlyAmount: monthly})
	if len(trades) != 0 {
		t.Fatalf("не ждали сделок, получили %d", len(trades))
	}
	return final, m
}

func TestMonthlyContributionOncePerMonth(t *testing.T) {
	bars := flatBars([]string{
		"2024-01-02", "2024-01-31",
		"2024-02-01", "2024-02-29",
		"2024-03-01", "2024-03-28",
	})
	final, m := runWithContrib(t, bars, 500)
	if m.ContributionCount != 3 || m.TotalContribution != 1500 {
		t.Fatalf("пополнения: count=%d total=%v", m.ContributionCount, m.TotalContribution)
	}
	if final != 10000+1500 {
		t.Fatalf("итог %v, ждали 11500", final)
	}
	// Без сделок пополнения не должны выглядеть прибылью.
	if m.NetProfit != 0 || m.TotalReturn != 0 || math.Abs(m.CAGR) > 1e-9 {
		t.Fatalf("пополнения попали в доходность: netProfit=%v totalReturn=%v cagr=%v", m.NetProfit, m.TotalReturn, m.CAGR)
	}
}

func TestMonthlyContributionSkippedWhenZero(t *testing.T) {
	bars := flatBars([]string{"2024-01-02", "2024-02-01"})
	final, m := runWithContrib(t, bars, 0)
	if m.ContributionCount != 0 || m.TotalContribution != 0 || final != 10000 {
		t.Fatalf("без пополнений: count=%d total=%v final=%v", m.ContributionCount, m.TotalContribution, final)
	}
}
