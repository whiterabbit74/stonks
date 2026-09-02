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
