package ibs

import (
	"fmt"
	"math"
)

const DefaultLowIBS = 0.1
const DefaultHighIBS = 0.75

// SanitizeThresholds accepts a low/high IBS pair in [0, 1] with low < high.
// Out-of-range values and a non-strict order are rejected, not clamped.
func SanitizeThresholds(low, high float64) (float64, float64, error) {
	if !thresholdInUnitInterval(low) {
		return 0, 0, fmt.Errorf("lowIBS must be in [0, 1]")
	}
	if !thresholdInUnitInterval(high) {
		return 0, 0, fmt.Errorf("highIBS must be in [0, 1]")
	}
	if low >= high {
		return 0, 0, fmt.Errorf("lowIBS must be less than highIBS")
	}
	return low, high, nil
}

func thresholdInUnitInterval(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0) && v >= 0 && v <= 1
}

// Threshold resolves a threshold read out of JSON, SQLite or a settings map:
// anything outside the [0, 1] SanitizeThresholds accepts — NaN, an infinity, a
// negative — becomes the documented default. Callers resolve here so a corrupt
// value can never reach a comparison.
func Threshold(v, fallback float64) float64 {
	if !thresholdInUnitInterval(v) {
		return fallback
	}
	return v
}

// IsEntrySignal and IsExitSignal are the single definition of the strict IBS
// thresholds shared by the backtest and the live path: entry is ibs < lowIBS,
// exit is ibs > highIBS, equality is neither. A NaN reading yields no signal on
// either side, because every comparison against NaN is false.
func IsEntrySignal(ibs, lowIBS float64) bool { return ibs < lowIBS }

func IsExitSignal(ibs, highIBS float64) bool { return ibs > highIBS }
