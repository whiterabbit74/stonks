package live

import (
	"fmt"
	"path/filepath"
	"testing"

	"mktorder.com/go/internal/store"
)

// AUD-135: the 64th poll of a partially filled order expired it with no broker
// answer, so the shares it had already bought never reached the journal.
func TestExpiredPollKeepsLastKnownFill(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := New(db, &MemoryQuotes{})
	e.Telegram, e.ChatID, e.Now = &MemoryTelegram{}, "c", nearCloseNow()
	br := &MemoryBroker{Name: "webull"}
	e.Broker = br
	tracker := map[string]any{
		"clientOrderId": "x-buy", "symbol": "AAPL", "action": "entry", "status": "partially_filled",
		"quantity": 10.0, "source": "telegram_t1", "dateKey": "2026-09-01", "broker": "webull",
	}
	if err := db.SaveOrderTracker(tracker); err != nil {
		t.Fatal(err)
	}
	if _, err := db.SQL.Exec(`UPDATE order_trackers SET attempts=63 WHERE client_order_id='x-buy'`); err != nil {
		t.Fatal(err)
	}
	br.SetDetail("x-buy", map[string]any{"status": "PARTIAL_FILLED", "filled_qty": 4.0, "filled_price": 10.0})
	if done, err := e.pollTracker(tracker); !done || err != nil {
		t.Fatalf("poll done=%v err=%v", done, err)
	}
	if got := fmt.Sprint(db.GetOrderTracker("x-buy")["status"]); got != "expired" {
		t.Fatalf("status %s", got)
	}
	p, err := db.OpenPositionBySymbol("AAPL")
	if err != nil || p == nil || p.Webull.Qty != 4 {
		t.Fatalf("executed shares lost: %+v %v", p, err)
	}
}

// AUD-135 (reopened): poll 63 saw 4 of 10 filled, poll 64 failed on the
// network and the tracker expired with no answer at all. The 4 shares were
// known only from the earlier answer, and that answer was not kept.
func TestNetworkErrorAfterPartialFillKeepsShares(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := New(db, &MemoryQuotes{})
	e.Telegram, e.ChatID, e.Now = &MemoryTelegram{}, "c", nearCloseNow()
	br := &MemoryBroker{Name: "webull"}
	e.Broker = br
	tracker := map[string]any{
		"clientOrderId": "x-buy", "symbol": "AAPL", "action": "entry", "status": "submitted",
		"quantity": 10.0, "source": "telegram_t1", "dateKey": "2026-09-01", "broker": "webull",
	}
	if err := db.SaveOrderTracker(tracker); err != nil {
		t.Fatal(err)
	}
	if _, err := db.SQL.Exec(`UPDATE order_trackers SET attempts=62 WHERE client_order_id='x-buy'`); err != nil {
		t.Fatal(err)
	}
	br.SetDetail("x-buy", map[string]any{"status": "PARTIAL_FILLED", "filled_qty": 4.0, "filled_price": 10.0})
	if done, err := e.pollTracker(tracker); done || err != nil {
		t.Fatalf("poll 63: done=%v err=%v", done, err)
	}
	br.FailDetail = fmt.Errorf("connection reset")
	if done, _ := e.pollTracker(tracker); !done {
		t.Fatal("poll 64 must end the tracker")
	}
	if got := fmt.Sprint(db.GetOrderTracker("x-buy")["status"]); got != "expired" {
		t.Fatalf("status %s", got)
	}
	p, err := db.OpenPositionBySymbol("AAPL")
	if err != nil || p == nil || p.Webull.Qty != 4 || p.Webull.EntryPrice == nil || *p.Webull.EntryPrice != 10 {
		t.Fatalf("executed shares lost: %+v %v", p, err)
	}
}

// The same shares on the stale-day path: the broker still calls the order
// working, and expireStaleTrackers ended it with no answer passed along.
func TestStaleDayExpiryKeepsPartialFill(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := New(db, &MemoryQuotes{})
	e.Telegram, e.ChatID, e.Now = &MemoryTelegram{}, "c", nearCloseNow()
	br := &MemoryBroker{Name: "webull"}
	e.Broker = br
	if err := db.SaveOrderTracker(map[string]any{
		"clientOrderId": "x-buy", "symbol": "AAPL", "action": "entry", "status": "partially_filled",
		"quantity": 10.0, "source": "telegram_t1", "dateKey": "2026-08-31", "broker": "webull",
	}); err != nil {
		t.Fatal(err)
	}
	br.SetDetail("x-buy", map[string]any{"status": "PARTIAL_FILLED", "filled_qty": 4.0})
	e.expireStaleTrackers()
	if got := fmt.Sprint(db.GetOrderTracker("x-buy")["status"]); got != "expired" {
		t.Fatalf("status %s", got)
	}
	p, err := db.OpenPositionBySymbol("AAPL")
	if err != nil || p == nil || p.Webull.Qty != 4 || p.Webull.EntryPrice != nil {
		t.Fatalf("stale-day expiry lost the fill: %+v %v", p, err)
	}
}
