package scheduler

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/live"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

// AUD-002: a failed calendar read used to be indistinguishable from an empty
// calendar. The computed fallback then declared a normal 16:00 session and the
// T-11/T-1 jobs ran on a schedule nobody confirmed. The tick must skip the
// market jobs and alert instead.
func TestAUD002CalendarReadFailureSkipsMarketJobs(t *testing.T) {
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
	if _, err := db.SQL.Exec(`DROP TABLE calendar`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.GetCalendar(); err == nil {
		t.Fatal("GetCalendar must fail once the table is gone")
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
			t.Fatalf("unreadable calendar must not run T-1: %+v", j)
		}
	}
	if !skipped {
		t.Fatalf("unreadable calendar must skip market jobs, logs=%+v", logs)
	}
	if telegramTextContaining(tg, "Календарь биржи недоступен") == "" {
		t.Fatalf("unreadable calendar must alert, messages=%v", tg.Sent())
	}
	n := len(tg.Sent())
	RunTick(db, Deps{Live: eng}, now.Add(20*time.Second), func(JobLog) {})
	if len(tg.Sent()) != n {
		t.Fatalf("calendar alert must send once per day, got %d want %d", len(tg.Sent()), n)
	}
	if s := telegramTextContaining(tg, "Календарь биржи устарел"); s != "" {
		t.Fatalf("read failure must not be reported as expired coverage: %s", strings.TrimSpace(s))
	}
}
