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

func TestCalcBuyAtCloseRejectsBrokenJSON(t *testing.T) {
	s := testServer(t, "")
	req := httptest.NewRequest(http.MethodPost, "/api/calc/buy-at-close", strings.NewReader("{"))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("buy-at-close broken JSON got %d %s", rec.Code, rec.Body.String())
	}
}
