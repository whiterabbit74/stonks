package backtest

import (
	"testing"

	"mktorder.com/go/internal/goldens"
	"mktorder.com/go/internal/types"
)

func TestBuyHoldUsesAdjCloseRatio(t *testing.T) {
	first, second := 50.0, 55.0
	data := []types.OHLC{
		{Date: "2024-01-01", Open: 100, High: 101, Low: 99, Close: 100, AdjClose: &first, Volume: 1},
		{Date: "2024-01-02", Open: 110, High: 111, Low: 109, Close: 110, AdjClose: &second, Volume: 1},
	}
	got := RunBuyHold(data, 10000)
	if len(got.Equity) != 2 {
		t.Fatalf("equity %d", len(got.Equity))
	}
	if !goldens.MustAlmost(got.Equity[0].Value, 10000, 1e-9) {
		t.Fatalf("start %v", got.Equity[0].Value)
	}
	if !goldens.MustAlmost(got.Equity[1].Value, 11000, 1e-9) {
		t.Fatalf("ratio value %v want 11000", got.Equity[1].Value)
	}
	if len(got.Trades) != 1 || got.Trades[0].EntryDate != "2024-01-01" || got.Trades[0].ExitDate != "2024-01-02" {
		t.Fatalf("trade %+v", got.Trades)
	}
}
