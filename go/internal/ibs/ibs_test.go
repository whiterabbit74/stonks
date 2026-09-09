package ibs

import (
	"math"
	"strings"
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
		// A reading the golden encodes as null, NaN or a string is not a
		// number: it decodes to NaN, and every comparison against NaN is false.
		ibsVal := decodeNum(c.IBS)
		var got bool
		if c.Fn == "entry" {
			got = IsEntrySignal(ibsVal, Threshold(decodeNum(c.Threshold), DefaultLowIBS))
		} else {
			got = IsExitSignal(ibsVal, Threshold(decodeNum(c.Threshold), DefaultHighIBS))
		}
		if got != c.Result {
			t.Errorf("case %d %s ibs=%v thr=%v got %v want %v", i, c.Fn, c.IBS, c.Threshold, got, c.Result)
		}
	}
}

// decodeNum turns a golden value into the float64 the typed API takes. Anything
// that is not a JSON number — null, the {"$num":"NaN"} escape, a string — is NaN.
func decodeNum(v interface{}) float64 {
	if f, ok := v.(float64); ok {
		return f
	}
	return math.NaN()
}

func TestThresholdFallback(t *testing.T) {
	cases := []struct {
		name string
		in   float64
		want float64
	}{
		{"in range", 0.2, 0.2},
		{"zero is a valid threshold", 0, 0},
		{"above one", 1.5, DefaultHighIBS},
		{"negative", -0.1, DefaultHighIBS},
		{"nan", math.NaN(), DefaultHighIBS},
		{"inf", math.Inf(1), DefaultHighIBS},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Threshold(tc.in, DefaultHighIBS); got != tc.want {
				t.Fatalf("Threshold(%v) = %v want %v", tc.in, got, tc.want)
			}
		})
	}
}

func TestStrictThresholds(t *testing.T) {
	if IsEntrySignal(0.1, 0.1) {
		t.Fatal("equality is not an entry")
	}
	if IsExitSignal(0.75, 0.75) {
		t.Fatal("equality is not an exit")
	}
}

func TestSanitizeThresholds(t *testing.T) {
	low, high, err := SanitizeThresholds(0.1, 0.75)
	if err != nil {
		t.Fatalf("valid pair: %v", err)
	}
	if low != 0.1 || high != 0.75 {
		t.Fatalf("valid pair mutated: %v %v", low, high)
	}
	low, high, err = SanitizeThresholds(0, 1)
	if err != nil || low != 0 || high != 1 {
		t.Fatalf("unit bounds: %v %v %v", low, high, err)
	}

	cases := []struct {
		name    string
		low     float64
		high    float64
		wantSub string
	}{
		{"inverted", 0.9, 0.5, "less than"},
		{"equal", 0.1, 0.1, "less than"},
		{"low-above-one", 1.2, 0.75, "lowIBS"},
		{"high-above-one", 0.1, 1.5, "highIBS"},
		{"low-negative", -0.1, 0.75, "lowIBS"},
		{"high-negative", 0.1, -0.2, "highIBS"},
		{"low-nan", math.NaN(), 0.75, "lowIBS"},
		{"high-inf", 0.1, math.Inf(1), "highIBS"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, _, err := SanitizeThresholds(tc.low, tc.high)
			if err == nil {
				t.Fatal("expected error")
			}
			if !strings.Contains(err.Error(), tc.wantSub) {
				t.Fatalf("err %q want substring %q", err, tc.wantSub)
			}
		})
	}
}
