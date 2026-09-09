package live

import (
	"mktorder.com/go/internal/store"
	"testing"
)

// Брокер не держит тикер открытой позиции: продавать нечего, ордера нет.
// Раньше это называлось broker_position_mismatch и подавалось оператору как
// расхождение; с двумя брокерами это обычное состояние — позицию держит другой.
func TestDecideLiveActionSkipsExitWhenThisBrokerHoldsNothing(t *testing.T) {
	open := &store.Position{Status: "open", Symbol: "AAPL"}
	quotes := []LiveQuote{
		{Symbol: "AAPL", OK: true, IBS: 0.9, Thresholds: QuoteThresholds{LowIBS: 0.1, HighIBS: 0.75}},
	}
	held := map[string]float64{}
	d := decideLiveAction(quotes, []string{"AAPL"}, held, nil, open, true, true)
	if d["action"] != "none" || d["reason"] != "position_not_held_here" {
		t.Fatalf("empty successful book must not produce an exit: %+v", d)
	}
}

// AUD-039: quotes carries symbols outside the watchlist (open broker trades of
// another broker, a live position without a journal row). They must be priced
// and exitable, but never opened as a new entry.
func TestEntryCandidateStaysInsideWatchlist(t *testing.T) {
	th := QuoteThresholds{LowIBS: 0.1, HighIBS: 0.75}
	quotes := []LiveQuote{
		{Symbol: "QQQ", OK: true, IBS: 0.05, CurrentPrice: 100.0, Thresholds: th},
		{Symbol: "XYZ", OK: true, IBS: 0.02, CurrentPrice: 10.0, Thresholds: th},
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
