package store

import (
	"path/filepath"
	"testing"
)

// AUD-164: ClosePosition took 2026-02-30 or a date before the entry and closed
// the row with a one-day hold.
func TestClosePositionRejectsBadExitDate(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.SavePosition(Position{ID: "p", Symbol: "MSFT", Status: "open", EntryDate: "2026-02-10", EntryPrice: Ptr[float64](100), Quantity: 1}); err != nil {
		t.Fatal(err)
	}
	for _, d := range []string{"2026-02-30", "завтра", "2026-02-09"} {
		if _, err := db.ClosePosition("p", PositionExit{Date: d, Price: 110}); err == nil {
			t.Fatalf("exit date %q accepted", d)
		}
	}
	if _, err := db.ClosePosition("p", PositionExit{Date: "2026-02-11", Price: 110}); err != nil {
		t.Fatal(err)
	}
}
