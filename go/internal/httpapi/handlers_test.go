package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

func TestApplySplitsAdjustsOHLC(t *testing.T) {
	s := testServer(t, "")
	bars := []types.OHLC{
		{Date: "2024-01-01", Open: 100, High: 110, Low: 90, Close: 100, Volume: 1000},
		{Date: "2024-01-02", Open: 100, High: 110, Low: 90, Close: 100, Volume: 1000},
		{Date: "2024-01-03", Open: 50, High: 55, Low: 45, Close: 50, Volume: 2000},
	}
	if err := s.DB.SaveDataset("AAA", "AAA", "", "", bars, false); err != nil {
		t.Fatal(err)
	}
	if err := s.DB.ReplaceSplits("AAA", []types.SplitEvent{{Date: "2024-01-03", Factor: 2}}); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("POST", "/api/datasets/AAA/apply-splits", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("apply %d %s", rec.Code, rec.Body.String())
	}
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["success"] != true {
		t.Fatalf("%v", body)
	}
	ds, _ := s.DB.GetDataset("AAA")
	if ds["adjustedForSplits"] != true {
		t.Fatalf("flag %v", ds["adjustedForSplits"])
	}
	out := decodeBars(ds["data"])
	if out[0].Close != 50 {
		t.Fatalf("pre-split close %v want 50", out[0].Close)
	}
	if out[2].Close != 50 {
		t.Fatalf("split-day close should stay 50, got %v", out[2].Close)
	}
	req = httptest.NewRequest("POST", "/api/datasets/AAA/apply-splits", nil)
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["alreadyApplied"] != true {
		t.Fatalf("second apply %v", body)
	}
	ds2, _ := s.DB.GetDataset("AAA")
	out2 := decodeBars(ds2["data"])
	if out2[0].Close != 50 {
		t.Fatalf("re-apply mutated prices %v", out2[0].Close)
	}
}

func TestPatchDatasetMetadata(t *testing.T) {
	s := testServer(t, "")
	if err := s.DB.SaveDataset("BBB", "BBB", "OldCo", "old", nil, false); err != nil {
		t.Fatal(err)
	}
	payload, _ := json.Marshal(map[string]any{"tag": "core", "companyName": "NewCo"})
	req := httptest.NewRequest("PATCH", "/api/datasets/BBB/metadata", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	ds, _ := s.DB.GetDataset("BBB")
	if strPtr(ds["companyName"]) != "NewCo" {
		t.Fatalf("company %v", ds["companyName"])
	}
	if strPtr(ds["tag"]) != "core" {
		t.Fatalf("tag %v", ds["tag"])
	}
}

func TestPatchCalendarDay(t *testing.T) {
	s := testServer(t, "")
	payload, _ := json.Marshal(map[string]any{"year": "2026", "mmdd": "07-03", "type": "holiday", "name": "Independence Day"})
	req := httptest.NewRequest("PATCH", "/api/trading-calendar/day", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	raw, _ := s.DB.GetCalendar()
	var cal map[string]any
	_ = json.Unmarshal(raw, &cal)
	holidays, _ := cal["holidays"].(map[string]any)
	year, _ := holidays["2026"].(map[string]any)
	if year["07-03"] == nil {
		t.Fatalf("holiday not stored: %s", raw)
	}
}

func TestQuoteContractWithMockProvider(t *testing.T) {
	av := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"Time Series (Daily)":{
			"2026-08-03":{"1. open":"10","2. high":"12","3. low":"9","4. close":"11","6. volume":"100"},
			"2026-08-04":{"1. open":"11","2. high":"13","3. low":"10","4. close":"12","6. volume":"110"}
		}}`))
	}))
	t.Cleanup(av.Close)
	s := testServer(t, "")
	s.Providers = &providers.Client{
		HTTP: av.Client(), AlphaKey: "k", AlphaBase: av.URL,
		FinnhubKey: "k", FinnhubBase: av.URL,
	}
	req := httptest.NewRequest("GET", "/api/quote/AAPL?provider=alpha_vantage", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("quote %d %s", rec.Code, rec.Body.String())
	}
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["provider"] != "alpha_vantage" || body["dateKey"] == nil || body["quote"] == nil {
		t.Fatalf("contract %v", body)
	}
	q, _ := body["quote"].(map[string]any)
	if q["current"] != 12.0 {
		t.Fatalf("current %v", q["current"])
	}
	req = httptest.NewRequest("GET", "/api/yahoo-finance/AAPL?provider=alpha_vantage", nil)
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("yahoo %d %s", rec.Code, rec.Body.String())
	}
	var hist map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &hist)
	if hist["dataPoints"] != 2.0 {
		t.Fatalf("yahoo body %v", hist)
	}
	req = httptest.NewRequest("GET", "/api/fetch/alpha_vantage/AAPL", nil)
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("fetch %d %s", rec.Code, rec.Body.String())
	}
}

func TestQuoteMissingKeyIsClientError(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := New(db, dir)
	s.Providers = providers.FromEnv()
	s.Providers.FinnhubKey = ""
	req := httptest.NewRequest("GET", "/api/quote/AAPL?provider=finnhub", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code < 400 {
		t.Fatalf("expected 4xx, got %d %s", rec.Code, rec.Body.String())
	}
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["error"] == nil {
		t.Fatalf("missing error field %v", body)
	}
}

func TestGetCalendarSeedsNYSEHolidays(t *testing.T) {
	s := testServer(t, "")
	req := httptest.NewRequest("GET", "/api/trading-calendar", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !strings.Contains(body, "Labor Day") || !strings.Contains(body, `"09-07"`) {
		t.Fatalf("calendar missing 2026 Labor Day: %s", body)
	}
	if !strings.Contains(body, "Christmas Eve") {
		t.Fatalf("calendar missing short day: %s", body)
	}
}

func TestFetchUnknownProvider(t *testing.T) {
	s := testServer(t, "")
	req := httptest.NewRequest("GET", "/api/fetch/not-a-provider/AAPL", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}
