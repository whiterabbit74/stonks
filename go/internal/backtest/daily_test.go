package backtest

import "testing"

func TestRunDailyEngineOwnsPeakAndDrawdown(t *testing.T) {
	equity := runDailyEngine([]string{"a", "b", "c"}, 100, func(d dailyDay) float64 {
		return []float64{110, 90, 105}[d.Index]
	})
	if equity[1].Drawdown != 18.181818181818183 {
		t.Fatalf("drawdown = %v", equity[1].Drawdown)
	}
	if equity[2].Drawdown != 4.545454545454546 {
		t.Fatalf("drawdown = %v", equity[2].Drawdown)
	}
}
