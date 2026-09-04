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

func TestExtractOrderDetailPayloadNested(t *testing.T) {
	got := extractOrderDetailPayload(map[string]any{
		"data": map[string]any{
			"orders": []any{map[string]any{"status": "SUBMITTED", "filled_quantity": "0", "filled_price": "0"}},
		},
	})
	if fmt.Sprint(got["status"]) != "SUBMITTED" {
		t.Fatalf("nested %+v", got)
	}
	if NormalizeOrderStatus(orderStatusField(got)) != "working" {
		t.Fatalf("status field %q", orderStatusField(got))
	}
}

func TestFilledSubstringInFieldNamesIsNotFill(t *testing.T) {
	var statusInBody string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/instrument/list"):
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{map[string]any{"instrument_id": "i1"}}})
		case strings.Contains(r.URL.Path, "/openapi/trade/stock/order/place"):
			b, _ := io.ReadAll(r.Body)
			statusInBody = string(b)
			w.WriteHeader(200)
			_, _ = w.Write([]byte(`{"code":0}`))
		case strings.Contains(r.URL.Path, "/trade/order/detail"):
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{
				"status": "SUBMITTED", "filled_quantity": "0", "filled_price": "0", "avg_filled_price": "0",
			}})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(ts.Close)
	br := &LiveBroker{Client: &webull.Client{
		HTTP: ts.Client(), Base: ts.URL, Host: "api.webull.com",
		AppKey: "k", AppSecret: "s", AccessToken: "t", AccountID: "acc",
	}}
	res, err := br.PlaceMarket("AAPL", "BUY", 2)
	if err != nil {
		t.Fatal(err)
	}
	if res.Status == "filled" {
		t.Fatalf("SUBMITTED with filled_* fields must not be filled: %+v body=%s", res, statusInBody)
	}
	detail, err := br.OrderDetail(res.ClientOrderID)
	if err != nil {
		t.Fatal(err)
	}
	if NormalizeOrderStatus(orderStatusField(detail)) != "working" {
		t.Fatalf("detail status %+v", detail)
	}
}

func TestPlaceMarketCfgSendsExactQuantity(t *testing.T) {
	var body string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/instrument/list"):
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{map[string]any{"instrument_id": "i1"}}})
		case strings.Contains(r.URL.Path, "/openapi/trade/stock/order/place"):
			b, _ := io.ReadAll(r.Body)
			body = string(b)
			w.WriteHeader(200)
			_, _ = w.Write([]byte(`{"code":0}`))
		case strings.Contains(r.URL.Path, "/trade/order/detail"):
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"status": "SUBMITTED"}})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(ts.Close)
	br := &LiveBroker{Client: &webull.Client{
		HTTP: ts.Client(), Base: ts.URL, Host: "api.webull.com",
		AppKey: "k", AppSecret: "s", AccessToken: "t", AccountID: "acc",
	}}
	// A fractional quantity reaches this path only from an exit selling out a
	// holding a split left fractional, and it must go over the wire intact.
	_, err := br.PlaceMarketCfg("AAPL", "SELL", 1.73, PlaceMarketCfg{})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(body, `"quantity":"1.73"`) {
		t.Fatalf("fractional exit qty body %s", body)
	}
	if !strings.Contains(body, `"time_in_force":"DAY"`) || !strings.Contains(body, `"support_trading_session":"CORE"`) {
		t.Fatalf("tif/session body %s", body)
	}
	if !strings.Contains(body, `"order_type":"MARKET"`) {
		t.Fatalf("live path must stay MARKET: %s", body)
	}
	_, err = br.PlaceMarketCfg("AAPL", "BUY", 2, PlaceMarketCfg{})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(body, `"quantity":"2"`) {
		t.Fatalf("whole qty must not gain decimals, body %s", body)
	}
}

func TestPartialFilledIsNotFinal(t *testing.T) {
	if NormalizeOrderStatus("PARTIAL_FILLED") != "partially_filled" {
		t.Fatal(NormalizeOrderStatus("PARTIAL_FILLED"))
	}
	if IsFinalOrderStatus("partially_filled") {
		t.Fatal("partially_filled must not be final")
	}
}

func TestFormatOrderQuantity(t *testing.T) {
	if formatOrderQuantity(1.73000) != "1.73" {
		t.Fatalf("got %q", formatOrderQuantity(1.73000))
	}
	if formatOrderQuantity(2) != "2" {
		t.Fatalf("got %q", formatOrderQuantity(2))
	}
	if formatOrderQuantity(7) != "7" {
		t.Fatalf("whole must stay whole, got %q", formatOrderQuantity(7))
	}
}
