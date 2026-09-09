package live

import (
	"fmt"
	"mktorder.com/go/internal/store"
	"testing"

	"mktorder.com/go/internal/types"
)

func TestUpdatePositionsKeepsEveryOpenWatch(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, _ := testEngine(t, bars)
	if err := db.UpsertWatch(map[string]any{"symbol": "MSFT", "lowIBS": 0.1, "highIBS": 0.75}); err != nil {
		t.Fatal(err)
	}
	if err := db.SavePosition(store.Position{ID: "t-aapl", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-01", EntryPrice: store.Ptr[float64](10.0)}); err != nil {
		t.Fatal(err)
	}
	if err := db.SavePosition(store.Position{ID: "t-msft", Symbol: "MSFT", Status: "open", EntryDate: "2026-08-02", EntryPrice: store.Ptr[float64](20.0)}); err != nil {
		t.Fatal(err)
	}
	_ = e.UpdatePositions()
	watches, err := db.ListWatches()
	if err != nil {
		t.Fatal(err)
	}
	open := map[string]bool{}
	for _, w := range watches {
		if b, _ := w["isOpenPosition"].(bool); b {
			open[fmt.Sprint(w["symbol"])] = true
		}
	}
	if !open["AAPL"] || !open["MSFT"] {
		t.Fatalf("both open monitor trades must stay flagged, got %v", open)
	}
}
