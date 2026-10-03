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
