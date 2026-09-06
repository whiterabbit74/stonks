package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

// AUD-016: the read-modify-write of the calendar blob also treated an
// unparseable blob as an empty calendar, so one patched day was saved over
// every stored holiday and short day.
func TestAUD016CorruptCalendarIsNotOverwrittenByPatch(t *testing.T) {
	s := testServer(t, "")
	if err := s.DB.SaveCalendar([]byte(`{"holidays":{"2026":{"07-04":{"name":"Independence Day"}}`)); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{"year": "2026", "mmdd": "12-25", "type": "holiday", "name": "Christmas"})
	req := httptest.NewRequest("PATCH", "/api/trading-calendar/day", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 500 {
		t.Fatalf("an unparseable calendar must not be patched: %d %s", rec.Code, rec.Body.String())
	}
	raw, err := s.DB.GetCalendar()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "Independence Day") {
		t.Fatalf("the stored calendar was overwritten from an unparseable read: %s", raw)
	}
}

// AUD-016: /api/trading/expected-prev-day answered from an empty calendar when
// the blob could not be read or parsed, so a holiday came back as the previous
// trading day.
func TestAUD016CorruptCalendarPrevDayFails(t *testing.T) {
	s := testServer(t, "")
	if err := s.DB.SaveCalendar([]byte(`{"holidays":`)); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("GET", "/api/trading/expected-prev-day", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 500 {
		t.Fatalf("an unparseable calendar must not answer a trading day: %d %s", rec.Code, rec.Body.String())
	}
}
