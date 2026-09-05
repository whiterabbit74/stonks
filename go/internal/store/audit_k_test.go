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
