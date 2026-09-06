package backtest

import (
	"math"
	"testing"

	"mktorder.com/go/internal/indicators"
	"mktorder.com/go/internal/types"
)

// entryBar: IBS 0 — вход по закрытию 100.
func entryBar(date string) types.OHLC {
	return types.OHLC{Date: date, Open: 100, High: 200, Low: 100, Close: 100, Volume: 1000}
}

// exitBar: IBS 1 — выход по закрытию close.
func exitBar(date string, low, close float64) types.OHLC {
	return types.OHLC{Date: date, Open: close, High: close, Low: low, Close: close, Volume: 1000}
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

func almost(a, b float64) bool { return math.Abs(a-b) < 1e-6 }

// Плечо умножает движение цены: +10% по цене = +10/20/30% по счёту.
func TestLeverageScalesPriceMove(t *testing.T) {
	bars := []types.OHLC{entryBar("2024-01-02"), exitBar("2024-01-03", 100, 110)}
	for _, c := range []struct{ leverage, qty, final float64 }{{1, 100, 11000}, {2, 200, 12000}, {3, 300, 13000}} {
		final, trades, m := runLeverage(t, bars, c.leverage, 0)
		if trades[0].Quantity != c.qty || final != c.final {
			t.Fatalf("плечо %v: qty=%v final=%v, ждали %v и %v", c.leverage, trades[0].Quantity, final, c.qty, c.final)
		}
		if want := c.leverage * 10; !almost(m.TotalReturn, want) {
			t.Fatalf("плечо %v: доходность %v, ждали %v", c.leverage, m.TotalReturn, want)
		}
	}
}

// Пополнения масштабируют позицию, но не меняют доходность стратегии.
func TestContributionsDoNotChangeLeveragedReturn(t *testing.T) {
	bars := []types.OHLC{entryBar("2024-01-02"), exitBar("2024-01-03", 100, 110)}
	for _, leverage := range []float64{1, 2, 3} {
		_, _, base := runLeverage(t, bars, leverage, 0)
		final, trades, m := runLeverage(t, bars, leverage, 1000)
		if trades[0].Quantity != leverage*110 {
			t.Fatalf("плечо %v: пополнение не пошло в позицию, qty=%v", leverage, trades[0].Quantity)
		}
		if final != 11000+leverage*1100 {
			t.Fatalf("плечо %v: итог %v", leverage, final)
		}
		if !almost(m.TotalReturn, base.TotalReturn) || math.Abs(m.CAGR-base.CAGR) > 1e-6 {
			t.Fatalf("плечо %v: с пополнением ret=%v cagr=%v, без ret=%v cagr=%v", leverage, m.TotalReturn, m.CAGR, base.TotalReturn, base.CAGR)
		}
	}
}

// Без плеча убыток идёт один к одному; с плечом брокер закрывает позицию
// на поддерживающей марже 25%, и счёт останавливается на её уровне.
func TestLeverageLossAndMaintenanceLiquidation(t *testing.T) {
	bars := []types.OHLC{entryBar("2024-01-02"), exitBar("2024-01-03", 50, 60)}
	for _, c := range []struct {
		leverage, final float64
		reason          string
	}{
		{1, 6000, "ibs_signal"},
		{2, 10000 - 100.0/3*200, "margin_liquidation"}, // ликвидация по 66.67
		{3, 10000 - 100.0/9*300, "margin_liquidation"}, // ликвидация по 88.89
	} {
		final, trades, _ := runLeverage(t, bars, c.leverage, 0)
		if trades[0].ExitReason != c.reason || !almost(final, c.final) {
			t.Fatalf("плечо %v: %q итог %v, ждали %q и %v", c.leverage, trades[0].ExitReason, final, c.reason, c.final)
		}
		if c.reason == "margin_liquidation" {
			// после ликвидации остаётся ровно 25% рыночной стоимости позиции
			mv := trades[0].Quantity * trades[0].ExitPrice
			if !almost(final, 0.25*mv) {
				t.Fatalf("плечо %v: остаток %v, ждали 25%% от %v", c.leverage, final, mv)
			}
		}
	}
}

// Счёт, выбитый маржин-коллом, не «воскресает» на отскоке той же позиции.
func TestMarginLiquidationStopsResurrection(t *testing.T) {
	bars := []types.OHLC{
		entryBar("2024-01-02"),
		{Date: "2024-01-03", Open: 60, High: 100, Low: 55, Close: 60, Volume: 1000}, // IBS 0.11 — стратегия держала бы
		{Date: "2024-01-04", Open: 100, High: 110, Low: 100, Close: 100, Volume: 1000},
	}
	td := TickerIndexed{Ticker: "AAA", Data: bars, IBSValues: indicators.IBS(bars)}
	_, final, _, trades, _, _ := RunSinglePosition([]TickerIndexed{td}, types.DefaultIBSStrategy(), 3, SingleOptions{AllowSameDayReentry: true})
	if trades[0].ExitReason != "margin_liquidation" || trades[0].ExitDate != "2024-01-03" {
		t.Fatalf("ждали margin_liquidation 2024-01-03, получили %q %s", trades[0].ExitReason, trades[0].ExitDate)
	}
	if !almost(trades[0].ExitPrice, 800.0/9) {
		t.Fatalf("цена ликвидации %v, ждали 88.89", trades[0].ExitPrice)
	}
	// счёт продолжает торговать тем, что осталось, а не всей исходной суммой
	if !almost(final, 10000-100.0/9*300) {
		t.Fatalf("итог %v, ждали %v", final, 10000-100.0/9*300)
	}
}

// В день входа ликвидации нет: цена входа выше уровня маржин-колла.
func TestNoLiquidationOnEntryBar(t *testing.T) {
	bars := []types.OHLC{
		{Date: "2024-01-02", Open: 40, High: 200, Low: 30, Close: 40, Volume: 1000}, // IBS 0.06, вход по 40
		exitBar("2024-01-03", 40, 44),
	}
	_, trades, _ := runLeverage(t, bars, 3, 0)
	if trades[0].ExitReason != "ibs_signal" {
		t.Fatalf("причина выхода %q, ждали ibs_signal", trades[0].ExitReason)
	}
}
