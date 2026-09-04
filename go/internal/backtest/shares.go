package backtest

import "math"

// wholeShares is how many shares a simulator may buy: never a fraction.
func wholeShares(n float64) float64 {
	if n < 1 || math.IsNaN(n) || math.IsInf(n, 0) {
		return 0
	}
	return math.Floor(n)
}
