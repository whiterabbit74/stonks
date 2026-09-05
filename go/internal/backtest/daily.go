package backtest

import "mktorder.com/go/internal/types"

type dailyDay struct {
	Index    int
	Date     string
	NextDate string
}

// runDailyEngine owns the shared day-by-day accounting: ordered dates, the
// running equity peak, and drawdown. Strategy-specific callbacks still decide
// entries, exits, and liquidation order.
func runDailyEngine(dates []string, initial float64, step func(dailyDay) float64) []types.EquityPoint {
	equity := make([]types.EquityPoint, 0, len(dates))
	peak := initial
	for i, date := range dates {
		next := ""
		if i+1 < len(dates) {
			next = dates[i+1]
		}
		value := step(dailyDay{Index: i, Date: date, NextDate: next})
		if value > peak {
			peak = value
		}
		drawdown := 0.0
		if peak > 0 {
			drawdown = ((peak - value) / peak) * 100
		}
		equity = append(equity, types.EquityPoint{Date: date, Value: value, Drawdown: drawdown})
	}
	return equity
}

func replaceFinalDailyValue(equity []types.EquityPoint, date string, value, initial float64) {
	if len(equity) == 0 {
		return
	}
	peak := initial
	for i := range equity {
		if equity[i].Date == date {
			equity[i].Value = value
		}
		if equity[i].Value > peak {
			peak = equity[i].Value
		}
		if peak > 0 {
			equity[i].Drawdown = ((peak - equity[i].Value) / peak) * 100
		}
	}
}
