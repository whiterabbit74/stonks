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

func resolveThreshold(value interface{}, fallback float64) float64 {
	switch v := value.(type) {
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return fallback
		}
		return v
	case int:
		return float64(v)
	case nil:
		return fallback
	default:
		return fallback
	}
}

func asFinite(ibs interface{}) (float64, bool) {
	switch v := ibs.(type) {
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return 0, false
		}
		return v, true
	case int:
		return float64(v), true
	default:
		return 0, false
	}
}

func IsEntrySignal(ibs interface{}, lowIBS interface{}) bool {
	v, ok := asFinite(ibs)
	if !ok {
		return false
	}
	return v < resolveThreshold(lowIBS, DefaultLowIBS)
}

func IsExitSignal(ibs interface{}, highIBS interface{}) bool {
	v, ok := asFinite(ibs)
	if !ok {
		return false
	}
	return v > resolveThreshold(highIBS, DefaultHighIBS)
}
