package backtest

import (
	"math"
	"testing"

	"mktorder.com/go/internal/indicators"
	"mktorder.com/go/internal/types"
)

// leverageBars: вход на первом баре (IBS 0), выход на втором (IBS 1) по цене exit.
func leverageBars(exit float64) []types.OHLC {
	return []types.OHLC{
		{Date: "2024-01-02", Open: 100, High: 200, Low: 100, Close: 100, Volume: 1000},
		{Date: "2024-01-03", Open: exit, High: exit, Low: math.Min(exit, 100) - 50, Close: exit, Volume: 1000},
	}
}

func runLeverage(t *testing.T, bars []types.OHLC, leverage, monthly float64) (float64, []types.Trade, types.BacktestMetrics) {
	t.Helper()
	td := TickerIndexed{Ticker: "AAA", Data: bars, IBSValues: indicators.IBS(bars)}
	_, final, _, trades, m, _ := RunSinglePosition([]TickerIndexed{td}, types.DefaultIBSStrategy(), leverage, SingleOptions{AllowSameDayReentry: true, MonthlyAmount: monthly})
	if len(trades) != 1 {
		t.Fatalf("ждали одну сделку, получили %d", len(trades))
	}
	return final, trades, m
}

// Плечо умножает движение цены: +10% по цене = +10/20/30% по счёту.
func TestLeverageScalesPriceMove(t *testing.T) {
	for _, c := range []struct {
		leverage, qty, final float64
	}{{1, 100, 11000}, {2, 200, 12000}, {3, 300, 13000}} {
		final, trades, m := runLeverage(t, leverageBars(110), c.leverage, 0)
		if trades[0].Quantity != c.qty || final != c.final {
			t.Fatalf("плечо %v: qty=%v final=%v, ждали %v и %v", c.leverage, trades[0].Quantity, final, c.qty, c.final)
		}
		if want := (c.leverage * 10); math.Abs(m.TotalReturn-want) > 1e-9 {
			t.Fatalf("плечо %v: доходность %v, ждали %v", c.leverage, m.TotalReturn, want)
		}
	}
}

// Убыток тоже умножается, но счёт не уходит ниже нуля.
func TestLeverageScalesLossAndFloorsAtZero(t *testing.T) {
	for _, c := range []struct{ leverage, final float64 }{{1, 6000}, {2, 2000}, {3, 0}} {
		final, _, _ := runLeverage(t, leverageBars(60), c.leverage, 0)
		if final != c.final {
			t.Fatalf("плечо %v: итог %v, ждали %v", c.leverage, final, c.final)
		}
	}
}

// Пополнения масштабируют позицию, но не меняют доходность стратегии.
func TestContributionsDoNotChangeLeveragedReturn(t *testing.T) {
	for _, leverage := range []float64{1, 2, 3} {
		_, _, base := runLeverage(t, leverageBars(110), leverage, 0)
		final, trades, m := runLeverage(t, leverageBars(110), leverage, 1000)
		if trades[0].Quantity != leverage*110 {
			t.Fatalf("плечо %v: пополнение не пошло в позицию, qty=%v", leverage, trades[0].Quantity)
		}
		if final != 11000+leverage*1100 {
			t.Fatalf("плечо %v: итог %v", leverage, final)
		}
		if math.Abs(m.TotalReturn-base.TotalReturn) > 1e-9 || math.Abs(m.CAGR-base.CAGR) > 1e-6 {
			t.Fatalf("плечо %v: с пополнением ret=%v cagr=%v, без ret=%v cagr=%v", leverage, m.TotalReturn, m.CAGR, base.TotalReturn, base.CAGR)
		}
	}
}
