package live

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/webull"
)

func TestLiveBrokerPlaceMarketHitsPlaceAndTrack(t *testing.T) {
	var sawPlace, sawTrack bool
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/instrument/list"):
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{map[string]any{"instrument_id": "i1"}}})
		case strings.Contains(r.URL.Path, "/openapi/trade/stock/order/place"):
			sawPlace = true
			b, _ := io.ReadAll(r.Body)
			if !strings.Contains(string(b), `"side":"BUY"`) {
				t.Errorf("order body %s", b)
			}
			w.WriteHeader(200)
			_, _ = w.Write([]byte(`{"code":0}`))
		case strings.Contains(r.URL.Path, "/trade/order/detail"):
			sawTrack = true
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"status": "SUBMITTED"}})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(ts.Close)
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	br := &LiveBroker{DB: db, Client: &webull.Client{
		HTTP: ts.Client(), Base: ts.URL, Host: "api.webull.com",
		AppKey: "k", AppSecret: "s", AccessToken: "t", AccountID: "acc",
	}}
	res, err := br.PlaceMarket("AAPL", "BUY", 2)
	if err != nil {
		t.Fatal(err)
	}
	if !res.Submitted || res.ClientOrderID == "" {
		t.Fatalf("%+v", res)
	}
	if !sawPlace || !sawTrack {
		t.Fatalf("place=%v track=%v", sawPlace, sawTrack)
	}
}

func TestFlattenAnyNestedHoldings(t *testing.T) {
	rows := flattenAny(map[string]any{
		"data": map[string]any{
			"has_next": false,
			"holdings": []any{map[string]any{"symbol": "AAPL", "quantity": "10"}},
		},
	})
	if len(rows) != 1 {
		t.Fatalf("holdings %v", rows)
	}
	m, _ := rows[0].(map[string]any)
	if fmt.Sprint(m["symbol"]) != "AAPL" {
		t.Fatalf("row %+v", m)
	}
	orders := flattenAny(map[string]any{
		"data": map[string]any{"orders": []any{map[string]any{"symbol": "MSFT"}}},
	})
	if len(orders) != 1 {
		t.Fatalf("orders %v", orders)
	}
}
