package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"mktorder.com/go/internal/store"

	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/types"
	"mktorder.com/go/internal/webull"
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
	s := testServer(t, "")
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

func TestAuthFailClosedEmptyPassword(t *testing.T) {
	t.Setenv("ADMIN_PASSWORD", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := New(db, dir)
	if !s.prod {
		t.Fatal("empty GO_ENV must be treated as production")
	}
	for _, rt := range []struct{ method, path string }{
		{"GET", "/api/datasets"},
		{"POST", "/api/login"},
		{"GET", "/api/auth/check"},
		{"POST", "/api/autotrade/execute"},
		{"GET", "/api/status"},
	} {
		req := httptest.NewRequest(rt.method, rt.path, nil)
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		if rec.Code != 503 {
			t.Fatalf("%s %s got %d want 503 %s", rt.method, rt.path, rec.Code, rec.Body.String())
		}
	}
}

func TestEnvDevelopmentIsNotProd(t *testing.T) {
	t.Setenv("ADMIN_PASSWORD", "x")
	t.Setenv("GO_ENV", "development")
	t.Setenv("NODE_ENV", "production")
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := New(db, dir)
	if s.prod {
		t.Fatal("explicit GO_ENV=development must not be prod")
	}
}

func TestLoginRememberAndSecureCookie(t *testing.T) {
	s := testServer(t, "secret")
	login := func(remember bool, https bool) *httptest.ResponseRecorder {
		body, _ := json.Marshal(map[string]any{
			"username": "admin@example.com", "password": "secret", "rememberMe": remember,
		})
		req := httptest.NewRequest("POST", "/api/login", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if https {
			req.Header.Set("X-Forwarded-Proto", "https")
		}
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		return rec
	}
	rec := login(false, false)
	if rec.Code != 200 {
		t.Fatalf("login %d %s", rec.Code, rec.Body.String())
	}
	cookies := rec.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("missing auth cookie")
	}
	c := cookies[0]
	if c.MaxAge != 0 {
		t.Fatalf("session cookie MaxAge=%d want 0", c.MaxAge)
	}
	if c.Secure {
		t.Fatal("Secure should be false without https/prod")
	}
	rec = login(true, true)
	if rec.Code != 200 {
		t.Fatalf("remember login %d %s", rec.Code, rec.Body.String())
	}
	c = rec.Result().Cookies()[0]
	if c.MaxAge != int((30 * 24 * 60 * 60)) {
		t.Fatalf("remember MaxAge=%d", c.MaxAge)
	}
	if !c.Secure {
		t.Fatal("Secure should be true when X-Forwarded-Proto=https")
	}
	if !c.HttpOnly {
		t.Fatal("cookie must be HttpOnly")
	}
}

func TestLoginPlaintextConstantTime(t *testing.T) {
	s := testServer(t, "secret")
	body, _ := json.Marshal(map[string]any{"username": "admin@example.com", "password": "wrong-secret"})
	req := httptest.NewRequest("POST", "/api/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 401 {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}

func TestLoginRateLimit(t *testing.T) {
	s := testServer(t, "secret")
	body, _ := json.Marshal(map[string]any{"username": "admin@example.com", "password": "nope"})
	var last int
	for i := 0; i < 12; i++ {
		req := httptest.NewRequest("POST", "/api/login", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "203.0.113.9:1234"
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		last = rec.Code
	}
	if last != 429 {
		t.Fatalf("expected 429 after login burst, got %d", last)
	}
}

func TestOriginCheck(t *testing.T) {
	s := testServer(t, "secret")
	t.Setenv("FRONTEND_ORIGIN", "http://localhost:5173")
	body, _ := json.Marshal(map[string]any{"username": "admin@example.com", "password": "secret"})
	req := httptest.NewRequest("POST", "/api/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "http://evil.example")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 403 {
		t.Fatalf("evil origin got %d %s", rec.Code, rec.Body.String())
	}
	req = httptest.NewRequest("POST", "/api/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "http://localhost:5173")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("allowed origin %d %s", rec.Code, rec.Body.String())
	}
	req = httptest.NewRequest("POST", "/api/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("omitted origin %d %s", rec.Code, rec.Body.String())
	}
}

func TestRecoverMiddleware(t *testing.T) {
	s := testServer(t, "secret")
	s.mux.HandleFunc("GET /api/__panic", func(http.ResponseWriter, *http.Request) {
		panic("boom")
	})
	req := httptest.NewRequest("GET", "/api/__panic", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 500 {
		t.Fatalf("panic got %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "internal server error") {
		t.Fatalf("body %s", rec.Body.String())
	}
}

func TestSettingsRejectAutoTradingAndInvalidJSON(t *testing.T) {
	s := testServer(t, "")
	cur := s.DB.Settings()
	cur["watchThresholdPct"] = 0.4
	if err := s.DB.SaveSettings(cur); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{"autoTrading": map[string]any{"enabled": true, "lowIBS": 0}})
	req := httptest.NewRequest("PATCH", "/api/settings", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 400 || !strings.Contains(rec.Body.String(), "autoTrading must be updated through /api/autotrade/config") {
		t.Fatalf("patch autoTrading %d %s", rec.Code, rec.Body.String())
	}
	req = httptest.NewRequest("PUT", "/api/settings", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("put autoTrading %d %s", rec.Code, rec.Body.String())
	}
	req = httptest.NewRequest("PATCH", "/api/settings", bytes.NewReader([]byte("{not json")))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("invalid json %d %s", rec.Code, rec.Body.String())
	}
	put, _ := json.Marshal(map[string]any{"watchThresholdPct": 0.9})
	req = httptest.NewRequest("PUT", "/api/settings", bytes.NewReader(put))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("put merge %d %s", rec.Code, rec.Body.String())
	}
	st := s.DB.Settings()
	if st["autoTrading"] == nil {
		t.Fatal("PUT must preserve autoTrading")
	}
	at, _ := st["autoTrading"].(map[string]any)
	if at["enabled"] == true {
		t.Fatalf("autoTrading was overwritten: %v", at)
	}
}

func TestDatasetIntegrityRejectsInvalidBars(t *testing.T) {
	s := testServer(t, "")
	payload, _ := json.Marshal(map[string]any{
		"ticker": "BAD",
		"data": []types.OHLC{
			{Date: "2024-01-02", Open: 10, High: 5, Low: 9, Close: 10, Volume: 1},
		},
	})
	req := httptest.NewRequest("POST", "/api/datasets", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "high") || !strings.Contains(rec.Body.String(), "low") {
		t.Fatalf("reasons %s", rec.Body.String())
	}
}

func TestPutDatasetMergesMetadata(t *testing.T) {
	s := testServer(t, "")
	if err := s.DB.SaveDataset("AAA", "AAA", "OldCo", "old", []types.OHLC{
		{Date: "2024-01-01", Open: 10, High: 11, Low: 9, Close: 10, Volume: 1},
	}, false); err != nil {
		t.Fatal(err)
	}
	payload, _ := json.Marshal(map[string]any{
		"data": []types.OHLC{
			{Date: "2024-01-01", Open: 10, High: 11, Low: 9, Close: 10, Volume: 1},
			{Date: "2024-01-02", Open: 11, High: 12, Low: 10, Close: 11, Volume: 1},
		},
	})
	req := httptest.NewRequest("PUT", "/api/datasets/AAA", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("put %d %s", rec.Code, rec.Body.String())
	}
	ds, _ := s.DB.GetDataset("AAA")
	if strPtr(ds["companyName"]) != "OldCo" {
		t.Fatalf("companyName wiped: %v", ds["companyName"])
	}
	if strPtr(ds["tag"]) != "old" {
		t.Fatalf("tag wiped: %v", ds["tag"])
	}
}

func TestDatasetMetadataIsLight(t *testing.T) {
	s := testServer(t, "")
	bars := []types.OHLC{
		{Date: "2024-01-01", Open: 10, High: 11, Low: 9, Close: 10, Volume: 1},
		{Date: "2024-06-01", Open: 11, High: 12, Low: 10, Close: 11, Volume: 1},
	}
	if err := s.DB.SaveDataset("META", "META", "Co", "t", bars, false); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("GET", "/api/datasets/META/metadata", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("meta %d %s", rec.Code, rec.Body.String())
	}
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if _, ok := body["data"]; ok {
		t.Fatalf("metadata must not include OHLC: %v", body)
	}
	if body["lastDate"] != "2024-06-01" {
		t.Fatalf("lastDate %v", body["lastDate"])
	}
}

func TestSplitsInvalidBodyDoesNotWipe(t *testing.T) {
	s := testServer(t, "")
	if err := s.DB.ReplaceSplits("AAA", []types.SplitEvent{{Date: "2024-01-03", Factor: 2}}); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("PUT", "/api/splits/AAA", bytes.NewReader([]byte("{not-array")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("put %d %s", rec.Code, rec.Body.String())
	}
	evs, _ := s.DB.ListSplits("AAA")
	if len(evs) != 1 {
		t.Fatalf("wiped splits: %v", evs)
	}
	req = httptest.NewRequest("PATCH", "/api/splits/AAA", bytes.NewReader([]byte(`{"nope":1}`)))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("patch %d %s", rec.Code, rec.Body.String())
	}
	evs, _ = s.DB.ListSplits("AAA")
	if len(evs) != 1 {
		t.Fatalf("patch wiped splits: %v", evs)
	}
}

func TestRefreshUsesResultsRefreshProviderAndMerges(t *testing.T) {
	av := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"Time Series (Daily)":{
			"2024-01-01":{"1. open":"10","2. high":"12","3. low":"9","4. close":"11","6. volume":"100"},
			"2024-01-08":{"1. open":"11","2. high":"13","3. low":"10","4. close":"12","6. volume":"110"}
		}}`))
	}))
	t.Cleanup(av.Close)
	s := testServer(t, "")
	s.Providers = &providers.Client{HTTP: av.Client(), AlphaKey: "k", AlphaBase: av.URL}
	if err := s.DB.SaveDataset("AAPL", "AAPL", "Apple", "core", []types.OHLC{
		{Date: "2024-01-01", Open: 10, High: 11, Low: 9, Close: 10, Volume: 1},
	}, false); err != nil {
		t.Fatal(err)
	}
	st := s.DB.Settings()
	st["resultsRefreshProvider"] = "alpha_vantage"
	st["enhancerProvider"] = "finnhub"
	_ = s.DB.SaveSettings(st)
	req := httptest.NewRequest("POST", "/api/datasets/AAPL/refresh", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("refresh %d %s", rec.Code, rec.Body.String())
	}
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["success"] != true {
		t.Fatalf("%v", body)
	}
	if body["provider"] != "alpha_vantage" {
		t.Fatalf("provider %v", body["provider"])
	}
	ds, _ := s.DB.GetDataset("AAPL")
	if strPtr(ds["companyName"]) != "Apple" {
		t.Fatalf("company wiped %v", ds["companyName"])
	}
	bars := decodeBars(ds["data"])
	if len(bars) < 2 {
		t.Fatalf("expected merge, got %d bars", len(bars))
	}
}

func TestTestProviderUnknownAndNoKeyLeak(t *testing.T) {
	s := testServer(t, "")
	body, _ := json.Marshal(map[string]any{"provider": "not-real"})
	req := httptest.NewRequest("POST", "/api/test-provider", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("unknown %d %s", rec.Code, rec.Body.String())
	}
	for _, p := range []string{"alpha_vantage", "finnhub", "twelve_data", "polygon", "webull"} {
		b, _ := json.Marshal(map[string]any{"provider": p})
		req = httptest.NewRequest("POST", "/api/test-provider", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		rec = httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		if rec.Code == 400 && strings.Contains(rec.Body.String(), "Unknown provider") {
			t.Fatalf("%s treated as unknown: %s", p, rec.Body.String())
		}
	}
	err := &url.Error{Op: "Get", URL: "https://api.example/query?apikey=SUPERSECRET", Err: os.ErrDeadlineExceeded}
	got := publicErr(err)
	if strings.Contains(got, "SUPERSECRET") {
		t.Fatalf("leaked key: %s", got)
	}
}

func TestTestProviderWebullSnapshot(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/openapi/market-data/stock/snapshot" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("x-access-token") != "tok" {
			t.Errorf("snapshot must carry the access token, got %q", r.Header.Get("x-access-token"))
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []any{map[string]any{
				"symbol": "AAPL", "price": 230.5, "pre_close": 229.0,
				"open": 228.0, "high": 231.0, "low": 227.0,
			}},
		})
	}))
	t.Cleanup(ts.Close)
	s := testServer(t, "")
	s.Providers = &providers.Client{Webull: &webull.Client{
		HTTP: ts.Client(), Base: ts.URL, Host: "api.webull.com",
		AppKey: "appkey", AppSecret: "secret", AccessToken: "tok",
	}}
	body, _ := json.Marshal(map[string]any{"provider": "webull"})
	req := httptest.NewRequest("POST", "/api/test-provider", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("code %d %s", rec.Code, rec.Body.String())
	}
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out["success"] != true || out["symbol"] != "AAPL" || out["price"] != "230.50" {
		t.Fatalf("body %v", out)
	}
}

func TestAutotradeLogsLimitCap(t *testing.T) {
	if clampQueryLimit("9999", 200, autoLogsMaxLimit) != autoLogsMaxLimit {
		t.Fatalf("cap %d", clampQueryLimit("9999", 200, autoLogsMaxLimit))
	}
	if clampQueryLimit("0", 200, autoLogsMaxLimit) != 200 {
		t.Fatal("default")
	}
	s := testServer(t, "")
	req := httptest.NewRequest("GET", "/api/autotrade/logs?limit=9999", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("logs %d %s", rec.Code, rec.Body.String())
	}
}

func TestHiddenTradesOmittedUnlessRequested(t *testing.T) {
	s := testServer(t, "")
	if err := s.DB.InsertTrade("trades", map[string]any{
		"id": "vis", "symbol": "AAPL", "status": "closed", "entryDate": "2024-01-02", "entryPrice": 10,
	}); err != nil {
		t.Fatal(err)
	}
	if err := s.DB.InsertTrade("trades", map[string]any{
		"id": "hid", "symbol": "MSFT", "status": "closed", "entryDate": "2024-01-03", "entryPrice": 20,
	}); err != nil {
		t.Fatal(err)
	}
	if err := s.DB.PatchTrade("trades", "hid", map[string]any{"isHidden": true}); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("GET", "/api/trades", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("trades %d %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), `"hid"`) {
		t.Fatalf("hidden trade leaked: %s", rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"vis"`) {
		t.Fatalf("visible trade missing: %s", rec.Body.String())
	}
	req = httptest.NewRequest("GET", "/api/trades?includeHidden=1", nil)
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if !strings.Contains(rec.Body.String(), `"hid"`) {
		t.Fatalf("includeHidden should return hid: %s", rec.Body.String())
	}
}

func TestReadJSONRejectsHugeBody(t *testing.T) {
	s := testServer(t, "")
	big := bytes.Repeat([]byte("a"), 6<<20)
	req := httptest.NewRequest("PATCH", "/api/settings", bytes.NewReader(append([]byte(`{"x":"`), append(big, `"}`...)...)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("huge body %d %s", rec.Code, rec.Body.String())
	}
}

func patchJSON(s *Server, path string, body any) *httptest.ResponseRecorder {
	b, _ := json.Marshal(body)
	req := httptest.NewRequest("PATCH", path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	return rec
}

func requireWatchError(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	if rec.Code != 400 {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	msg, _ := out["error"].(string)
	if msg == "" {
		t.Fatalf("expected {\"error\": ...}, got %s", rec.Body.String())
	}
}

func watchBySymbol(t *testing.T, s *Server, symbol string) map[string]any {
	t.Helper()
	list, err := s.DB.ListWatches()
	if err != nil {
		t.Fatal(err)
	}
	for _, w := range list {
		if w["symbol"] == symbol {
			return w
		}
	}
	return nil
}

func TestWatchPostRejectsInvertedThresholds(t *testing.T) {
	s := testServer(t, "")
	rec := postJSON(s, "/api/telegram/watch", map[string]any{
		"symbol": "ZZZ", "lowIBS": 0.9, "highIBS": 0.5,
	})
	requireWatchError(t, rec)
	if watchBySymbol(t, s, "ZZZ") != nil {
		t.Fatal("inverted pair must not insert a row")
	}
}

func TestWatchPostRejectsOutOfRangeThresholds(t *testing.T) {
	s := testServer(t, "")
	rec := postJSON(s, "/api/telegram/watch", map[string]any{
		"symbol": "ZZZ", "lowIBS": 1.2,
	})
	requireWatchError(t, rec)
	if watchBySymbol(t, s, "ZZZ") != nil {
		t.Fatal("out-of-range lowIBS must not insert a row")
	}
}

func TestWatchPatchRejectsThresholdsThatInvertPair(t *testing.T) {
	s := testServer(t, "")
	rec := postJSON(s, "/api/telegram/watch", map[string]any{
		"symbol": "AAA", "lowIBS": 0.1, "highIBS": 0.75,
	})
	if rec.Code != 200 {
		t.Fatalf("create %d %s", rec.Code, rec.Body.String())
	}
	rec = patchJSON(s, "/api/telegram/watch/AAA", map[string]any{"lowIBS": 0.9})
	requireWatchError(t, rec)
	got := watchBySymbol(t, s, "AAA")
	if got == nil {
		t.Fatal("row disappeared")
	}
	if got["lowIBS"] != 0.1 || got["highIBS"] != 0.75 {
		t.Fatalf("row mutated on 400: %+v", got)
	}
}
