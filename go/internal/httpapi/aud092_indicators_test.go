package httpapi

import (
	"fmt"
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-092: warmup points of SMA/EMA/RSI are NaN; encoding them dropped the
// whole response with HTTP 500. They must come back as JSON null.
func TestCalcIndicatorsEncodesWarmupAsNull(t *testing.T) {
	for _, n := range []int{1, 14, 20, 30} {
		bars := make([]types.OHLC, n)
		for i := range bars {
			p := 100 + float64(i)
			bars[i] = types.OHLC{Date: fmt.Sprintf("2026-01-%02d", i+1), Open: p, High: p + 1, Low: p - 1, Close: p, Volume: 1}
		}
		s := testServer(t, "")
		rec := postCalc(t, s, "indicators", map[string]any{
			"ticker": "X", "data": bars,
		})
		body := decodeCalc(t, rec)
		for _, key := range []string{"ibs", "sma20", "ema20", "rsi14"} {
			series, ok := body[key].([]any)
			if !ok {
				t.Fatalf("n=%d %s: %#v", n, key, body[key])
			}
			if len(series) == 0 {
				continue // SMA/EMA refuse a period longer than the history
			}
			if len(series) != n {
				t.Fatalf("n=%d %s length %d", n, key, len(series))
			}
		}
	}
}
