package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

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
