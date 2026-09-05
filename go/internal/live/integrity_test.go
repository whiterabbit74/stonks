package live

import (
	"testing"

	"mktorder.com/go/internal/types"
)

func TestEvaluatePriceIntegrityIgnoresStaleBars(t *testing.T) {
	bars := []types.OHLC{{Date: "2020-01-02", Open: 10, High: 10, Low: 10, Close: 10, Volume: 1}}
	r := EvaluatePriceIntegrity("AAPL", bars, 20, "2026-09-04", nil, false)
	if r.BlockSignals {
		t.Fatalf("stale last bar must not look like a split: %+v", r)
	}
}

func TestEvaluatePriceIntegrityStillFlagsPrevSessionGap(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-03", Open: 10, High: 10, Low: 10, Close: 10, Volume: 1}}
	r := EvaluatePriceIntegrity("AAPL", bars, 20, "2026-09-04", nil, false)
	if !r.BlockSignals {
		t.Fatalf("a 2x gap vs the previous session must still block: %+v", r)
	}
}
