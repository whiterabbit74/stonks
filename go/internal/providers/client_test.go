package providers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
	"mktorder.com/go/internal/webull"
)

type errTransport struct{ err error }

func (e errTransport) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, e.err
}

func assertNoSecret(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("expected error")
	}
	msg := err.Error()
	for _, leak := range []string{"SECRET", "apikey=SECRET", "api_key=SECRET", "token=SECRET"} {
		if strings.Contains(msg, leak) {
			t.Fatalf("secret leaked in error %q", msg)
		}
	}
	if strings.Contains(strings.ToLower(msg), "apikey=secret") {
		t.Fatalf("apikey query leaked in error %q", msg)
	}
}

func TestGetDoErrorRedactsAPIKey(t *testing.T) {
	raw := "https://api.example.com/query?function=TIME_SERIES_DAILY&apikey=SECRET&symbol=AAPL"
	c := &Client{HTTP: &http.Client{Transport: errTransport{errors.New("connection refused")}}}
	_, _, err := c.get(raw)
	assertNoSecret(t, err)
	if strings.Contains(err.Error(), raw) || strings.Contains(err.Error(), "/query?") {
		t.Fatalf("raw URL/query leaked in error %q", err.Error())
	}
	wrapped := fmt.Errorf("alpha: %w", err)
	assertNoSecret(t, wrapped)
}

func TestGetDoErrorRedactsTokenAndAPIKeyAliases(t *testing.T) {
	cases := []string{
		"https://finnhub.io/api/v1/quote?symbol=AAPL&token=SECRET",
		"https://api.polygon.io/v2/aggs?api_key=SECRET",
		"https://api.twelvedata.com/price?symbol=AAPL&apiKey=SECRET",
	}
	c := &Client{HTTP: &http.Client{Transport: errTransport{errors.New("timeout")}}}
	for _, raw := range cases {
		_, _, err := c.get(raw)
		assertNoSecret(t, err)
		assertNoSecret(t, fmt.Errorf("provider: %w", err))
	}
}

func TestGetDoErrorRedactsURLErrorFromTransport(t *testing.T) {
	raw := "https://www.alphavantage.co/query?apikey=SECRET&outputsize=full"
	c := &Client{HTTP: &http.Client{Transport: errTransport{&url.Error{
		Op:  "Get",
		URL: raw,
		Err: errors.New("dial tcp: connection refused"),
	}}}}
	_, _, err := c.get(raw)
	assertNoSecret(t, err)
	if strings.Contains(err.Error(), "apikey=") {
		t.Fatalf("query leaked in error %q", err.Error())
	}
}

func TestNormalizeIntradayRangeRejectsCurrentPrevCloseFabrication(t *testing.T) {
	if got := NormalizeIntradayRange(nil, map[string]any{"current": 10.0, "prevClose": 12.0}); got != nil {
		t.Fatalf("current/prevClose must not become a range: %+v", got)
	}
	if got := NormalizeIntradayRange(map[string]any{}, map[string]any{"current": 8.0, "open": 8.0}); got != nil {
		t.Fatalf("current==open must not become a range: %+v", got)
	}
	got := NormalizeIntradayRange(map[string]any{"low": 90.0, "high": 100.0}, map[string]any{"current": 95.0})
	if got == nil || got["low"] != 90.0 || got["high"] != 100.0 {
		t.Fatalf("real session range: %+v", got)
	}
	got = NormalizeIntradayRange(nil, map[string]any{"low": 90.0, "high": 100.0, "current": 95.0})
	if got == nil || got["low"] != 90.0 {
		t.Fatalf("quote high/low fallback: %+v", got)
	}
}

func TestGetNewRequestErrorRedactsAPIKey(t *testing.T) {
	c := &Client{HTTP: http.DefaultClient}
	_, _, err := c.get("http://a b.com/?apikey=SECRET")
	assertNoSecret(t, err)
}

func TestHistoricalTransportErrorRedactsKey(t *testing.T) {
	c := &Client{
		HTTP:      &http.Client{Transport: errTransport{errors.New("connection refused")}},
		AlphaKey:  "SECRET",
		AlphaBase: "https://www.alphavantage.co",
	}
	_, err := c.Historical("AAPL", "alpha_vantage", 0, 2000000000, "none")
	assertNoSecret(t, err)
	assertNoSecret(t, fmt.Errorf("historical: %w", err))
}

func TestRedactSecretsStripsQueryKeys(t *testing.T) {
	in := `Get "https://x/q?apikey=SECRET&token=SECRET&api_key=SECRET": boom`
	out := redactSecrets(in)
	if strings.Contains(out, "SECRET") {
		t.Fatalf("secret remains: %s", out)
	}
	if !strings.Contains(out, "apikey=REDACTED") || !strings.Contains(out, "token=REDACTED") || !strings.Contains(out, "api_key=REDACTED") {
		t.Fatalf("expected redacted placeholders, got %s", out)
	}
}

func TestHistoricalMissingKey(t *testing.T) {
	c := &Client{HTTP: http.DefaultClient}
	_, err := c.Historical("AAPL", "finnhub", 1, 2, "none")
	he, ok := err.(*HTTPError)
	if !ok || he.Status < 400 {
		t.Fatalf("want 4xx HTTPError, got %v", err)
	}
}

func TestBuildQuoteFromRows(t *testing.T) {
	p, err := BuildQuoteFromRows([]types.OHLC{
		{Date: "2026-01-01", Open: 1, High: 2, Low: 0.5, Close: 1.5},
		{Date: "2026-01-02", Open: 1.5, High: 3, Low: 1, Close: 2.5},
	})
	if err != nil {
		t.Fatal(err)
	}
	if p.DateKey != "2026-01-02" {
		t.Fatalf("dateKey %s", p.DateKey)
	}
	if p.Quote["current"] != 2.5 {
		t.Fatalf("current %v", p.Quote["current"])
	}
	if p.Quote["prevClose"] != 1.5 {
		t.Fatalf("prev %v", p.Quote["prevClose"])
	}
}

func testWebullQuoteClient(t *testing.T, body any) *Client {
	t.Helper()
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/openapi/market-data/stock/snapshot" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("x-access-token") != "snapshot-token" {
			t.Errorf("snapshot must carry the access token, got %q", r.Header.Get("x-access-token"))
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(body)
	}))
	t.Cleanup(ts.Close)
	return &Client{Webull: &webull.Client{
		HTTP: ts.Client(), Base: ts.URL, Host: "api.webull.com",
		AppKey: "appkey", AppSecret: "secret", AccessToken: "snapshot-token",
	}}
}

func TestWebullQuoteParsesSnapshot(t *testing.T) {
	c := testWebullQuoteClient(t, map[string]any{
		"data": []any{map[string]any{
			"symbol": "AAPL", "open": 228.0, "high": 231.0, "low": 227.0,
			"price": 230.5, "pre_close": 229.0,
		}},
	})
	q, err := c.Quote("AAPL", "webull")
	if err != nil {
		t.Fatal(err)
	}
	if q.DateKey != tradingdate.TodayNYSE(time.Now()) {
		t.Fatalf("dateKey %s want NYSE today", q.DateKey)
	}
	if q.Quote["current"] != 230.5 {
		t.Fatalf("current %v", q.Quote["current"])
	}
	if q.Quote["prevClose"] != 229.0 {
		t.Fatalf("prevClose %v", q.Quote["prevClose"])
	}
	if q.Range["high"] != 231.0 || q.Range["low"] != 227.0 {
		t.Fatalf("range %+v", q.Range)
	}
}

func TestWebullQuotePrefersPriceOverClose(t *testing.T) {
	c := testWebullQuoteClient(t, map[string]any{
		"data": []any{map[string]any{
			"symbol": "MSFT", "price": 410.0, "close": 400.0, "lastPrice": 409.0,
			"pre_close": 400.0, "open": 401.0, "high": 412.0, "low": 399.0,
		}},
	})
	q, err := c.Quote("MSFT", "webull")
	if err != nil {
		t.Fatal(err)
	}
	if q.Quote["current"] != 410.0 {
		t.Fatalf("price must win over close/lastPrice, got %v", q.Quote["current"])
	}
}

func TestWebullQuoteFieldAliases(t *testing.T) {
	c := testWebullQuoteClient(t, []any{map[string]any{
		"ticker": "AAPL", "o": 10.0, "h": 12.0, "l": 9.0, "c": 11.0, "pc": 10.5,
	}})
	q, err := c.Quote("AAPL", "webull")
	if err != nil {
		t.Fatal(err)
	}
	if q.Quote["current"] != 11.0 || q.Quote["prevClose"] != 10.5 {
		t.Fatalf("aliases %+v", q.Quote)
	}
	if q.Range["open"] != 10.0 {
		t.Fatalf("open %v", q.Range["open"])
	}
}

func TestWebullQuoteZeroCurrentIsValid(t *testing.T) {
	c := testWebullQuoteClient(t, map[string]any{
		"data": []any{map[string]any{"symbol": "AAPL", "price": 0.0, "pre_close": 1.0, "open": 1.0, "high": 2.0, "low": 0.0}},
	})
	q, err := c.Quote("AAPL", "webull")
	if err != nil {
		t.Fatal(err)
	}
	if q.Quote["current"] != 0.0 {
		t.Fatalf("zero current must not be treated as missing: %v", q.Quote["current"])
	}
}

func TestWebullQuoteMissingCredentials(t *testing.T) {
	c := &Client{}
	_, err := c.Quote("AAPL", "webull")
	he, ok := err.(*HTTPError)
	if !ok || he.Status != 400 || !strings.Contains(he.Message, "credentials") {
		t.Fatalf("want 400 credentials, got %v", err)
	}
}

func TestWebullQuoteEmptySnapshot(t *testing.T) {
	c := testWebullQuoteClient(t, map[string]any{"data": []any{}})
	_, err := c.Quote("AAPL", "webull")
	he, ok := err.(*HTTPError)
	if !ok || he.Status != 404 {
		t.Fatalf("want 404, got %v", err)
	}
}

func TestAlphaHistoryParsesTimeSeries(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"Time Series (Daily)":{"2026-08-01":{"1. open":"1","2. high":"2","3. low":"0.5","4. close":"1.5","6. volume":"10"}}}`))
	}))
	t.Cleanup(srv.Close)
	c := &Client{HTTP: srv.Client(), AlphaKey: "k", AlphaBase: srv.URL}
	hist, err := c.Historical("AAPL", "alpha_vantage", 0, 2000000000, "none")
	if err != nil {
		t.Fatal(err)
	}
	if len(hist.Rows) != 1 || hist.Rows[0].Close != 1.5 {
		t.Fatalf("%+v", hist.Rows)
	}
}
