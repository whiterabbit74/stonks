package splits

import (
	"testing"

	"mktorder.com/go/internal/goldens"
	"mktorder.com/go/internal/types"
)

func TestAdjustGolden(t *testing.T) {
	var g struct {
		Input    []types.OHLC       `json:"input"`
		Splits   []types.SplitEvent `json:"splits"`
		Adjusted []types.OHLC       `json:"adjusted"`
		Detected []types.SplitEvent `json:"detected"`
		Holder   []types.OHLC       `json:"holder"`
	}
	goldens.Load("splits-adjust.json", &g)
	got := AdjustOHLC(g.Input, g.Splits)
	if len(got) != len(g.Adjusted) {
		t.Fatalf("len %d", len(got))
	}
	for i := range got {
		if !goldens.MustAlmost(got[i].Close, g.Adjusted[i].Close, 1e-12) {
			t.Errorf("close[%d] %v want %v", i, got[i].Close, g.Adjusted[i].Close)
		}
		if got[i].Volume != g.Adjusted[i].Volume {
			t.Errorf("vol[%d] %v want %v", i, got[i].Volume, g.Adjusted[i].Volume)
		}
	}
	det := Detect(g.Input)
	if len(det) != len(g.Detected) {
		t.Fatalf("detected %d want %d", len(det), len(g.Detected))
	}
	hold := ApplyHolderValue(g.Input, g.Splits)
	if !goldens.MustAlmost(hold[len(hold)-1].Close, g.Holder[len(g.Holder)-1].Close, 1e-12) {
		t.Fatalf("holder close")
	}
}

func TestDetectAlphabetGOOGLJumps(t *testing.T) {
	// Actual unadjusted GOOGL closes around the two listed splits.
	bars := []types.OHLC{
		{Date: "2014-04-02", Open: 1141.9, High: 1144.8, Low: 1124, Close: 1135.1, Volume: 1},
		{Date: "2014-04-03", Open: 573.39, High: 588.3, Low: 566.01, Close: 571.5, Volume: 1},
		{Date: "2022-07-15", Open: 2240.01, High: 2262.81, Low: 2218, Close: 2235.55, Volume: 1},
		{Date: "2022-07-18", Open: 112.64, High: 113.68, Low: 108.37, Close: 109.03, Volume: 1},
	}
	d2014 := Detect(bars[:2])
	d2022 := Detect(bars[2:])
	if len(d2014) != 1 || d2014[0].Date != "2014-04-03" || d2014[0].Factor != 2 {
		t.Fatalf("2014 detect %v", d2014)
	}
	if len(d2022) != 1 || d2022[0].Date != "2022-07-18" || d2022[0].Factor != 20 {
		t.Fatalf("2022 detect %v", d2022)
	}
	det := []types.SplitEvent{d2014[0], d2022[0]}
	adj := AdjustOHLC(bars, det)
	if adj[0].Close > 600 {
		t.Fatalf("2014 pre-split still unadjusted: %v", adj[0].Close)
	}
	if adj[2].Close > 200 {
		t.Fatalf("2022 pre-split still unadjusted: %v", adj[2].Close)
	}
}
