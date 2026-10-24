package webull

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// AUD-086: /instrument/list ходил перед каждой заявкой — выход, вход, повтор —
// и каждый вызов занимал слот ограничителя вплотную к MARKET-заявке.
func TestResolveInstrumentIDCachesTheLookup(t *testing.T) {
	calls := 0
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{
			map[string]any{"symbol": "AAPL", "instrument_id": "inst-1"},
		}})
	}))
	t.Cleanup(ts.Close)
	c := &Client{
		HTTP: ts.Client(), Base: ts.URL, Host: "api.webull.com",
		AppKey: "appkey", AppSecret: "secret", AccessToken: "tok", AccountID: "acc1",
	}
	for i := 0; i < 3; i++ {
		id, err := c.ResolveInstrumentID("aapl")
		if err != nil || id != "inst-1" {
			t.Fatalf("resolve %d: %s %v", i, id, err)
		}
	}
	if calls != 1 {
		t.Fatalf("want one lookup, got %d", calls)
	}
}

// AUD-178: the order path looked the instrument up with no context, so an
// uncached lookup kept waiting its own 15 s after the order's deadline.
func TestResolveInstrumentIDCtxStopsAtDeadline(t *testing.T) {
	release := make(chan struct{})
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-release:
		case <-r.Context().Done():
		}
	}))
	t.Cleanup(func() { close(release); ts.Close() })
	c := &Client{
		HTTP: ts.Client(), Base: ts.URL, Host: "api.webull.com",
		AppKey: "appkey", AppSecret: "secret", AccessToken: "tok", AccountID: "acc1",
	}
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	start := time.Now()
	if _, err := c.ResolveInstrumentIDCtx(ctx, "AAPL"); err == nil {
		t.Fatal("a lookup past the deadline must fail")
	}
	if took := time.Since(start); took > 2*time.Second {
		t.Fatalf("lookup ignored the deadline: %v", took)
	}
}
