package live

import (
	"path/filepath"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

// The seeded calendar carries shortDays only through 2027. The scheduler falls
// back to the computed early closes for later years, so sessionCloseMin must
// too: it feeds the T-1 deadline and the message header, and a 16:00 answer on
// a 13:00 session drops the whole close-of-session retry budget.
func TestSessionCloseFallsBackToComputedShortDay(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := New(db, &MemoryQuotes{})
	// 2028-11-24: Friday after Thanksgiving, no shortDays entry for 2028.
	at := func(ymd string) time.Time {
		y, m, d := tradingdate.YMD(ymd)
		return time.Date(y, time.Month(m), d, 17, 30, 0, 0, time.UTC) // 12:30 ET
	}
	e.Now = func() time.Time { return at("2028-11-24") }
	closeMin, short, err := e.sessionCloseMin()
	if err != nil {
		t.Fatal(err)
	}
	if !short || closeMin != 13*60 {
		t.Fatalf("computed short day: close=%d short=%v, want 780/true", closeMin, short)
	}
	if d := e.t1Deadline(0); d.After(e.now().Add(31 * time.Minute)) {
		t.Fatalf("a 13:00 close must not grant hours of retry budget: %v", d)
	}

	e.Now = func() time.Time { return at("2028-11-22") } // ordinary Wednesday
	closeMin, short, err = e.sessionCloseMin()
	if err != nil || short || closeMin != 16*60 {
		t.Fatalf("ordinary day: close=%d short=%v err=%v", closeMin, short, err)
	}
}
