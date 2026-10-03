package backtest

import (
	"math"
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-137: "По профиту или IBS" never took the profit — RunClean ignored it.
func TestNoStopLossProfitTargetExits(t *testing.T) {
	bars := []types.OHLC{
		{Date: "2024-01-02", Open: 100, High: 101, Low: 90, Close: 90}, // IBS 0 → signal
		{Date: "2024-01-03", Open: 90, High: 92, Low: 88, Close: 89},   // enter at open 90
		{Date: "2024-01-04", Open: 95, High: 100, Low: 94, Close: 95},  // high ≥ 99 = 90×1.1
		{Date: "2024-01-05", Open: 95, High: 96, Low: 94, Close: 95},
	}
	res := RunNoStopLoss(bars, types.DefaultIBSStrategy(), NoStopLossConfig{ExitMode: "profit-target", ProfitTarget: 10})
	if len(res.Trades) != 1 || res.Trades[0].ExitReason != "take_profit" || res.Trades[0].ExitDate != "2024-01-04" || math.Abs(res.Trades[0].ExitPrice-99) > 1e-9 {
		t.Fatalf("trades = %+v", res.Trades)
	}
}
