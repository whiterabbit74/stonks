package live

import (
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
)

func partialExitEngine(t *testing.T, withPosition bool) (*Engine, *store.DB, *MemoryTelegram, store.Tracker) {
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
			EntryPrice: store.Ptr(10.0), Quantity: 10, IsTest: true, // lives by its fills
			Webull: store.BrokerLeg{Qty: 10, EntryPrice: store.Ptr(10.0)},
		}); err != nil {
			t.Fatal(err)
		}
	}
	tracker := store.Tracker{
		ClientOrderID: "x-exit", Symbol: "AAPL", Action: "exit", Status: "submitted",
		Quantity: 10.0, Source: "telegram_t1", DateKey: "2026-09-01", Broker: "webull",
		CorrelationID: "corr", DecisionIBS: store.Ptr(0.8),
	}
	if err := db.SaveOrderTracker(tracker); err != nil {
		t.Fatal(err)
	}
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
	if got := fmt.Sprint(db.GetOrderTracker("x-exit").Status); got != "cancelled" {
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

// A partial sell in nobody's leg is a leftover, not a position's exit: it is
// logged with what it got and raises no alarm (invariant K.4).
func TestPartialExitWithoutPositionIsALeftover(t *testing.T) {
	e, _, tg, tracker := partialExitEngine(t, false)
	e.finalizeTrackerStatus(tracker, map[string]any{"status": "CANCELLED", "filled_qty": 4.0, "filled_price": 11.0}, "cancelled")
	for _, m := range tg.Messages {
		if strings.Contains(m[1], "без открытой позиции") {
			t.Fatalf("a leftover sale is no alarm: %v", m)
		}
	}
	if !hasAutotradeLog(t, e, "leftover_sold") {
		t.Fatal("the leftover sale must be logged")
	}
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
	if got := fmt.Sprint(db.GetOrderTracker("x-exit").Status); got != "submitted" {
		t.Fatalf("tracker went %s over an unrecorded fill", got)
	}
	if _, err := db.SQL.Exec(`DROP TRIGGER fail`); err != nil {
		t.Fatal(err)
	}
	e.finalizeTrackerStatus(tracker, detail, "cancelled")
	if closedPart(t, db).Quantity != 4 || fmt.Sprint(db.GetOrderTracker("x-exit").Status) != "cancelled" {
		t.Fatal("retry did not journal the fill")
	}
}
