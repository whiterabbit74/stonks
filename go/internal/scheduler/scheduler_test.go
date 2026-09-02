package scheduler

import (
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"mktorder.com/go/internal/live"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

func TestHolidayIsNotTradingDay(t *testing.T) {
	cal := Calendar{Holidays: map[string]map[string]any{
		"2026": {"07-03": map[string]any{"name": "Independence Day"}},
	}}
	fri := tradingdate.NYSEParts{Year: 2026, Month: 7, Day: 3, DayOfWeek: 5}
	if IsTradingDay(fri, cal) {
		t.Fatal("holiday Friday must not be a trading day")
	}
	thu := tradingdate.NYSEParts{Year: 2026, Month: 7, Day: 2, DayOfWeek: 4}
	if !IsTradingDay(thu, cal) {
		t.Fatal("Thursday should trade")
	}
}

func TestShortSessionClose(t *testing.T) {
	cal := Calendar{ShortDays: map[string]map[string]any{
		"2026": {"11-27": map[string]any{"name": "Thanksgiving Friday"}},
	}}
	cal.TradingHours.Normal.End = "16:00"
	cal.TradingHours.Short.End = "13:00"
	p := tradingdate.NYSEParts{Year: 2026, Month: 11, Day: 27, DayOfWeek: 5}
	sess := TradingSession(p, cal)
	if !sess.Short || sess.CloseMin != 13*60 {
		t.Fatalf("short session %+v", sess)
	}
}

func TestTickSkipsHolidayMarketJobs(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cal := map[string]any{
		"holidays":     map[string]any{"2026": map[string]any{"07-03": map[string]any{"name": "X"}}},
		"tradingHours": map[string]any{"normal": map[string]any{"start": "09:30", "end": "16:00"}, "short": map[string]any{"start": "09:30", "end": "13:00"}},
	}
	raw, _ := json.Marshal(cal)
	if err := db.SaveCalendar(raw); err != nil {
		t.Fatal(err)
	}
	// 2026-07-03 20:00 UTC = 16:00 ET on a Friday holiday
	now := time.Date(2026, 7, 3, 20, 0, 0, 0, time.UTC)
	var logs []JobLog
	RunTick(db, Deps{}, now, func(j JobLog) { logs = append(logs, j) })
	sawSkip := false
	for _, j := range logs {
		if j.Name == "market-jobs" && j.Skipped {
			sawSkip = true
		}
		if j.Name == "telegram-aggregation" || j.Name == "price-actualization" {
			t.Fatalf("market job ran on holiday: %+v", j)
		}
	}
	if !sawSkip {
		t.Fatalf("expected market-jobs skip, logs=%+v", logs)
	}
}

func TestTokenHealthDedupesPerETDay(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	now := time.Date(2026, 9, 1, 15, 0, 0, 0, time.UTC)
	today := tradingdate.TodayNYSE(now)
	d1, skip1 := RunTokenHealth(db, today, now)
	d2, skip2 := RunTokenHealth(db, today, now)
	if skip1 || d1 == "already-ran" {
		t.Fatalf("first run should execute, got skip=%v %s", skip1, d1)
	}
	if !skip2 || d2 != "already-ran" {
		t.Fatalf("second run should skip, got skip=%v %s", skip2, d2)
	}
}

func TestTelegramAggregationUsesLocalIBS(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{
		{Date: "2024-01-02", Open: 10, High: 12, Low: 8, Close: 8.1, Volume: 1},
	}
	if err := db.SaveDataset("AAPL", "AAPL", "", "", bars, false); err != nil {
		t.Fatal(err)
	}
	if err := db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.1, "highIBS": 0.75}); err != nil {
		t.Fatal(err)
	}
	n := RunTelegramAggregation(db, Deps{}, 11)
	if n != 1 {
		t.Fatalf("watches processed %d", n)
	}
}

func TestTickDoesNotPanic(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	var logs []JobLog
	RunTick(db, Deps{}, time.Date(2026, 9, 1, 20, 0, 0, 0, time.UTC), func(j JobLog) { logs = append(logs, j) })
	if len(logs) == 0 {
		t.Fatal("expected at least token-health event")
	}
}

func TestTickT11RunsAggregation(t *testing.T) {
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
	now := time.Date(2026, 9, 1, 19, 49, 0, 0, time.UTC) // 15:49 ET
	var logs []JobLog
	RunTick(db, Deps{Live: eng}, now, func(j JobLog) { logs = append(logs, j) })
	saw := false
	for _, j := range logs {
		if j.Name == "telegram-aggregation" && !j.Skipped {
			saw = true
		}
	}
	if !saw {
		t.Fatalf("expected T-11 aggregation, logs=%+v", logs)
	}
	if len(tg.Messages) == 0 {
		t.Fatal("expected telegram send")
	}
}

func TestTickT1Executes(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.9})
	tg := &live.MemoryTelegram{}
	br := &live.MemoryBroker{}
	eng := live.New(db, &live.MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}})
	eng.Telegram = tg
	eng.Broker = br
	eng.ChatID = "c"
	eng.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "entrySizingMode": "quantity", "fixedQuantity": 1})
	now := time.Date(2026, 9, 1, 19, 59, 0, 0, time.UTC) // 15:59 ET
	var logs []JobLog
	RunTick(db, Deps{Live: eng}, now, func(j JobLog) { logs = append(logs, j) })
	saw := false
	for _, j := range logs {
		if j.Name == "telegram-aggregation" && !j.Skipped {
			saw = true
		}
	}
	if !saw {
		t.Fatalf("expected T-1 aggregation, logs=%+v", logs)
	}
	if len(br.Orders) != 1 {
		t.Fatalf("T-1 must place, orders=%+v logs=%+v", br.Orders, logs)
	}
}

func TestTickAfterCloseWritesOHLC(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	old := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	fresh := []types.OHLC{
		{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1},
		{Date: "2026-09-02", Open: 8, High: 9, Low: 7, Close: 8.5, Volume: 1},
	}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", old, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL"})
	q := &live.MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": fresh}}
	eng := live.New(db, q)
	eng.Telegram = &live.MemoryTelegram{}
	now := time.Date(2026, 9, 1, 20, 20, 0, 0, time.UTC) // 16:20 ET, 20 min after close
	var logs []JobLog
	RunTick(db, Deps{Live: eng}, now, func(j JobLog) { logs = append(logs, j) })
	saw := false
	for _, j := range logs {
		if j.Name == "price-actualization" && !j.Skipped {
			saw = true
		}
	}
	if !saw {
		t.Fatalf("expected actualization, logs=%+v", logs)
	}
	bars, _, _ := db.GetOHLC("AAPL")
	if len(bars) < 2 {
		t.Fatalf("expected merged OHLC, got %d", len(bars))
	}
}
