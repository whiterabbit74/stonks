package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// AUD-154: a closing bar with Close above High gave a NaN exit IBS, and the
// whole backtest answered 500 "encode failed".
func TestCalcSurvivesNaNExitIBS(t *testing.T) {
	s := testServer(t, "")
	body, _ := json.Marshal(map[string]any{"tickers": []any{map[string]any{
		"ticker": "AAA", "data": []any{
			map[string]any{"date": "2026-08-03", "open": 100, "high": 110, "low": 100, "close": 100},
			map[string]any{"date": "2026-09-03", "open": 105, "high": 110, "low": 100, "close": 120},
		},
	}}})
	req := httptest.NewRequest(http.MethodPost, "/api/calc/single-position", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}
