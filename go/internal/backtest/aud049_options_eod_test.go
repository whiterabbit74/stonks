package backtest

import (
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-049: открытые на конец истории опционы не попадали в trades, хотя
// эквити их учитывала, — TotalTrades и WinRate считались без них.
func TestRunMultiOptionsClosesOpenPositionsAtEndOfData(t *testing.T) {
	var bars []types.OHLC
	for i, d := range []string{"2026-01-01", "2026-01-02", "2026-01-05", "2026-01-06"} {
		px := []float64{100, 115, 95, 102}[i]
		bars = append(bars, types.OHLC{Date: d, Open: px, High: px + 2, Low: px - 2, Close: px})
	}
	stock := []types.Trade{{
		ID: "s1", EntryDate: "2026-01-05", ExitDate: "2026-01-30",
		EntryPrice: 102, ExitPrice: 110,
		Context: &types.TradeContext{Ticker: "X"},
	}}
	_, trades, _ := RunMultiOptions(stock, []TickerIndexed{{Ticker: "X", Data: bars}},
		OptionsConfig{InitialCapital: 50000, StrikePct: 5, CapitalPct: 10,
			ExpirationWeeks: types.Int(4), MaxHoldingDays: types.Int(30)})
	if len(trades) != 1 {
		t.Fatalf("open option at end of data must be closed, got %d trades", len(trades))
	}
	if trades[0].ExitReason != "end_of_data" {
		t.Fatalf("exit reason %q", trades[0].ExitReason)
	}
}
