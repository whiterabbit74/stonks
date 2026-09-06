package live

import (
	"path/filepath"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
)

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
