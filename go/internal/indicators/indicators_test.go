package indicators

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"testing"

	"mktorder.com/go/internal/goldens"
	"mktorder.com/go/internal/types"
)

func TestIndicatorsSampleGolden(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(goldens.Dir(), "indicators-sample.json"))
	if err != nil {
		t.Fatal(err)
	}
	var g struct {
		SMA5          []json.RawMessage `json:"sma5"`
		EMA5          []json.RawMessage `json:"ema5"`
		EMAFromStart5 []json.RawMessage `json:"emaFromStart5"`
		RSI14         []json.RawMessage `json:"rsi14"`
		IBS           []json.RawMessage `json:"ibs"`
	}
	if err := json.Unmarshal(raw, &g); err != nil {
		t.Fatal(err)
	}
	bars := goldens.Bars("sample-bars.json")
	closes := make([]float64, len(bars))
	for i, b := range bars {
		closes[i] = b.Close
	}
	sma, err := SMA(closes, 5)
	if err != nil {
		t.Fatal(err)
	}
	ema, err := EMA(closes, 5)
	if err != nil {
		t.Fatal(err)
	}
	fromStart := EMAFromStart(closes, 5)
	rsi := RSI(closes, 14)
	ibs := IBS(bars)
	compareFlex(t, "sma5", sma, g.SMA5)
	compareFlex(t, "ema5", ema, g.EMA5)
	compareFlex(t, "emaFromStart5", fromStart, g.EMAFromStart5)
	compareFlex(t, "rsi14", rsi, g.RSI14)
	compareFlex(t, "ibs", ibs, g.IBS)
}

func compareFlex(t *testing.T, name string, got []float64, raw []json.RawMessage) {
	t.Helper()
	if len(got) != len(raw) {
		t.Fatalf("%s len got %d want %d", name, len(got), len(raw))
	}
	for i := range got {
		want := decodeFlex(raw[i])
		if math.IsNaN(got[i]) && math.IsNaN(want) {
			continue
		}
		if !goldens.MustAlmost(got[i], want, 1e-12) {
			t.Errorf("%s[%d] got %v want %v", name, i, got[i], want)
		}
	}
}

func decodeFlex(raw json.RawMessage) float64 {
	var obj map[string]string
	if json.Unmarshal(raw, &obj) == nil {
		if obj["$num"] == "NaN" {
			return math.NaN()
		}
	}
	var v float64
	_ = json.Unmarshal(raw, &v)
	return v
}

func TestIBSInvalidBarNeutral(t *testing.T) {
	v := IBS([]types.OHLC{{Date: "2024-01-01", Open: 1, High: 1, Low: 1, Close: 1, Volume: 1}})
	if v[0] != 0.5 {
		t.Fatalf("%v", v)
	}
}
