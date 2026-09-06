package httpapi

import (
	"bytes"
	"net/http/httptest"
	"strings"
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-020: the public GET /api/trading-calendar answered 200 with the default
// calendar plus computed days when the store could not be read, so the SPA saw
// a healthy source while the scheduler was skipping the trading day.
func TestAUD020CalendarReadErrorIsNotHiddenByDefaults(t *testing.T) {
	s := testServer(t, "")
	if _, err := s.DB.SQL.Exec(`DROP TABLE calendar`); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("GET", "/api/trading-calendar", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 500 {
		t.Fatalf("an unreadable calendar must not answer 200: %d %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "Labor Day") {
		t.Fatalf("computed holidays served from a failed read: %s", rec.Body.String())
	}
}

func aud020Do(s *Server, method, path string, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	return rec
}

// AUD-020 class: an unreadable settings blob was answered with the factory
// defaults, so the operator saw thresholds and provider that are not in force.
func TestAUD020SettingsReadErrorIsNotAnsweredWithDefaults(t *testing.T) {
	s := testServer(t, "")
	if _, err := s.DB.SQL.Exec(`DROP TABLE settings`); err != nil {
		t.Fatal(err)
	}
	rec := aud020Do(s, "GET", "/api/settings", "")
	if rec.Code != 500 {
		t.Fatalf("unreadable settings must not answer 200: %d %s", rec.Code, rec.Body.String())
	}
}

// AUD-020 class: an unreadable split table was echoed as "no splits" both on
// the dataset read and right after a successful split write.
func TestAUD020UnreadableSplitsAreNotEchoedAsEmpty(t *testing.T) {
	s := testServer(t, "")
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 9, Volume: 1}}
	if err := s.DB.SaveDataset("AAPL", "AAPL", "", "", bars, false); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.SQL.Exec(`DROP TABLE splits`); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ method, path, body string }{
		{"GET", "/api/datasets/AAPL", ""},
		{"GET", "/api/datasets/AAPL/metadata", ""},
		{"PUT", "/api/splits/AAPL", `[{"date":"2026-09-01","factor":2}]`},
	} {
		rec := aud020Do(s, tc.method, tc.path, tc.body)
		if rec.Code != 500 {
			t.Fatalf("%s %s answered %d %s on an unreadable split table", tc.method, tc.path, rec.Code, rec.Body.String())
		}
	}
}
