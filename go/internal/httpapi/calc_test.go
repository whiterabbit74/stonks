package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCalcRejectsInvalidNumericParameters(t *testing.T) {
	s := testServer(t, "")
	for _, tc := range []struct {
		path string
		body any
	}{
		{"/api/calc/black-scholes", map[string]any{"S": -1, "K": 100, "T": 1, "sigma": 0.2}},
		{"/api/calc/black-scholes", map[string]any{"S": 100, "K": 100, "T": -1, "sigma": 0.2}},
		{"/api/calc/margin", map[string]any{"initialCapital": 1000, "leverage": -2}},
		// AUD-142: under maintenance margin on the entry bar.
		{"/api/calc/margin", map[string]any{"initialCapital": 1000, "leverage": 5}},
		{"/api/calc/margin", map[string]any{"initialCapital": 1000, "leverage": 3, "maintenanceMarginPct": 50}},
		{"/api/calc/single-position", map[string]any{"leverage": 5, "tickers": []any{map[string]any{
			"ticker": "AAA", "data": []any{map[string]any{"date": "2024-01-02", "open": 1, "high": 2, "low": 1, "close": 1.5}},
		}}}},
	} {
		payload, err := json.Marshal(tc.body)
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodPost, tc.path, bytes.NewReader(payload))
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s got %d %s", tc.path, rec.Code, rec.Body.String())
		}
	}
}

func TestCalcRejectsBrokenJSON(t *testing.T) {
	s := testServer(t, "")
	req := httptest.NewRequest(http.MethodPost, "/api/calc/clean-backtest", strings.NewReader("{"))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("broken JSON got %d %s", rec.Code, rec.Body.String())
	}
}
