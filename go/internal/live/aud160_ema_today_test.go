package live

import (
	"fmt"
	"math"
	"mktorder.com/go/internal/store"
	"testing"

	"mktorder.com/go/internal/indicators"
	"mktorder.com/go/internal/types"
)

// AUD-160: with today's bar already stored, the live price was appended next
// to it and today's session counted twice in the EMA.
func TestEMAAlertCountsTodayOnce(t *testing.T) {
	var bars []types.OHLC
	for i := 1; i <= 24; i++ {
		bars = append(bars, types.OHLC{Date: fmt.Sprintf("2026-08-%02d", i), Open: 100, High: 101, Low: 99, Close: 100, Volume: 1})
	}
	bars = append(bars, types.OHLC{Date: "2026-09-01", Open: 100, High: 101, Low: 99, Close: 101, Volume: 1}) // intraday refresh
	_, e, _ := testEngine(t, bars)
	live := []types.OHLC{{Date: "2026-09-01", Open: 100, High: 103, Low: 99, Close: 102, Volume: 1}}
	e.Quotes = &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": live}}
	ev := e.evalEMAAlert(store.EMAAlert{ID: "1", Symbol: "AAPL", EmaPeriod: 20, Enabled: true}, []string{"finnhub"}, "2026-09-01")
	closes := make([]float64, 24, 25)
	for i := range closes {
		closes[i] = 100
	}
	series, _ := indicators.EMA(append(closes, 102), 20)
	if want := series[len(series)-1]; !ev.DataOK || math.Abs(ev.EMA-want) > 1e-9 {
		t.Fatalf("ema %v ok %v, want %v (today counted once)", ev.EMA, ev.DataOK, want)
	}
}

// AUD-173: with every quote provider down the alert took the last stored
// close as the current price and fired today's signal on yesterday's data.
func TestEMAAlertWithoutLiveQuoteIsNoSignal(t *testing.T) {
	var bars []types.OHLC
	for i := 1; i <= 24; i++ {
		bars = append(bars, types.OHLC{Date: fmt.Sprintf("2026-08-%02d", i), Open: 100, High: 101, Low: 99, Close: 100, Volume: 1})
	}
	bars = append(bars, types.OHLC{Date: "2026-08-31", Open: 80, High: 81, Low: 79, Close: 80, Volume: 1}) // far below the EMA
	_, e, _ := testEngine(t, bars)
	e.Quotes = &MemoryQuotes{} // no provider answers
	ev := e.evalEMAAlert(store.EMAAlert{ID: "1", Symbol: "AAPL", EmaPeriod: 20, Enabled: true, BuyLevelPct: ptrF(-5)}, []string{"finnhub"}, "2026-09-01")
	if ev.DataOK || ev.Reached || ev.Near || ev.InfoCrossing != "" {
		t.Fatalf("signal on a stored close: %+v", ev)
	}
	if ev.Price != 80 {
		t.Fatalf("display price %v, want the last close 80", ev.Price)
	}
	if msg := buildEmaDecisionMessage([]EmaEval{ev}); msg != "" {
		t.Fatalf("decision message without a quote: %s", msg)
	}
}

func ptrF(v float64) *float64 { return &v }
