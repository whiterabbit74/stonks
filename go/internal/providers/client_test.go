package providers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"mktorder.com/go/internal/types"
)

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
