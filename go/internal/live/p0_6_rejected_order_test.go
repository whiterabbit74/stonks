package live

import (
	"fmt"
	"testing"

	"mktorder.com/go/internal/types"
)

// rejectingBroker answers a placement with a business rejection (no transport
// error) and then reports that exact client order id as rejected, the way a
// broker that refused the order does.
type rejectingBroker struct {
	placed []string
	status string
}

func (b *rejectingBroker) PlaceMarket(symbol, side string, qty float64) (OrderResult, error) {
	return b.PlaceMarketCfg(symbol, side, qty, PlaceMarketCfg{})
}

func (b *rejectingBroker) PlaceMarketCfg(symbol, side string, qty float64, cfg PlaceMarketCfg) (OrderResult, error) {
	b.placed = append(b.placed, cfg.ClientOrderID)
	return OrderResult{
		ClientOrderID: cfg.ClientOrderID, Symbol: symbol, Side: side, Quantity: qty,
		Status: "rejected", Error: "order rejected by broker",
	}, nil
}

func (b *rejectingBroker) CloseMarket(string) (OrderResult, error) { return OrderResult{}, nil }
func (b *rejectingBroker) Account() (map[string]any, error)        { return map[string]any{}, nil }
func (b *rejectingBroker) Positions() ([]any, error)               { return nil, nil }
func (b *rejectingBroker) OpenOrders() ([]any, error)              { return nil, nil }
func (b *rejectingBroker) OrderHistory(string, string) ([]any, error) {
	return nil, nil
}
func (b *rejectingBroker) CancelOrder(string) error { return nil }
func (b *rejectingBroker) OrderDetail(clientOrderID string) (map[string]any, error) {
	for _, id := range b.placed {
		if id == clientOrderID {
			return map[string]any{"client_order_id": id, "status": b.status}, nil
		}
	}
	return nil, ErrOrderNotFound
}

// TestPlaceMarketDoesNotReportRejectedOrderAsSubmitted closes the second half
// of P0-6: the broker refusing the order is only useful if placeMarket keeps
// that verdict. orderLanded finds the id at the broker — the order did reach
// it — but nothing was bought, so Submitted must stay false and the engine
// must not resend blindly.
func TestPlaceMarketDoesNotReportRejectedOrderAsSubmitted(t *testing.T) {
	for _, status := range []string{"REJECTED", "CANCELLED"} {
		t.Run(status, func(t *testing.T) {
			bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
			_, e, _ := testEngine(t, bars)
			br := &rejectingBroker{status: status}
			res, err := e.placeMarket("AAPL", "BUY", 1, PlaceMarketCfg{}, br)
			if err != nil {
				t.Fatalf("a broker rejection is not a transport error: %v", err)
			}
			if res.Submitted {
				t.Fatalf("a %s order must not be reported as submitted: %+v", status, res)
			}
			if res.Ambiguous {
				t.Fatalf("a definite %s is not ambiguous: %+v", status, res)
			}
			if res.Status != NormalizeOrderStatus(status) {
				t.Fatalf("status must survive to the caller, got %q", res.Status)
			}
			if res.Error == "" {
				t.Fatal("a rejected order must carry a reason")
			}
			if len(br.placed) != 1 {
				t.Fatalf("a rejected order must not be resent, got %d placements", len(br.placed))
			}
			if !hasAutotradeLog(t, e, "order_rejected_by_broker") {
				t.Fatal("the rejection must be logged as such")
			}
			// The order never went out, so nothing may be tracked for it.
			e.startTracking(res, orderMeta{Symbol: "AAPL", Quantity: 1})
			if got := e.DB.GetOrderTracker(fmt.Sprint(res.ClientOrderID)); got != nil {
				t.Fatalf("a rejected order must not start a tracker: %v", got)
			}
		})
	}
}
