package metrics

import (
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-006b (docs/audits/REGISTRY.md): the two live metric paths must agree
// on identical input, degenerate periods included.
// New(...).All()  -> clean.go, margin.go, httpapi/calc.go
// BacktestMetrics -> single.go, ema.go
func TestAUD006CagrPathsAgree(t *testing.T) {
	cases := []struct {
		name   string
		equity []types.EquityPoint
	}{
		{"two_years", []types.EquityPoint{{Date: "2024-01-02", Value: 10000}, {Date: "2026-01-02", Value: 12100}}},
		{"half_year", []types.EquityPoint{{Date: "2025-01-02", Value: 10000}, {Date: "2025-07-02", Value: 11000}}},
		{"single_point", []types.EquityPoint{{Date: "2025-01-02", Value: 11000}}},
		{"same_day", []types.EquityPoint{{Date: "2025-01-02", Value: 10000}, {Date: "2025-01-02", Value: 10500}}},
	}
	for _, tc := range cases {
		a := New(nil, tc.equity, 10000, nil).All()
		b := BacktestMetrics(nil, tc.equity, 10000, nil)
		t.Logf("%-13s Calculator.CAGR=%12.4f  BacktestMetrics.CAGR=%12.4f  (TotalReturn %.4f / %.4f)",
			tc.name, a.CAGR, b.CAGR, a.TotalReturn, b.TotalReturn)
		if diff := a.CAGR - b.CAGR; diff > 1e-6 || diff < -1e-6 {
			t.Errorf("%s: CAGR paths disagree: %v vs %v", tc.name, a.CAGR, b.CAGR)
		}
	}
}
