package backtest

import (
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-143: a trade entering on the day the previous one exited was skipped.
func TestSimulateMarginKeepsSameDayReentry(t *testing.T) {
	bars := []types.OHLC{
		{Date: "2026-01-01", Open: 100, High: 101, Low: 99, Close: 100},
		{Date: "2026-01-02", Open: 100, High: 106, Low: 99, Close: 105},
		{Date: "2026-01-05", Open: 105, High: 111, Low: 104, Close: 110},
	}
	res := SimulateMargin(MarginParams{
		Market: bars, InitialCapital: 10000, Leverage: 1,
		Trades: []types.Trade{
			{ID: "t1", EntryDate: "2026-01-01", EntryPrice: 100, ExitDate: "2026-01-02", ExitPrice: 105},
			{ID: "t2", EntryDate: "2026-01-02", EntryPrice: 105, ExitDate: "2026-01-05", ExitPrice: 110},
		},
	})
	if len(res.Trades) != 2 || res.Trades[1].ID != "t2" {
		t.Fatalf("trades = %+v", res.Trades)
	}
}

// AUD-158: the trade opened by a same-day re-entry that also exits that day
// was held to the end of data.
func TestSimulateMarginReentryExitsSameDay(t *testing.T) {
	bars := []types.OHLC{
		{Date: "2026-08-03", Open: 100, High: 101, Low: 99, Close: 100},
		{Date: "2026-08-04", Open: 100, High: 106, Low: 99, Close: 105},
		{Date: "2026-08-05", Open: 105, High: 111, Low: 104, Close: 110},
	}
	res := SimulateMargin(MarginParams{
		Market: bars, InitialCapital: 10000, Leverage: 1,
		Trades: []types.Trade{
			{ID: "a", EntryDate: "2026-08-03", EntryPrice: 100, ExitDate: "2026-08-04", ExitPrice: 105},
			{ID: "b", EntryDate: "2026-08-04", EntryPrice: 105, ExitDate: "2026-08-04", ExitPrice: 104},
		},
	})
	if len(res.Trades) != 2 || res.Trades[1].ID != "b" || res.Trades[1].ExitReason == "end_of_data" || res.Trades[1].ExitPrice != 104 {
		t.Fatalf("trades = %+v", res.Trades)
	}
}
