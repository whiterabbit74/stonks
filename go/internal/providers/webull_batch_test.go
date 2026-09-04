package providers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"mktorder.com/go/internal/webull"
)

// batchSnapshotServer answers the snapshot endpoint with one row per requested
// symbol and records how many requests and which symbols string it saw.
func batchSnapshotServer(t *testing.T, rows []any) (*Client, *int32, *string) {
	t.Helper()
	var calls int32
	var lastSymbols string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/openapi/market-data/stock/snapshot" {
			http.NotFound(w, r)
			return
		}
		atomic.AddInt32(&calls, 1)
		lastSymbols = r.URL.Query().Get("symbols")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"data": rows})
	}))
	t.Cleanup(ts.Close)
	c := &Client{Webull: &webull.Client{
		HTTP: ts.Client(), Base: ts.URL, Host: "api.webull.com",
		AppKey: "appkey", AppSecret: "secret", AccessToken: "snapshot-token",
	}}
	return c, &calls, &lastSymbols
}

func TestQuoteBatchAsksWebullOnce(t *testing.T) {
	rows := []any{
		map[string]any{"symbol": "MSFT", "open": 500.0, "high": 505.0, "low": 499.0, "price": 500.1},
		map[string]any{"symbol": "AAPL", "open": 320.0, "high": 322.0, "low": 318.0, "price": 320.5},
		map[string]any{"symbol": "V", "open": 374.0, "high": 376.0, "low": 373.0, "price": 374.8},
	}
	c, calls, symbols := batchSnapshotServer(t, rows)
	out, err := c.QuoteBatch([]string{"MSFT", "AAPL", "V"}, "webull")
	if err != nil {
		t.Fatal(err)
	}
	if *calls != 1 {
		t.Fatalf("a batch must be one request, got %d", *calls)
	}
	if *symbols != "MSFT,AAPL,V" {
		t.Fatalf("symbols param %q", *symbols)
	}
	if len(out) != 3 {
		t.Fatalf("want a payload per symbol: %+v", out)
	}
	if out["MSFT"].Quote["current"] != 500.1 || out["V"].Range["low"] != 373.0 {
		t.Fatalf("rows landed on the wrong symbols: %+v", out)
	}
}

// A row for a symbol nobody asked for, or a row without a symbol, must never be
// handed to another ticker — that would feed one stock's IBS into another's
// decision. The caller falls back to a single-symbol call for what is missing.
func TestQuoteBatchSkipsUnmatchedRows(t *testing.T) {
	rows := []any{
		map[string]any{"open": 1.0, "high": 2.0, "low": 0.5, "price": 1.5},
		map[string]any{"symbol": "TSLA", "open": 10.0, "high": 12.0, "low": 9.0, "price": 11.0},
	}
	c, _, _ := batchSnapshotServer(t, rows)
	out, err := c.QuoteBatch([]string{"MSFT", "AAPL"}, "webull")
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 0 {
		t.Fatalf("no requested symbol was answered: %+v", out)
	}
}

func TestQuoteBatchIgnoresProvidersWithoutBatch(t *testing.T) {
	c, calls, _ := batchSnapshotServer(t, nil)
	out, err := c.QuoteBatch([]string{"MSFT"}, "finnhub")
	if err != nil || out != nil {
		t.Fatalf("a provider with no batch endpoint must opt out: %+v %v", out, err)
	}
	if *calls != 0 {
		t.Fatalf("nothing should have been requested, got %d", *calls)
	}
}
