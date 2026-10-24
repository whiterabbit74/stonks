package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-154: a closing bar with Close above High gave a NaN exit IBS, and the
// whole backtest answered 500 "encode failed". Such a bar sent with the
// request is refused up front now (AUD-181); one already stored, from before
// import checked it, still has to come back as a result.
func TestCalcSurvivesNaNExitIBS(t *testing.T) {
	s := testServer(t, "")
	if err := s.DB.SaveDataset("AAA", "AAA", "", "", []types.OHLC{
		{Date: "2026-08-03", Open: 100, High: 110, Low: 100, Close: 100},
		{Date: "2026-09-03", Open: 105, High: 110, Low: 100, Close: 120},
	}, false); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{"tickers": []any{map[string]any{"ticker": "AAA"}}})
	req := httptest.NewRequest(http.MethodPost, "/api/calc/single-position", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}

// AUD-181: bars sent with the request skipped the import check. Two bars
// newest first made a profitable trade that exited the day before it
// entered; a data field of the wrong type ran as no data at all.
func TestCalcRejectsUncheckedRequestBars(t *testing.T) {
	s := testServer(t, "")
	reversed := []any{
		map[string]any{"date": "2026-10-22", "open": 100, "high": 110, "low": 90, "close": 91},
		map[string]any{"date": "2026-10-21", "open": 100, "high": 110, "low": 90, "close": 109},
	}
	for name, body := range map[string]map[string]any{
		"reversed":         {"data": reversed},
		"wrong type":       {"data": map[string]any{"date": "2026-10-21"}},
		"reversed, ticker": {"tickers": []any{map[string]any{"ticker": "AAA", "data": reversed}}},
	} {
		raw, _ := json.Marshal(body)
		path := "/api/calc/clean-backtest"
		if _, multi := body["tickers"]; multi {
			path = "/api/calc/single-position"
		}
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(raw))
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		if rec.Code != 400 {
			t.Fatalf("%s: got %d %s, want 400", name, rec.Code, rec.Body.String())
		}
	}
}

// AUD-155: a ticker with no data anywhere was dropped silently and the
// "best of the set" ran on a smaller set.
func TestCalcRejectsTickerWithoutData(t *testing.T) {
	s := testServer(t, "")
	body, _ := json.Marshal(map[string]any{"tickers": []any{
		map[string]any{"ticker": "AAA", "data": []any{
			map[string]any{"date": "2026-08-03", "open": 100, "high": 110, "low": 100, "close": 100},
		}},
		map[string]any{"ticker": "MISSING"},
	}})
	req := httptest.NewRequest(http.MethodPost, "/api/calc/single-position", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 400 || !bytes.Contains(rec.Body.Bytes(), []byte("MISSING")) {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}
