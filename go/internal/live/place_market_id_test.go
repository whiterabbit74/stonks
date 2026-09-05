package live

import (
	"testing"

	"mktorder.com/go/internal/types"
)

func TestPlaceMarketKeepsCallerClientOrderID(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	res, err := e.placeMarket(backgroundWindow(), "AAPL", "BUY", 1, PlaceMarketCfg{ClientOrderID: "keep-me"}, br)
	if err != nil {
		t.Fatal(err)
	}
	if br.LastCfg.ClientOrderID != "keep-me" {
		t.Fatalf("caller ClientOrderID overwritten: %q", br.LastCfg.ClientOrderID)
	}
	if res.ClientOrderID != "keep-me" {
		t.Fatalf("result id %q", res.ClientOrderID)
	}
}
