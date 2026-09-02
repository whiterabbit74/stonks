package backtest

import (
	"testing"

	"mktorder.com/go/internal/goldens"
	"mktorder.com/go/internal/indicators"
	"mktorder.com/go/internal/types"
)

func assertTrades(t *testing.T, name string, got []types.Trade, want []types.CompactTrade) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s trade count got %d want %d", name, len(got), len(want))
	}
	for i := range want {
		g := types.Compact(got[i])
		w := want[i]
		if g.EntryDate != w.EntryDate || g.ExitDate != w.ExitDate {
			t.Errorf("%s[%d] dates got %s->%s want %s->%s", name, i, g.EntryDate, g.ExitDate, w.EntryDate, w.ExitDate)
		}
		if g.ExitReason != w.ExitReason {
			t.Errorf("%s[%d] reason got %s want %s", name, i, g.ExitReason, w.ExitReason)
		}
		if g.Duration != w.Duration {
			t.Errorf("%s[%d] duration got %d want %d", name, i, g.Duration, w.Duration)
		}
		if !goldens.MustAlmost(g.EntryPrice, w.EntryPrice, 1e-12) || !goldens.MustAlmost(g.ExitPrice, w.ExitPrice, 1e-12) {
			t.Errorf("%s[%d] prices got %v/%v want %v/%v", name, i, g.EntryPrice, g.ExitPrice, w.EntryPrice, w.ExitPrice)
		}
		if !goldens.MustAlmost(g.Quantity, w.Quantity, 1e-12) {
			t.Errorf("%s[%d] qty got %v want %v", name, i, g.Quantity, w.Quantity)
		}
		if !goldens.MustAlmost(g.PnL, w.PnL, 1e-9) {
			t.Errorf("%s[%d] pnl got %v want %v", name, i, g.PnL, w.PnL)
		}
	}
}

func TestGOOGLCleanMatchesGolden(t *testing.T) {
	bars := goldens.Bars("googl-bars.json")
	want := goldens.CompactTrades("googl-clean-trades.json")
	got := RunClean(bars, types.DefaultIBSStrategy(), nil)
	assertTrades(t, "clean", got.Trades, want)
	via := RunBacktest(bars, types.DefaultIBSStrategy())
	assertTrades(t, "runBacktest", via.Trades, goldens.CompactTrades("googl-runbacktest-trades.json"))
	var wantM types.PerformanceMetrics
	goldens.Load("googl-metrics-calculator.json", &wantM)
	if got.Metrics.TotalTrades != wantM.TotalTrades {
		t.Fatalf("metrics trades %d want %d", got.Metrics.TotalTrades, wantM.TotalTrades)
	}
	if !goldens.MustAlmost(got.Metrics.TotalReturn, wantM.TotalReturn, 1e-9) {
		t.Fatalf("totalReturn %v want %v", got.Metrics.TotalReturn, wantM.TotalReturn)
	}
	if !goldens.MustAlmost(got.Metrics.MaxDrawdown, wantM.MaxDrawdown, 1e-9) {
		t.Fatalf("maxDD %v want %v", got.Metrics.MaxDrawdown, wantM.MaxDrawdown)
	}
	if !goldens.MustAlmost(got.Metrics.WinRate, wantM.WinRate, 1e-9) {
		t.Fatalf("winRate %v want %v", got.Metrics.WinRate, wantM.WinRate)
	}
}

func TestGOOGLBuyAtCloseGolden(t *testing.T) {
	bars := goldens.Bars("googl-bars.json")
	got := RunBuyAtClose(bars, types.DefaultIBSStrategy())
	assertTrades(t, "buy-at-close", got.Trades, goldens.CompactTrades("googl-buy-at-close-trades.json"))
}

func TestGOOGLNoStopLossGolden(t *testing.T) {
	bars := goldens.Bars("googl-bars.json")
	never := RunNoStopLoss(bars, types.DefaultIBSStrategy(), NoStopLossConfig{ExitMode: "never"})
	assertTrades(t, "nostoploss-never", never.Trades, goldens.CompactTrades("googl-nostoploss-never-trades.json"))
	ibsOnly := RunNoStopLoss(bars, types.DefaultIBSStrategy(), NoStopLossConfig{ExitMode: "ibs-only", RequireProfitableExit: true})
	assertTrades(t, "nostoploss-ibs-profit", ibsOnly.Trades, goldens.CompactTrades("googl-nostoploss-ibs-profit-trades.json"))
}

func TestGOOGLSinglePositionGolden(t *testing.T) {
	bars := goldens.Bars("googl-bars.json")
	ibs := indicators.IBS(bars)
	eq, _, _, trades, _, _ := RunSinglePosition([]TickerIndexed{{Ticker: "GOOGL", Data: bars, IBSValues: ibs}}, types.DefaultIBSStrategy(), 1, SingleOptions{})
	assertTrades(t, "single", trades, goldens.CompactTrades("googl-single-position-trades.json"))
	if len(eq) == 0 {
		t.Fatal("empty equity")
	}
}

func TestSingleTakeProfitGolden(t *testing.T) {
	tp := 2.0
	data := []types.OHLC{
		{Date: "2024-01-01", Open: 101, High: 112, Low: 99, Close: 100, Volume: 1000},
		{Date: "2024-01-02", Open: 100, High: 103, Low: 98, Close: 98.2, Volume: 1000},
		{Date: "2024-01-03", Open: 99, High: 101, Low: 98, Close: 99, Volume: 1000},
	}
	ibs := make([]float64, len(data))
	for i, b := range data {
		r := b.High - b.Low
		if r > 0 {
			ibs[i] = (b.Close - b.Low) / r
		} else {
			ibs[i] = 0.5
		}
	}
	_, _, _, trades, _, _ := RunSinglePosition([]TickerIndexed{{Ticker: "AAPL", Data: data, IBSValues: ibs}}, types.DefaultIBSStrategy(), 1, SingleOptions{AllowSameDayReentry: true, TakeProfitPercent: &tp})
	assertTrades(t, "tp", trades, goldens.CompactTrades("single-position-takeprofit.json"))
}

func TestGOOGLOptionsGolden(t *testing.T) {
	bars := goldens.Bars("googl-bars.json")
	clean := RunClean(bars, types.DefaultIBSStrategy(), nil)
	_, trades, final := RunOptions(clean.Trades, bars, OptionsConfig{StrikePct: 10, VolAdjPct: 20, CapitalPct: 10, RiskFreeRate: 0.05, ExpirationWeeks: 4, MaxHoldingDays: 30})
	var wantFinal struct {
		FinalValue float64 `json:"finalValue"`
		TradeCount int     `json:"tradeCount"`
	}
	goldens.Load("googl-options-final.json", &wantFinal)
	if len(trades) != wantFinal.TradeCount {
		t.Fatalf("options trades %d want %d", len(trades), wantFinal.TradeCount)
	}
	if !goldens.MustAlmost(final, wantFinal.FinalValue, 1e-9) {
		t.Fatalf("options final %v want %v", final, wantFinal.FinalValue)
	}
	want := goldens.CompactTrades("googl-options-trades.json")
	if len(want) != len(trades) {
		t.Fatalf("compact mismatch %d %d", len(trades), len(want))
	}
	for i := range want {
		if trades[i].EntryDate != want[i].EntryDate || trades[i].ExitDate != want[i].ExitDate || trades[i].ExitReason != want[i].ExitReason {
			t.Errorf("options[%d] %s->%s %s want %s->%s %s", i, trades[i].EntryDate, trades[i].ExitDate, trades[i].ExitReason, want[i].EntryDate, want[i].ExitDate, want[i].ExitReason)
		}
	}
}

func TestGOOGLBuyAtClose4Golden(t *testing.T) {
	bars := goldens.Bars("googl-bars.json")
	ibs := indicators.IBS(bars)
	got := RunBuyAtClose4([]TickerIndexed{{Ticker: "GOOGL", Data: bars, IBSValues: ibs}}, types.DefaultIBSStrategy(), 1)
	var wantFinal struct {
		FinalValue  float64 `json:"finalValue"`
		TradeCount  int     `json:"tradeCount"`
		MaxDrawdown float64 `json:"maxDrawdown"`
	}
	goldens.Load("googl-bac4-final.json", &wantFinal)
	if len(got.Trades) != wantFinal.TradeCount {
		t.Fatalf("bac4 trades %d want %d", len(got.Trades), wantFinal.TradeCount)
	}
	if !goldens.MustAlmost(got.FinalValue, wantFinal.FinalValue, 1e-9) {
		t.Fatalf("bac4 final %v want %v", got.FinalValue, wantFinal.FinalValue)
	}
	assertTrades(t, "bac4", got.Trades, goldens.CompactTrades("googl-bac4-trades.json"))
}

func TestGOOGLOptionsMultiGolden(t *testing.T) {
	bars := goldens.Bars("googl-bars.json")
	ibs := indicators.IBS(bars)
	_, _, _, stockTrades, _, _ := RunSinglePosition([]TickerIndexed{{Ticker: "GOOGL", Data: bars, IBSValues: ibs}}, types.DefaultIBSStrategy(), 1, SingleOptions{})
	_, trades, final := RunMultiOptions(stockTrades, []TickerIndexed{{Ticker: "GOOGL", Data: bars, IBSValues: ibs}}, OptionsConfig{StrikePct: 10, VolAdjPct: 20, CapitalPct: 10, RiskFreeRate: 0.05, ExpirationWeeks: 4, MaxHoldingDays: 30})
	var wantFinal struct {
		FinalValue float64 `json:"finalValue"`
		TradeCount int     `json:"tradeCount"`
	}
	goldens.Load("googl-options-multi-final.json", &wantFinal)
	if len(trades) != wantFinal.TradeCount {
		t.Fatalf("options-multi trades %d want %d", len(trades), wantFinal.TradeCount)
	}
	if !goldens.MustAlmost(final, wantFinal.FinalValue, 1e-9) {
		t.Fatalf("options-multi final %v want %v", final, wantFinal.FinalValue)
	}
	assertTrades(t, "options-multi", trades, goldens.CompactTrades("googl-options-multi-trades.json"))
}

func TestGOOGLEMAGolden(t *testing.T) {
	bars := goldens.Bars("googl-bars.json")
	got := RunEmaZone([]TickerIndexed{{Ticker: "GOOGL", Data: bars}}, EmaParams{
		InitialCapital: 10000, Leverage: 1, EmaPeriod: 200,
		BuyZones: []EmaZone{{ID: "buy-20", LevelPct: -20, Enabled: true}},
		SellZones: []EmaZone{{ID: "sell-40", LevelPct: 40, Enabled: true}},
		SignalSource: "close", EmaStartMode: "full_history",
	})
	var want struct {
		FinalValue  float64 `json:"finalValue"`
		TradeCount  int     `json:"tradeCount"`
		MaxDrawdown float64 `json:"maxDrawdown"`
	}
	goldens.Load("googl-ema-final.json", &want)
	if len(got.Trades) != want.TradeCount {
		t.Fatalf("ema trades %d want %d", len(got.Trades), want.TradeCount)
	}
	if !goldens.MustAlmost(got.FinalValue, want.FinalValue, 1e-9) {
		t.Fatalf("ema final %v want %v", got.FinalValue, want.FinalValue)
	}
	assertTrades(t, "ema", got.Trades, goldens.CompactTrades("googl-ema-trades.json"))
}

func TestMarginGolden(t *testing.T) {
	market := []types.OHLC{
		{Date: "2024-01-01", Open: 100, High: 101, Low: 99, Close: 100, Volume: 1000},
		{Date: "2024-01-02", Open: 100, High: 101, Low: 60, Close: 62, Volume: 1000},
		{Date: "2024-01-03", Open: 62, High: 64, Low: 58, Close: 60, Volume: 1000},
		{Date: "2024-01-04", Open: 60, High: 63, Low: 59, Close: 61, Volume: 1000},
	}
	trades := []types.Trade{
		{ID: "t1", EntryDate: "2024-01-01", ExitDate: "2024-01-03", EntryPrice: 100, ExitPrice: 110, Quantity: 1, ExitReason: "ibs_signal"},
		{ID: "t2", EntryDate: "2024-01-03", ExitDate: "2024-01-04", EntryPrice: 60, ExitPrice: 61, Quantity: 1, ExitReason: "ibs_signal"},
	}
	got := SimulateMargin(MarginParams{Market: market, Trades: trades, InitialCapital: 10000, Leverage: 2, MaintenanceMarginPct: 25, CapitalUsagePct: 100})
	if got.LiquidationEvent == nil {
		t.Fatal("expected liquidation")
	}
	if got.Trades[0].ExitReason != "margin_liquidation" || got.Trades[0].ExitDate != "2024-01-02" {
		t.Fatalf("liq trade %+v", got.Trades[0])
	}
	if !goldens.MustAlmost(got.Trades[0].ExitPrice, 66.66666666666667, 1e-9) {
		t.Fatalf("exit price %v", got.Trades[0].ExitPrice)
	}
}

func TestSampleClean(t *testing.T) {
	bars := goldens.Bars("sample-bars.json")
	got := RunClean(bars, types.DefaultIBSStrategy(), nil)
	assertTrades(t, "sample-clean", got.Trades, goldens.CompactTrades("sample-clean-trades.json"))
}
