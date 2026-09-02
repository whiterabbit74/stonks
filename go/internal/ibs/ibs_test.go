package ibs

import (
	"math"
	"testing"

	"mktorder.com/go/internal/goldens"
)

func TestIbsSignalsGolden(t *testing.T) {
	var g struct {
		Defaults struct {
			DefaultLowIBS  float64 `json:"DEFAULT_LOW_IBS"`
			DefaultHighIBS float64 `json:"DEFAULT_HIGH_IBS"`
		} `json:"defaults"`
		Cases []struct {
			Fn        string      `json:"fn"`
			IBS       interface{} `json:"ibs"`
			Threshold interface{} `json:"threshold"`
			Result    bool        `json:"result"`
		} `json:"cases"`
	}
	goldens.Load("ibs-signals.json", &g)
	if g.Defaults.DefaultLowIBS != DefaultLowIBS || g.Defaults.DefaultHighIBS != DefaultHighIBS {
		t.Fatalf("defaults %v %v", g.Defaults, DefaultLowIBS)
	}
	for i, c := range g.Cases {
		ibsVal := decodeNum(c.IBS)
		thr := c.Threshold
		var got bool
		if c.Fn == "entry" {
			got = IsEntrySignal(ibsVal, thr)
		} else {
			got = IsExitSignal(ibsVal, thr)
		}
		if got != c.Result {
			t.Errorf("case %d %s ibs=%v thr=%v got %v want %v", i, c.Fn, c.IBS, thr, got, c.Result)
		}
	}
}

func decodeNum(v interface{}) interface{} {
	if v == nil {
		return nil
	}
	if m, ok := v.(map[string]interface{}); ok {
		if s, ok := m["$num"].(string); ok && s == "NaN" {
			return math.NaN()
		}
	}
	return v
}

func TestStrictThresholds(t *testing.T) {
	if IsEntrySignal(0.1, 0.1) {
		t.Fatal("equality is not an entry")
	}
	if IsExitSignal(0.75, 0.75) {
		t.Fatal("equality is not an exit")
	}
}
