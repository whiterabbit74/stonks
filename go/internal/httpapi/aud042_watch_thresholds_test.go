package httpapi

import "testing"

// AUD-042: the store parses thresholds with asFloat, which reads strings too,
// so a non-number must be rejected here instead of silently skipped.
func TestValidateWatchThresholdsRejectsNonNumbers(t *testing.T) {
	if err := validateWatchThresholds(map[string]any{"symbol": "QQQ", "lowIBS": "0.9", "highIBS": "0.95"}, nil); err == nil {
		t.Fatal("string thresholds accepted")
	}
	if err := validateWatchThresholds(map[string]any{"symbol": "QQQ", "lowIBS": 0.2, "highIBS": 0.8}, nil); err != nil {
		t.Fatalf("valid thresholds rejected: %v", err)
	}
	if err := validateWatchThresholds(map[string]any{"symbol": "QQQ", "lowIBS": 0.9, "highIBS": 0.5}, nil); err == nil {
		t.Fatal("inverted pair accepted")
	}
}
