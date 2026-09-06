package live

import (
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

	res, err := e.placeMarket(backgroundWindow(), "AAPL", "BUY", 1, PlaceMarketCfg{}, br)
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
