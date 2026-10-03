package live

import (
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
)

func partialExitEngine(t *testing.T, withPosition bool) (*Engine, *store.DB, *MemoryTelegram, map[string]any) {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := New(db, &MemoryQuotes{})
	tg := &MemoryTelegram{}
	e.Telegram, e.ChatID = tg, "c"
	// The terminal status lands after midnight in New York: the next session.
	e.Now = func() time.Time { return time.Date(2026, 9, 2, 5, 0, 0, 0, time.UTC) }
	if withPosition {
		if err := db.SavePosition(store.Position{
			ID: "p", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-20",
			EntryPrice: store.Ptr(10.0), Quantity: 10,
			Webull: store.BrokerLeg{Qty: 10, EntryPrice: store.Ptr(10.0)},
		}); err != nil {
			t.Fatal(err)
		}
	}
	tracker := map[string]any{
		"clientOrderId": "x-exit", "symbol": "AAPL", "action": "exit", "status": "submitted",
		"quantity": 10.0, "source": "telegram_t1", "dateKey": "2026-09-01", "broker": "webull",
	}
	if err := db.SaveOrderTracker(tracker); err != nil {
		t.Fatal(err)
	}
	e.orderMeta = map[string]orderMeta{"x-exit": {CorrelationID: "corr", IBS: 0.8, Broker: "webull"}}
	return e, db, tg, tracker
}

func closedPart(t *testing.T, db *store.DB) *store.Position {
	t.Helper()
	rows, err := db.ListPositions()
	if err != nil {
		t.Fatal(err)
	}
	for i := range rows {
		if rows[i].Status == "closed" {
			return &rows[i]
		}
	}
	t.Fatalf("no closed part: %+v", rows)
	return nil
}

// AUD-134: a cancelled partial exit with no price yet was refused by the split
// and the tracker still went final. It is now a closed part at a NULL price.
func TestPartialExitWithoutPriceIsJournaled(t *testing.T) {
	e, db, _, tracker := partialExitEngine(t, true)
	e.finalizeTrackerStatus(tracker, map[string]any{"status": "CANCELLED", "filled_qty": 4.0}, "cancelled")
	part := closedPart(t, db)
	if part.Quantity != 4 || part.ExitPrice != nil || part.PnLAbsolute != nil {
		t.Fatalf("closed part = %+v", part)
	}
	if got := fmt.Sprint(db.GetOrderTracker("x-exit")["status"]); got != "cancelled" {
		t.Fatalf("tracker status = %s", got)
	}
}

// AUD-136: the closed part keeps the decision IBS, the tracker's session date
// and the exit order id.
func TestPartialExitKeepsIBSDateAndOrder(t *testing.T) {
	e, db, _, tracker := partialExitEngine(t, true)
	e.finalizeTrackerStatus(tracker, map[string]any{"status": "CANCELLED", "filled_qty": 4.0, "filled_price": 11.0}, "cancelled")
	part := closedPart(t, db)
	if part.ExitIBS == nil || *part.ExitIBS != 0.8 || part.ExitDate != "2026-09-01" || part.Webull.ExitOrderID != "x-exit" {
		t.Fatalf("closed part = %+v / %+v", part, part.Webull)
	}
}

// AUD-132: a partial exit with nothing to close is said out loud, as a full one.
func TestPartialExitWithoutPositionAlarms(t *testing.T) {
	e, _, tg, tracker := partialExitEngine(t, false)
	e.finalizeTrackerStatus(tracker, map[string]any{"status": "CANCELLED", "filled_qty": 4.0, "filled_price": 11.0}, "cancelled")
	for _, m := range tg.Messages {
		if strings.Contains(m[1], "выход без открытой позиции") {
			return
		}
	}
	t.Fatalf("no alarm: %v", tg.Messages)
}

// AUD-134: a fill the journal failed to take keeps the tracker pending so the
// next poll retries it.
func TestTrackerStaysPendingWhenJournalFails(t *testing.T) {
	e, db, _, tracker := partialExitEngine(t, true)
	if _, err := db.SQL.Exec(`CREATE TRIGGER fail BEFORE INSERT ON positions BEGIN SELECT RAISE(ABORT, 'injected'); END`); err != nil {
		t.Fatal(err)
	}
	detail := map[string]any{"status": "CANCELLED", "filled_qty": 4.0, "filled_price": 11.0}
	e.finalizeTrackerStatus(tracker, detail, "cancelled")
	if got := fmt.Sprint(db.GetOrderTracker("x-exit")["status"]); got != "submitted" {
		t.Fatalf("tracker went %s over an unrecorded fill", got)
	}
	if _, err := db.SQL.Exec(`DROP TRIGGER fail`); err != nil {
		t.Fatal(err)
	}
	e.finalizeTrackerStatus(tracker, detail, "cancelled")
	if closedPart(t, db).Quantity != 4 || fmt.Sprint(db.GetOrderTracker("x-exit")["status"]) != "cancelled" {
		t.Fatal("retry did not journal the fill")
	}
}
