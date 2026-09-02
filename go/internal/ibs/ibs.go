package ibs

import "math"

const DefaultLowIBS = 0.1
const DefaultHighIBS = 0.75

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
