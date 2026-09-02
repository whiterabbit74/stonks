package types

import (
	"encoding/json"
	"math"
	"testing"
)

func TestMetricsJSONOmitsInf(t *testing.T) {
	m := PerformanceMetrics{ProfitFactor: math.Inf(1), TotalTrades: 2, WinRate: 100}
	b, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	var raw map[string]any
	if err := json.Unmarshal(b, &raw); err != nil {
		t.Fatal(err)
	}
	if raw["profitFactor"] != nil {
		t.Fatalf("profitFactor %v want null", raw["profitFactor"])
	}
	if raw["totalTrades"].(float64) != 2 {
		t.Fatalf("trades %v", raw["totalTrades"])
	}
}
