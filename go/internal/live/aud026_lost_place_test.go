package live

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
	"mktorder.com/go/internal/webull"
)

// webullOrderDetailBody answers /trade/order/detail with body, /instrument/list
// with one instrument, and counts /order/place calls. Everything else 404s, so
// the open-orders snapshot fallback finds nothing — the "200 with a body we
// cannot read" case AUD-026 is about.
func webullBrokerFor(t *testing.T, detailBody string, placeStatus int, places *int64) *LiveBroker {
	t.Helper()
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/instrument/list"):
			_, _ = w.Write([]byte(`{"data":[{"instrument_id":"i1"}]}`))
		case strings.Contains(r.URL.Path, "/order/place"):
			atomic.AddInt64(places, 1)
			w.WriteHeader(placeStatus)
			_, _ = w.Write([]byte(`{"code":0}`))
		case strings.Contains(r.URL.Path, "/trade/order/detail"):
			_, _ = w.Write([]byte(detailBody))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(ts.Close)
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return &LiveBroker{DB: db, Client: &webull.Client{
		HTTP: ts.Client(), Base: ts.URL, Host: "api.webull.com",
		AppKey: "k", AppSecret: "s", AccessToken: "t", AccountID: "acc",
	}}
}

// An OrderDetail that answers 200 with nothing usable cannot prove the order
// is absent, so it must not be reported as terminal-absent.
func TestAUD026EmptyOrderDetailIsUnavailableNotAbsent(t *testing.T) {
	var places int64
	br := webullBrokerFor(t, `{"code":0,"data":{}}`, 200, &places)
	_, err := br.OrderDetail("c-1")
	if errors.Is(err, ErrOrderNotFound) {
		t.Fatalf("empty detail body read as proof the order is absent: %v", err)
	}
	if !errors.Is(err, ErrOrderUnavailable) {
		t.Fatalf("want ErrOrderUnavailable, got %v", err)
	}
}

// The audit's scenario: the Place response is lost (the order may well have
// been accepted) and the immediate OrderDetail comes back empty. placeMarket
// must stop with an ambiguous result instead of minting a second client order
// id and buying twice.
func TestAUD026LostPlaceWithEmptyDetailDoesNotResend(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, _ := testEngine(t, bars)
	var places int64
	br := webullBrokerFor(t, `{"code":0,"data":{}}`, 500, &places)

	res, err := e.placeMarket(backgroundWindow(), "AAPL", "BUY", 1, PlaceMarketCfg{}, br, orderMeta{})
	if err != nil {
		t.Fatal(err)
	}
	if n := atomic.LoadInt64(&places); n != 1 {
		t.Fatalf("a lost Place plus an unreadable detail resent the order: %d placements", n)
	}
	if res.Submitted || !res.Ambiguous {
		t.Fatalf("want ambiguous, unsubmitted: %+v", res)
	}
}

// Same root cause on the state reads that gate an entry: a 2xx body with no
// list in it is an unread page, not an empty account. Reading it as "flat" or
// "nothing working" is what lets a second position or a second order go out.
func TestAUD026UnreadableStateReadsAreNotEmpty(t *testing.T) {
	var places int64
	for _, tc := range []struct {
		name string
		body string
		ok   bool
	}{
		{"empty list is empty", `{"code":0,"data":[]}`, true},
		{"nested empty list is empty", `{"code":0,"data":{"holdings":[]}}`, true},
		{"no list at all fails", `{"code":0,"data":{}}`, false},
		{"empty body fails", ``, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			br := webullBrokerFor(t, `{"code":0,"data":{}}`, 200, &places)
			ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = w.Write([]byte(tc.body))
			}))
			t.Cleanup(ts.Close)
			br.Client.Base = ts.URL

			pos, perr := br.Positions()
			open, oerr := br.OpenOrders()
			if tc.ok {
				if perr != nil || pos == nil {
					t.Fatalf("positions: %v %v", pos, perr)
				}
				if oerr != nil || open == nil {
					t.Fatalf("open orders: %v %v", open, oerr)
				}
				return
			}
			if perr == nil {
				t.Fatalf("unreadable positions body read as flat: %v", pos)
			}
			if oerr == nil {
				t.Fatalf("unreadable open-orders body read as no working orders: %v", open)
			}
		})
	}
}

// The Robinhood broker reaches the same conclusion through a different path:
// the tool answer is not JSON, so nothing is collected and the account looks
// flat with no error.
func TestAUD026RobinhoodUnreadableToolAnswerIsNotFlat(t *testing.T) {
	call := func(name string, args map[string]any) (json.RawMessage, error) {
		if name == "get_accounts" {
			return json.Marshal(map[string]any{"content": []any{map[string]any{
				"type": "text", "text": `{"account_number":"RH1","agentic_allowed":true}`}}})
		}
		return json.RawMessage(`not json at all`), nil
	}
	br := &RobinhoodBroker{Call: call}
	if pos, err := br.Positions(); err == nil {
		t.Fatalf("unreadable positions answer read as flat: %v", pos)
	}
	if open, err := br.OpenOrders(); err == nil {
		t.Fatalf("unreadable orders answer read as no working orders: %v", open)
	}
}
