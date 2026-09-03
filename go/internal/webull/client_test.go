package webull

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPlaceOrderSignsAndPostsNodePath(t *testing.T) {
	var sawPlace, sawDetail bool
	var placeBody []byte
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/instrument/list"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"data": []any{map[string]any{"instrument_id": "inst-1", "symbol": "AAPL"}},
			})
		case strings.Contains(r.URL.Path, "/openapi/trade/stock/order/place"):
			sawPlace = true
			placeBody, _ = io.ReadAll(r.Body)
			if r.Header.Get("x-signature") == "" {
				t.Errorf("missing x-signature")
			}
			if r.Header.Get("category") != "US_STOCK" {
				t.Errorf("category %s", r.Header.Get("category"))
			}
			if r.Header.Get("x-access-token") != "tok" {
				t.Errorf("token %s", r.Header.Get("x-access-token"))
			}
			w.WriteHeader(200)
			_, _ = w.Write([]byte(`{"code":0}`))
		case strings.Contains(r.URL.Path, "/trade/order/detail"):
			sawDetail = true
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"status": "FILLED"}})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(ts.Close)
	c := &Client{
		HTTP: ts.Client(), Base: ts.URL, Host: "api.webull.com",
		AppKey: "appkey", AppSecret: "secret", AccessToken: "tok", AccountID: "acc1",
	}
	id, err := c.ResolveInstrumentID("AAPL")
	if err != nil || id != "inst-1" {
		t.Fatalf("instrument %s %v", id, err)
	}
	order := map[string]any{
		"client_order_id": "cid1", "symbol": "AAPL", "instrument_id": id,
		"side": "BUY", "order_type": "MARKET", "quantity": "1",
	}
	resp, err := c.PlaceOrder("acc1", order)
	if err != nil {
		t.Fatal(err)
	}
	if !sawPlace {
		t.Fatal("place path not hit")
	}
	if !strings.Contains(string(placeBody), "cid1") || !strings.Contains(string(placeBody), "new_orders") {
		t.Fatalf("body %s", placeBody)
	}
	if _, err := c.OrderDetail("acc1", "cid1"); err != nil {
		t.Fatal(err)
	}
	if !sawDetail {
		t.Fatal("track/detail path not hit")
	}
	_ = resp
}

func TestSnapshotSignsAndAuthenticates(t *testing.T) {
	var got *http.Request
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []any{map[string]any{"symbol": "AAPL", "price": 230.5, "open": 228, "high": 231, "low": 227, "pre_close": 229}},
		})
	}))
	t.Cleanup(ts.Close)
	c := &Client{
		HTTP: ts.Client(), Base: ts.URL, Host: "api.webull.com",
		AppKey: "appkey", AppSecret: "secret", AccessToken: "snapshot-token",
	}
	resp, err := c.Snapshot("AAPL")
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Fatal("no request")
	}
	if got.URL.Path != "/openapi/market-data/stock/snapshot" {
		t.Fatalf("path %s", got.URL.Path)
	}
	q := got.URL.Query()
	if q.Get("symbols") != "AAPL" || q.Get("category") != "US_STOCK" {
		t.Fatalf("query %s", got.URL.RawQuery)
	}
	if got.Header.Get("x-signature") == "" {
		t.Fatal("missing x-signature")
	}
	if got.Header.Get("x-version") != "v2" {
		t.Fatalf("x-version %s", got.Header.Get("x-version"))
	}
	if got.Header.Get("x-access-token") != "snapshot-token" {
		t.Fatalf("snapshot must send the access token, got %q", got.Header.Get("x-access-token"))
	}
	if resp == nil || resp.Status != 200 {
		t.Fatalf("resp %+v", resp)
	}
}

func TestSnapshotCarriesAccessTokenFromSource(t *testing.T) {
	var gotToken string
	var hit bool
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/openapi/market-data/stock/snapshot") {
			http.NotFound(w, r)
			return
		}
		hit = true
		gotToken = r.Header.Get("x-access-token")
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{map[string]any{"symbol": "AAPL", "price": 1}}})
	}))
	t.Cleanup(ts.Close)
	live := "db-token"
	c := &Client{
		HTTP: ts.Client(), Base: ts.URL, Host: "api.webull.com",
		AppKey: "appkey", AppSecret: "secret", AccessToken: "stale-env",
		Token: func() string { return live },
	}
	if _, err := c.Snapshot("AAPL"); err != nil {
		t.Fatal(err)
	}
	if !hit {
		t.Fatal("snapshot path not hit")
	}
	// Market data is authenticated: without the header Webull answers
	// INVALID_TOKEN and every quote in the UI fails.
	if gotToken != "db-token" {
		t.Fatalf("snapshot token = %q, want the live one", gotToken)
	}
	live = "renewed"
	if _, err := c.Snapshot("AAPL"); err != nil {
		t.Fatal(err)
	}
	if gotToken != "renewed" {
		t.Fatalf("token not re-read after renewal: %q", gotToken)
	}
}

func TestTokenEndpointsStayUnauthenticated(t *testing.T) {
	var sawHeader bool
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-access-token") != "" {
			sawHeader = true
		}
		_, _ = w.Write([]byte(`{"token":"t","status":"PENDING"}`))
	}))
	t.Cleanup(ts.Close)
	c := &Client{
		HTTP: ts.Client(), Base: ts.URL, Host: "api.webull.com",
		AppKey: "appkey", AppSecret: "secret", Token: func() string { return "tok" },
	}
	if _, err := c.CreateToken(); err != nil {
		t.Fatal(err)
	}
	if _, err := c.CheckToken("other"); err != nil {
		t.Fatal(err)
	}
	if sawHeader {
		t.Fatal("token create/check must not send x-access-token")
	}
}
