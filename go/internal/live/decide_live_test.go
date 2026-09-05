package live

import "testing"

func TestDecideLiveActionEmptyHeldIsMismatch(t *testing.T) {
	open := map[string]any{"symbol": "AAPL"}
	quotes := []map[string]any{
		{"symbol": "AAPL", "ok": true, "ibs": 0.9, "thresholds": map[string]any{"highIBS": 0.75}},
	}
	held := map[string]float64{}
	d := decideLiveAction(quotes, []string{"AAPL"}, held, nil, open, true, true)
	if d["action"] != "none" || d["reason"] != "broker_position_mismatch" {
		t.Fatalf("empty successful book must be mismatch, not exit: %+v", d)
	}
}
