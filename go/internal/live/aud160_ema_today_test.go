package live

import (
	"fmt"
	"math"
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
	ev := e.evalEMAAlert(map[string]any{"id": "1", "symbol": "AAPL", "emaPeriod": 20}, []string{"finnhub"}, "2026-09-01")
	closes := make([]float64, 24, 25)
	for i := range closes {
		closes[i] = 100
	}
	series, _ := indicators.EMA(append(closes, 102), 20)
	if want := series[len(series)-1]; !ev.DataOK || math.Abs(ev.EMA-want) > 1e-9 {
		t.Fatalf("ema %v ok %v, want %v (today counted once)", ev.EMA, ev.DataOK, want)
	}
}
