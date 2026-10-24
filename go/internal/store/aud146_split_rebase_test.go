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
	raw := []types.OHLC{
		{Date: "2026-01-01", Open: 120, High: 120, Low: 120, Close: 120, Volume: 100},
		{Date: "2026-01-02", Open: 60, High: 60, Low: 60, Close: 60, Volume: 100},
	}
	if err := db.SaveDataset("X", "X", "", "", raw, false); err != nil {
		t.Fatal(err)
	}
	if err := db.ReplaceSplits("X", []types.SplitEvent{{Date: "2026-01-02", Factor: 2}}); err != nil {
		t.Fatal(err)
	}
	if n, err := db.ApplyPendingSplits("X"); err != nil || n != 1 || closeOf() != 60 {
		t.Fatalf("apply: n %d err %v close %v, want 1 nil 60", n, err, closeOf())
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

// AUD-152: a raw refresh overlap before an applied split overwrote the
// adjusted bars with raw ones while the event stayed applied.
func TestMergeOHLCKeepsAppliedSplitBase(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	raw := []types.OHLC{
		{Date: "2026-01-01", Open: 120, High: 120, Low: 120, Close: 120, Volume: 100},
		{Date: "2026-01-02", Open: 60, High: 60, Low: 60, Close: 60, Volume: 100},
	}
	if err := db.SaveDataset("X", "X", "", "", raw, false); err != nil {
		t.Fatal(err)
	}
	if err := db.ReplaceSplits("X", []types.SplitEvent{{Date: "2026-01-02", Factor: 2}}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ApplyPendingSplits("X"); err != nil {
		t.Fatal(err)
	}
	if err := db.MergeOHLC("X", raw); err != nil {
		t.Fatal(err)
	}
	ds, _ := db.GetDataset("X")
	bars := ds["data"].([]types.OHLC)
	if bars[0].Close != 60 || bars[1].Close != 60 {
		t.Fatalf("merged raw overlap broke the adjusted base: %+v", bars)
	}
}

// AUD-146 (reopened): deleting every event of the ticker left the prices
// divided, and re-adding the same split divided them a second time.
func TestDeleteAllSplitsRestoresPrices(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	raw := []types.OHLC{
		{Date: "2026-01-01", Open: 120, High: 120, Low: 120, Close: 120, Volume: 100},
		{Date: "2026-01-02", Open: 60, High: 60, Low: 60, Close: 60, Volume: 100},
	}
	if err := db.SaveDataset("X", "X", "", "", raw, false); err != nil {
		t.Fatal(err)
	}
	split := []types.SplitEvent{{Date: "2026-01-02", Factor: 2}}
	if err := db.ReplaceSplits("X", split); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ApplyPendingSplits("X"); err != nil {
		t.Fatal(err)
	}
	if err := db.DeleteSplits("X"); err != nil {
		t.Fatal(err)
	}
	ds, _ := db.GetDataset("X")
	if b := ds["data"].([]types.OHLC)[0]; b.Close != 120 || b.Volume != 100 {
		t.Fatalf("delete all: close %v volume %v, want raw 120 and 100", b.Close, b.Volume)
	}
	if err := db.UpsertSplits("X", split); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ApplyPendingSplits("X"); err != nil {
		t.Fatal(err)
	}
	ds, _ = db.GetDataset("X")
	if c := ds["data"].([]types.OHLC)[0].Close; c != 60 {
		t.Fatalf("re-applied split: close %v, want 60", c)
	}
}
