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

// AUD-039: quotes carries symbols outside the watchlist (open broker trades of
// another broker, a live position without a journal row). They must be priced
// and exitable, but never opened as a new entry.
func TestEntryCandidateStaysInsideWatchlist(t *testing.T) {
	th := map[string]any{"lowIBS": 0.1, "highIBS": 0.75}
	quotes := []map[string]any{
		{"symbol": "QQQ", "ok": true, "ibs": 0.05, "currentPrice": 100.0, "thresholds": th},
		{"symbol": "XYZ", "ok": true, "ibs": 0.02, "currentPrice": 10.0, "thresholds": th},
	}
	d := decideLiveAction(quotes, []string{"QQQ"}, map[string]float64{}, nil, nil, true, true)
	if d["action"] != "entry" || d["symbol"] != "QQQ" {
		t.Fatalf("decideLiveAction %+v want entry QQQ", d)
	}
	d = decideLiveAction(quotes[1:], []string{"QQQ"}, map[string]float64{}, nil, nil, true, true)
	if d["action"] != "none" {
		t.Fatalf("decideLiveAction %+v want none for unwatched candidate", d)
	}
}
