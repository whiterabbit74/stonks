package scheduler

import (
	"path/filepath"
	"testing"
	"time"

	"mktorder.com/go/internal/live"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

// AUD-016: an unparseable calendar is not an empty calendar either. The blob
// read fine, so the tick used to see zero holidays and run T-11/T-1 on a
// computed session — on a day the exchange may well be closed.
func TestAUD016CorruptCalendarSkipsMarketJobs(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.1, "highIBS": 0.75})
	tg := &live.MemoryTelegram{}
	eng := live.New(db, &live.MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}})
	eng.Telegram = tg
	eng.ChatID = "c"
	if err := db.SaveCalendar([]byte("not json at all")); err != nil {
		t.Fatal(err)
	}
	if _, err := db.GetCalendar(); err != nil {
		t.Fatal("the blob must read fine for this test to mean anything")
	}
	now := time.Date(2026, 9, 1, 19, 59, 0, 0, time.UTC) // 15:59 ET, T-1
	var logs []JobLog
	RunTick(db, Deps{Live: eng}, now, func(j JobLog) { logs = append(logs, j) })
	skipped := false
	for _, j := range logs {
		if j.Name == "market-jobs" && j.Skipped && j.Detail == "calendar-read-failed" {
			skipped = true
		}
		if j.Name == "telegram-aggregation" && !j.Skipped {
			t.Fatalf("unparseable calendar must not run T-1: %+v", j)
		}
	}
	if !skipped {
		t.Fatalf("unparseable calendar must skip market jobs, logs=%+v", logs)
	}
}
