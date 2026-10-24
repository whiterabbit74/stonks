package backtest

import (
	"math"
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-145: liquidation clipped the position's negative equity at zero and
// kept the free cash whole, forgiving part of the loan.
func TestMarginLiquidationRepaysDebtFromWholeAccount(t *testing.T) {
	usage := 50.0
	bars := []types.OHLC{
		{Date: "2026-01-01", Open: 100, High: 101, Low: 99, Close: 100},
		{Date: "2026-01-02", Open: 60, High: 60, Low: 40, Close: 50},
	}
	res := SimulateMargin(MarginParams{
		Market: bars, InitialCapital: 1000, Leverage: 3, CapitalUsagePct: &usage,
		Trades: []types.Trade{{ID: "t", EntryDate: "2026-01-01", EntryPrice: 100, ExitDate: "2026-01-02", ExitPrice: 50}},
	})
	// 15 shares, 1000 borrowed, 500 free; liquidation at (1000-500)/(15×0.75).
	want := 500 + 15*(500.0/11.25) - 1000
	if len(res.Trades) != 1 || res.Trades[0].ExitReason != "margin_liquidation" {
		t.Fatalf("trades = %+v", res.Trades)
	}
	if math.Abs(res.FinalValue-want) > 1e-6 {
		t.Fatalf("final = %v, want %v", res.FinalValue, want)
	}
	if math.Abs(res.Trades[0].PnL-(want-1000)) > 1e-6 {
		t.Fatalf("pnl = %v, want %v", res.Trades[0].PnL, want-1000)
	}
}
