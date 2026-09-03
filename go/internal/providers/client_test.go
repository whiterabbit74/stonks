package providers

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"mktorder.com/go/internal/types"
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
