package store

import (
	"path/filepath"
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-146: changing or deleting an applied split reset its mark, and the next
// calculation divided the already divided prices by the new factor.
func TestAppliedSplitEditRebasesPrices(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	closeOf := func() float64 {
		t.Helper()
		ds, err := db.GetDataset("X")
		if err != nil {
			t.Fatal(err)
		}
		return ds["data"].([]types.OHLC)[0].Close
	}
	pending := func() int {
		t.Helper()
		p, err := db.ListPendingSplits("X")
		if err != nil {
			t.Fatal(err)
		}
		return len(p)
	}
	// Raw 120 before the 2026-01-02 split, applied with factor 2 → 60.
	half := []types.OHLC{
		{Date: "2026-01-01", Open: 60, High: 60, Low: 60, Close: 60, Volume: 200},
		{Date: "2026-01-02", Open: 60, High: 60, Low: 60, Close: 60, Volume: 100},
	}
	if err := db.ReplaceSplits("X", []types.SplitEvent{{Date: "2026-01-02", Factor: 2}}); err != nil {
		t.Fatal(err)
	}
	if err := db.SaveDatasetWithSplitsApplied("X", "X", "", "", half, []string{"2026-01-02"}); err != nil {
		t.Fatal(err)
	}

	if err := db.UpsertSplits("X", []types.SplitEvent{{Date: "2026-01-02", Factor: 3}}); err != nil {
		t.Fatal(err)
	}
	if c := closeOf(); c != 40 || pending() != 0 {
		t.Fatalf("upsert to 3: close %v pending %d, want 40 and 0", c, pending())
	}
	if err := db.ReplaceSplits("X", []types.SplitEvent{{Date: "2026-01-02", Factor: 4}}); err != nil {
		t.Fatal(err)
	}
	if c := closeOf(); c != 30 || pending() != 0 {
		t.Fatalf("replace to 4: close %v pending %d, want 30 and 0", c, pending())
	}
	if err := db.DeleteSplit("X", "2026-01-02"); err != nil {
		t.Fatal(err)
	}
	if c := closeOf(); c != 120 {
		t.Fatalf("delete: close %v, want raw 120", c)
	}
	ds, _ := db.GetDataset("X")
	if v := ds["data"].([]types.OHLC)[0].Volume; v != 100 {
		t.Fatalf("delete: volume %v, want raw 100", v)
	}
}
