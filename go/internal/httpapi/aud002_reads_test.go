package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-002: a read-modify-write of the calendar blob. A failed read looked like
// an empty calendar, so saving one patched day wrote over every stored holiday
// and short day.
func TestAUD002UnreadableCalendarDoesNotOverwriteIt(t *testing.T) {
	s := testServer(t, "")
	if err := s.DB.SaveCalendar([]byte(`{"holidays":{"2026":{"07-04":{"name":"Independence Day"}}}}`)); err != nil {
		t.Fatal(err)
	}
	// Break the read the handler builds its read-modify-write on.
	if _, err := s.DB.SQL.Exec(`ALTER TABLE calendar RENAME COLUMN data TO data_kept`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.GetCalendar(); err == nil {
		t.Fatal("the calendar must be unreadable for this test to mean anything")
	}
	body, _ := json.Marshal(map[string]any{"year": "2026", "mmdd": "12-25", "type": "holiday", "name": "Christmas"})
	req := httptest.NewRequest("PATCH", "/api/trading-calendar/day", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 500 {
		t.Fatalf("unreadable calendar must not be patched: %d %s", rec.Code, rec.Body.String())
	}
	var kept string
	if err := s.DB.SQL.QueryRow(`SELECT data_kept FROM calendar WHERE id=1`).Scan(&kept); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(kept, "Independence Day") {
		t.Fatalf("the stored calendar was overwritten from a failed read: %s", kept)
	}
}

// AUD-002: an unreadable split table looked like "no splits stored", and the
// dataset was then reported back as already adjusted.
func TestAUD002UnreadableSplitsDoNotReportAdjusted(t *testing.T) {
	s := testServer(t, "")
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 9, Volume: 1}}
	if err := s.DB.SaveDataset("AAPL", "AAPL", "", "", bars, false); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.SQL.Exec(`DROP TABLE splits`); err != nil {
		t.Fatal(err)
	}
	rec := postJSON(s, "/api/datasets/AAPL/apply-splits", map[string]any{})
	if rec.Code != 500 {
		t.Fatalf("unreadable splits must not answer 'already adjusted': %d %s", rec.Code, rec.Body.String())
	}
}

// aud002BreakDatasetRead makes reading the dataset fail (a NULL close cannot
// scan into float64) while writing it still works — the shape that lets a
// failed read pass for "nothing stored".
func aud002BreakDatasetRead(t *testing.T, s *Server, ticker string) {
	t.Helper()
	if _, err := s.DB.SQL.Exec(`UPDATE ohlc SET close = NULL WHERE ticker = ?`, ticker); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.GetDataset(ticker); err == nil {
		t.Fatal("the dataset must be unreadable for this test to mean anything")
	}
}

// AUD-002: an unreadable dataset used to reach the backtest as no bars at all,
// so a storage failure was answered with a zero-trade result and HTTP 200.
func TestAUD002UnreadableDatasetIsNotAnEmptyBacktest(t *testing.T) {
	s := testServer(t, "")
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 9, Volume: 1}}
	if err := s.DB.SaveDataset("AAPL", "AAPL", "", "", bars, false); err != nil {
		t.Fatal(err)
	}
	aud002BreakDatasetRead(t, s, "AAPL")
	rec := postJSON(s, "/api/calc/clean-backtest", map[string]any{"ticker": "AAPL"})
	if rec.Code != 500 {
		t.Fatalf("unreadable dataset must not answer with an empty backtest: %d %s", rec.Code, rec.Body.String())
	}
}

// AUD-002: PUT /api/datasets/{id} is a patch merged onto the stored dataset.
// A failed read looked like "nothing stored yet", and the save then dropped
// every field the request did not carry.
func TestAUD002UnreadableDatasetIsNotOverwrittenByPatch(t *testing.T) {
	s := testServer(t, "")
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 9, Volume: 1}}
	if err := s.DB.SaveDataset("AAPL", "Apple Inc", "", "", bars, false); err != nil {
		t.Fatal(err)
	}
	aud002BreakDatasetRead(t, s, "AAPL")
	body, _ := json.Marshal(map[string]any{"tag": "test"})
	req := httptest.NewRequest("PUT", "/api/datasets/AAPL", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 500 {
		t.Fatalf("a patch must not be saved over a dataset nobody could read: %d %s", rec.Code, rec.Body.String())
	}
	var name string
	if err := s.DB.SQL.QueryRow(`SELECT name FROM dataset_meta WHERE ticker='AAPL'`).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "Apple Inc" {
		t.Fatalf("stored dataset was overwritten from a failed read: name=%q", name)
	}
}
