package backtest

import (
	"testing"

	"mktorder.com/go/internal/optionsmath"
	"mktorder.com/go/internal/types"
)

func optionBars(dates []string, prices []float64) []types.OHLC {
	var bars []types.OHLC
	for i, d := range dates {
		px := prices[i]
		bars = append(bars, types.OHLC{Date: d, Open: px, High: px + 2, Low: px - 2, Close: px})
	}
	return bars
}

// AUD-094: на дате, которой нет в истории тикера, открытый опцион оценивался в
// ноль и мог вообще не попасть в trades.
func TestRunMultiOptionsKeepsValueOnMissingBar(t *testing.T) {
	x := optionBars([]string{"2026-01-01", "2026-01-02", "2026-01-05", "2026-01-06"}, []float64{100, 115, 95, 102})
	y := optionBars([]string{"2026-01-07"}, []float64{50})
	stock := []types.Trade{{
		ID: "s1", EntryDate: "2026-01-05", ExitDate: "2026-01-30",
		EntryPrice: 102, ExitPrice: 110,
		Context: &types.TradeContext{Ticker: "X"},
	}}
	cfg := OptionsConfig{InitialCapital: 50000, StrikePct: 5, CapitalPct: 10,
		ExpirationWeeks: types.Int(4), MaxHoldingDays: types.Int(30)}
	equity, trades, final := RunMultiOptions(stock, []TickerIndexed{
		{Ticker: "X", Data: x}, {Ticker: "Y", Data: y},
	}, cfg)
	if len(trades) != 1 {
		t.Fatalf("option must be closed at end of data, got %d trades", len(trades))
	}
	prev := equity[len(equity)-2].Value
	last := equity[len(equity)-1].Value
	if last < prev*0.9 {
		t.Fatalf("open option lost its value on the gap date: %v -> %v", prev, last)
	}
	if final < prev*0.9 {
		t.Fatalf("final value %v collapsed against %v", final, prev)
	}
}

// AUD-095: опцион истекает раньше выхода из акции, но ExitDate оставался
// скопированным у акции.
func TestRunMultiOptionsExpiryUsesExpiryDate(t *testing.T) {
	bars := optionBars([]string{
		"2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09",
		"2026-01-12", "2026-01-13", "2026-01-14", "2026-01-15", "2026-01-16",
		"2026-01-20", "2026-01-21",
	}, []float64{100, 115, 95, 102, 104, 105, 106, 107, 108, 109, 110, 111})
	stock := []types.Trade{{
		ID: "s1", EntryDate: "2026-01-07", ExitDate: "2026-01-30",
		EntryPrice: 95, ExitPrice: 110,
		Context: &types.TradeContext{Ticker: "X"},
	}}
	_, trades, _ := RunMultiOptions(stock, []TickerIndexed{{Ticker: "X", Data: bars}},
		OptionsConfig{InitialCapital: 50000, StrikePct: 5, CapitalPct: 10,
			ExpirationWeeks: types.Int(1), MaxHoldingDays: types.Int(30)})
	if len(trades) != 1 {
		t.Fatalf("got %d trades", len(trades))
	}
	if trades[0].ExitReason != "option_expired" {
		t.Fatalf("exit reason %q", trades[0].ExitReason)
	}
	want := optionsmath.ExpirationDate("2026-01-07", 1)
	if trades[0].ExitDate != want {
		t.Fatalf("exit date %q, want the expiration day %q", trades[0].ExitDate, want)
	}
}
