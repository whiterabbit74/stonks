package webull

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
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
