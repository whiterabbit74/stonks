package live

import (
	"path/filepath"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
)

// AUD-002: an unreadable watchlist used to be reported as an empty universe,
// which reads like a normal "no tickers met the threshold" day, and left the
// per-symbol thresholds silently replaced by the global defaults.
func TestAUD002UnreadableWatchlistIsNotEmptyUniverse(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.1, "highIBS": 0.75}); err != nil {
		t.Fatal(err)
	}
	e := New(db, &MemoryQuotes{})
	if got := e.Evaluate().Decision["reason"]; got == "watchlist_unavailable" {
		t.Fatalf("healthy watchlist must not report watchlist_unavailable, got %v", got)
	}
	if _, err := db.SQL.Exec(`DROP TABLE telegram_watches`); err != nil {
		t.Fatal(err)
	}
	ev := e.Evaluate()
	if got := ev.Decision["reason"]; got != "watchlist_unavailable" {
		t.Fatalf("unreadable watchlist reason = %v, want watchlist_unavailable", got)
	}
	if got := ev.Decision["action"]; got != "none" {
		t.Fatalf("unreadable watchlist must not act, action=%v", got)
	}
}

// AUD-002: an unreadable or corrupt calendar used to yield the 16:00 default
// with no error, so the execution window and the T-1 retry budget were built
// on a close nobody confirmed — three hours late on a short day.
func TestAUD002UnknownCloseIsFailClosed(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := New(db, &MemoryQuotes{})
	now := time.Date(2026, 9, 1, 19, 50, 0, 0, time.UTC) // 15:50 ET
	e.Now = func() time.Time { return now }

	cfg := map[string]any{"executionWindowSeconds": 900.0}
	if _, _, err := e.sessionCloseMin(); err != nil {
		t.Fatalf("healthy calendar must read: %v", err)
	}
	if e.outsideExecutionWindow(cfg) {
		t.Fatal("10 minutes before a 16:00 close is inside a 900s window")
	}
	if d := e.t1Deadline(0); !d.After(now) {
		t.Fatalf("healthy calendar must leave retry budget, deadline=%v now=%v", d, now)
	}

	if _, err := db.SQL.Exec(`DROP TABLE calendar`); err != nil {
		t.Fatal(err)
	}
	if _, _, err := e.sessionCloseMin(); err == nil {
		t.Fatal("unreadable calendar must report an error, not the 16:00 default")
	}
	if !e.outsideExecutionWindow(cfg) {
		t.Fatal("unknown close must block the execution window, not assume 16:00")
	}
	if d := e.t1Deadline(0); d.After(now) {
		t.Fatalf("unknown close must grant no retry budget, deadline=%v now=%v", d, now)
	}
}
