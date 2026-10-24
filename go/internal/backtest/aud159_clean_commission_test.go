package backtest

import (
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-159: RunClean bought the whole budget and skipped the entry when the
// commission did not fit, instead of buying one share less (AUD-122 in Clean).
func TestCleanEntryShrinksWhenCommissionDoesNotFit(t *testing.T) {
	for _, exec := range []string{"", "nextOpen"} {
		bars := append([]types.OHLC{}, entryExitBars...)
		bars = append(bars, types.OHLC{Date: "2026-01-05", Open: 110, High: 120, Low: 100, Close: 120})
		res := RunClean(bars, feeStrategy(1000, types.Commission{Type: "fixed", Fixed: 1}), &CleanOptions{EntryExecution: exec})
		if len(res.Trades) == 0 || res.Trades[0].Quantity != 9 {
			t.Fatalf("exec %q: trades = %+v, want first quantity 9", exec, res.Trades)
		}
	}
}
