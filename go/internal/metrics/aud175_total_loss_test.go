package metrics

import (
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-175: an account that ended at zero over a real period reported a CAGR
// of 0% — a wipe-out shown as a flat year.
func TestTotalLossIsMinus100CAGR(t *testing.T) {
	equity := []types.EquityPoint{{Date: "2025-01-02", Value: 10000}, {Date: "2026-01-02", Value: 0}}
	if got := New(nil, equity, 10000, nil).All().CAGR; got != -100 {
		t.Fatalf("Calculator CAGR = %v, want -100", got)
	}
	if got := BacktestMetrics(nil, equity, 10000, nil).CAGR; got != -100 {
		t.Fatalf("BacktestMetrics CAGR = %v, want -100", got)
	}
	if got := BacktestMetrics(nil, equity, 10000, map[string]float64{"2025-06-02": 500}).CAGR; got != -100 {
		t.Fatalf("BacktestMetrics CAGR with contributions = %v, want -100", got)
	}
	flat := []types.EquityPoint{{Date: "2026-01-02", Value: 10000}, {Date: "2026-01-02", Value: 0}}
	if got := New(nil, flat, 10000, nil).All().CAGR; got != 0 {
		t.Fatalf("zero-length period CAGR = %v, want 0", got)
	}
}
