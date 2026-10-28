package live

import "testing"

// AUD-039: quotes may carry a ticker outside the watchlist — the monitoring's
// own position after it was removed from the list. It is priced so its exit can
// be decided, but never opened as a new entry.
func TestEntryCandidateStaysInsideWatchlist(t *testing.T) {
	th := QuoteThresholds{LowIBS: 0.1, HighIBS: 0.75}
	quotes := []LiveQuote{
		{Symbol: "QQQ", OK: true, IBS: 0.05, CurrentPrice: 100.0, Thresholds: th},
		{Symbol: "XYZ", OK: true, IBS: 0.02, CurrentPrice: 10.0, Thresholds: th},
	}
	d := decideMonitor(quotes, []string{"QQQ"}, "")
	if d["action"] != "entry" || d["symbol"] != "QQQ" {
		t.Fatalf("decideMonitor %+v want entry QQQ", d)
	}
	d = decideMonitor(quotes[1:], []string{"QQQ"}, "")
	if d["action"] != "none" {
		t.Fatalf("decideMonitor %+v want none for unwatched candidate", d)
	}
}
