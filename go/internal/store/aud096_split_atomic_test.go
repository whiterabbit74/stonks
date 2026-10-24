package store

import (
	"path/filepath"
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-096/AUD-151: цены и отметка applied писались разными транзакциями,
// поэтому отказ на отметке оставлял уже поделённые цены, и повтор делил их ещё раз.
func TestApplyPendingSplitsIsAtomic(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	raw := []types.OHLC{{Date: "2026-01-01", Open: 100, High: 100, Low: 100, Close: 100}}
	if err := db.SaveDataset("X", "X", "", "", raw, false); err != nil {
		t.Fatal(err)
	}
	if err := db.ReplaceSplits("X", []types.SplitEvent{{Date: "2026-01-02", Factor: 2}}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.SQL.Exec(`CREATE TRIGGER no_apply BEFORE UPDATE OF applied ON splits BEGIN SELECT RAISE(ABORT, 'no'); END;`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ApplyPendingSplits("X"); err == nil {
		t.Fatal("rejected applied mark must fail the whole write")
	}
	ds, err := db.GetDataset("X")
	if err != nil {
		t.Fatal(err)
	}
	bars := ds["data"].([]types.OHLC)
	if len(bars) != 1 || bars[0].Close != 100 {
		t.Fatalf("prices must roll back with the mark: %+v", bars)
	}
	pending, err := db.ListPendingSplits("X")
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 1 {
		t.Fatalf("split must stay pending, got %+v", pending)
	}
}

// AUD-097: импорт сырых цен поверх пересчитанного датасета оставлял старые
// отметки applied, и следующий расчёт не применял сплит.
func TestSaveRawDatasetResetsAppliedMarks(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.ReplaceSplits("X", []types.SplitEvent{{Date: "2026-01-02", Factor: 2}}); err != nil {
		t.Fatal(err)
	}
	if err := db.MarkSplitsApplied("X"); err != nil {
		t.Fatal(err)
	}
	raw := []types.OHLC{{Date: "2026-01-01", Open: 100, High: 100, Low: 100, Close: 100}}
	if err := db.SaveDataset("X", "X", "", "", raw, false); err != nil {
		t.Fatal(err)
	}
	pending, err := db.ListPendingSplits("X")
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 1 {
		t.Fatalf("raw prices carry no split, want it pending, got %+v", pending)
	}
}

// AUD-150: the import wrote prices, events and the applied mark separately; a
// failure after the prices left adjusted bars with a pending split.
func TestSaveImportIsAtomic(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	raw := []types.OHLC{{Date: "2026-01-01", Open: 100, High: 100, Low: 100, Close: 100}}
	if err := db.SaveDataset("X", "X", "", "", raw, false); err != nil {
		t.Fatal(err)
	}
	if err := db.ReplaceSplits("X", []types.SplitEvent{{Date: "2026-01-02", Factor: 2}}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.SQL.Exec(`CREATE TRIGGER no_apply BEFORE UPDATE OF applied ON splits BEGIN SELECT RAISE(ABORT, 'no'); END;`); err != nil {
		t.Fatal(err)
	}
	half := []types.OHLC{{Date: "2026-01-01", Open: 50, High: 50, Low: 50, Close: 50}}
	if err := db.SaveImport("X", "X", "", "", half, true, nil, true); err == nil {
		t.Fatal("rejected applied mark must fail the whole import")
	}
	ds, err := db.GetDataset("X")
	if err != nil {
		t.Fatal(err)
	}
	if bars := ds["data"].([]types.OHLC); len(bars) != 1 || bars[0].Close != 100 {
		t.Fatalf("prices must roll back with the mark: %+v", bars)
	}
	if _, err := db.SQL.Exec(`DROP TRIGGER no_apply`); err != nil {
		t.Fatal(err)
	}
	if err := db.SaveImport("X", "X", "", "", half, true, nil, true); err != nil {
		t.Fatal(err)
	}
	if p, _ := db.ListPendingSplits("X"); len(p) != 0 {
		t.Fatalf("stated-adjusted import must mark the split applied, pending %+v", p)
	}
}
