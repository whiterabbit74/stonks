package live

import (
	"context"
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

func (b *rejectingBroker) PlaceMarket(ctx context.Context, symbol, side string, qty float64, cfg PlaceMarketCfg) (OrderResult, error) {
	b.placed = append(b.placed, cfg.ClientOrderID)
	return OrderResult{
		ClientOrderID: cfg.ClientOrderID, Symbol: symbol, Side: side, Quantity: qty,
		Status: "rejected", Error: "order rejected by broker",
	}, nil
}

func (b *rejectingBroker) CloseMarket(context.Context, string) (OrderResult, error) {
	return OrderResult{}, nil
}
func (b *rejectingBroker) Account(ctx context.Context) (map[string]any, error) {
	return map[string]any{}, nil
}
func (b *rejectingBroker) Positions(ctx context.Context) ([]any, error)  { return nil, nil }
func (b *rejectingBroker) OpenOrders(ctx context.Context) ([]any, error) { return nil, nil }
func (b *rejectingBroker) OrderHistory(context.Context, string, string) ([]any, error) {
	return nil, nil
}
func (b *rejectingBroker) CancelOrder(context.Context, string) error { return nil }
func (b *rejectingBroker) OrderDetail(ctx context.Context, clientOrderID string) (map[string]any, error) {
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
			res, err := e.placeMarket(backgroundWindow(), "AAPL", "BUY", 1, PlaceMarketCfg{}, br, orderMeta{})
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
			// Намерение записывается до отправки (CORE-08), поэтому строка
			// заявки существует — но она обязана быть терминальной: ничего не
			// опрашивается и следующий вход не блокируется.
			e.startTracking(res, orderMeta{Symbol: "AAPL", Quantity: 1})
			got := e.DB.GetOrderTracker(fmt.Sprint(res.ClientOrderID))
			if got == nil {
				t.Fatal("the pre-send intent must survive as an audit trail")
			}
			if st := fmt.Sprint(got["status"]); !IsFinalOrderStatus(st) {
				t.Fatalf("a rejected order must leave a terminal tracker, got %q", st)
			}
			pending, err := e.DB.ListPendingTrackers()
			if err != nil {
				t.Fatal(err)
			}
			if len(pending) != 0 {
				t.Fatalf("a rejected order must not stay pending: %+v", pending)
			}
		})
	}
}
