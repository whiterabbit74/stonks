package store

import (
	"path/filepath"
	"testing"

	"mktorder.com/go/internal/types"
)

func TestDeleteDatasetRemovesSplits(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.SaveDataset("AAPL", "AAPL", "", "", []types.OHLC{{Date: "2026-01-01", Open: 1, High: 1, Low: 1, Close: 1}}, false); err != nil {
		t.Fatal(err)
	}
	if err := db.ReplaceSplits("AAPL", []types.SplitEvent{{Date: "2024-01-02", Factor: 2}}); err != nil {
		t.Fatal(err)
	}
	if err := db.DeleteDataset("AAPL"); err != nil {
		t.Fatal(err)
	}
	got, err := db.ListSplits("AAPL")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("splits survived delete: %+v", got)
	}
}

func TestTakeRobinhoodPendingRejectsUnparseableCreated(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := db.SQL.Exec(`INSERT INTO robinhood_oauth_pending (state, code_verifier, redirect_uri, created_at) VALUES ('st','ver','http://x','not-a-time')`); err != nil {
		t.Fatal(err)
	}
	if _, _, err := db.TakeRobinhoodPending("st"); err == nil {
		t.Fatal("unparseable created_at must expire the state")
	}
}

// Rewriting or re-sending the split list must not turn events the prices
// already carry back into pending ones — that would back-adjust them twice.
// A changed factor is a different correction and does become pending.
func TestSplitListRewriteKeepsTheAppliedMark(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.ReplaceSplits("AAPL", []types.SplitEvent{{Date: "2024-01-04", Factor: 2}}); err != nil {
		t.Fatal(err)
	}
	if err := db.MarkSplitsApplied("AAPL"); err != nil {
		t.Fatal(err)
	}

	// Same event plus a new one, as the splits tab saves the whole list.
	if err := db.ReplaceSplits("AAPL", []types.SplitEvent{
		{Date: "2024-01-04", Factor: 2},
		{Date: "2024-06-10", Factor: 4},
	}); err != nil {
		t.Fatal(err)
	}
	pending, err := db.ListPendingSplits("AAPL")
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 1 || pending[0].Date != "2024-06-10" {
		t.Fatalf("pending after rewrite = %v, want only the new event", pending)
	}

	// A corrected factor is a correction the prices do not carry.
	if err := db.UpsertSplits("AAPL", []types.SplitEvent{{Date: "2024-01-04", Factor: 3}}); err != nil {
		t.Fatal(err)
	}
	if pending, err = db.ListPendingSplits("AAPL"); err != nil {
		t.Fatal(err)
	}
	if len(pending) != 2 {
		t.Fatalf("pending after factor change = %v, want both events", pending)
	}
}
