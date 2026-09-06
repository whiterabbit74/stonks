package live

import (
	"fmt"
	"testing"

	"mktorder.com/go/internal/types"
)

// ambiguousBroker fails the placement at the transport level and cannot answer
// the follow-up lookup either: the order may or may not be live at the broker.
type ambiguousBroker struct{ placed []string }

func (b *ambiguousBroker) PlaceMarket(symbol, side string, qty float64) (OrderResult, error) {
	return b.PlaceMarketCfg(symbol, side, qty, PlaceMarketCfg{})
}

func (b *ambiguousBroker) PlaceMarketCfg(symbol, side string, qty float64, cfg PlaceMarketCfg) (OrderResult, error) {
	b.placed = append(b.placed, cfg.ClientOrderID)
	err := fmt.Errorf("post order: timeout")
	return OrderResult{ClientOrderID: cfg.ClientOrderID, Symbol: symbol, Side: side, Quantity: qty, Error: err.Error()}, err
}

func (b *ambiguousBroker) CloseMarket(string) (OrderResult, error) { return OrderResult{}, nil }
func (b *ambiguousBroker) Account() (map[string]any, error)        { return map[string]any{}, nil }
func (b *ambiguousBroker) Positions() ([]any, error) {
	return []any{map[string]any{"symbol": "AAPL", "quantity": 3.0}}, nil
}
func (b *ambiguousBroker) OpenOrders() ([]any, error)                 { return nil, nil }
func (b *ambiguousBroker) OrderHistory(string, string) ([]any, error) { return nil, nil }
func (b *ambiguousBroker) CancelOrder(string) error                   { return nil }
func (b *ambiguousBroker) OrderDetail(string) (map[string]any, error) {
	return nil, fmt.Errorf("order detail: timeout")
}

// TestManualAmbiguousOrderIsTracked covers AUD-024: a manual ClosePosition
// whose submission ends Ambiguous minted a client order id that may be live at
// the broker. It must be journalled, so the operator's second click is refused
// instead of sending a second MARKET.
func TestManualAmbiguousOrderIsTracked(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, _ := testEngine(t, bars)
	br := &ambiguousBroker{}
	e.Broker = br

	res, _ := e.ClosePosition("webull", "AAPL")
	if !res.Ambiguous || res.ClientOrderID == "" {
		t.Fatalf("setup: expected an ambiguous send with an id, got %+v", res)
	}
	if db.GetOrderTracker(res.ClientOrderID) == nil {
		t.Fatalf("an ambiguous manual order must start a tracker: %s", res.ClientOrderID)
	}

	sent := len(br.placed)
	again, err := e.ClosePosition("webull", "AAPL")
	if err == nil || again.Error != "pending_exit_tracker_exists" {
		t.Fatalf("the repeat click must be refused, got %+v (err=%v)", again, err)
	}
	if len(br.placed) != sent {
		t.Fatalf("no second MARKET may leave: %d placements", len(br.placed))
	}
}
