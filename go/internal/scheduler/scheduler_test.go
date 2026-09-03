package scheduler

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/live"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

func TestMain(m *testing.M) {
	live.FastTrackers = true
	os.Exit(m.Run())
}

func TestComputedFloatingHolidaysAreNotTradingDays(t *testing.T) {
	// tradingHours present used to skip the computed NYSE calendar entirely.
	cal := Calendar{}
	cal.TradingHours.Normal.End = "16:00"
	cases := []struct {
		y, m, d, dow int
		name         string
	}{
		{2026, 1, 19, 1, "MLK"},
		{2026, 2, 16, 1, "Presidents"},
		{2026, 4, 3, 5, "Good Friday"},
		{2026, 5, 25, 1, "Memorial"},
		{2026, 7, 3, 5, "Independence observed"},
		{2026, 9, 7, 1, "Labor"},
		{2026, 11, 26, 4, "Thanksgiving"},
		{2025, 1, 20, 1, "MLK 2025"},
		{2025, 11, 27, 4, "Thanksgiving 2025"},
		{2024, 1, 15, 1, "MLK 2024"},
		{2024, 11, 28, 4, "Thanksgiving 2024"},
	}
	for _, c := range cases {
		p := tradingdate.NYSEParts{Year: c.y, Month: c.m, Day: c.d, DayOfWeek: c.dow}
		if IsTradingDay(p, cal) {
			t.Errorf("%s %04d-%02d-%02d must not be a trading day", c.name, c.y, c.m, c.d)
		}
	}
	tue := tradingdate.NYSEParts{Year: 2026, Month: 1, Day: 20, DayOfWeek: 2}
	if !IsTradingDay(tue, cal) {
		t.Fatal("2026-01-20 should trade")
	}
}

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

func TestTickSkipsComputedMLKEvenWithEmptyHolidayMap(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cal := map[string]any{
		"holidays":     map[string]any{},
		"tradingHours": map[string]any{"normal": map[string]any{"start": "09:30", "end": "16:00"}},
	}
	raw, _ := json.Marshal(cal)
	if err := db.SaveCalendar(raw); err != nil {
		t.Fatal(err)
	}
	// 2026-01-19 20:00 UTC = 15:00 ET, MLK Monday
	now := time.Date(2026, 1, 19, 20, 0, 0, 0, time.UTC)
	var logs []JobLog
	RunTick(db, Deps{}, now, func(j JobLog) { logs = append(logs, j) })
	sawSkip := false
	for _, j := range logs {
		if j.Name == "market-jobs" && j.Skipped {
			sawSkip = true
		}
		if j.Name == "telegram-aggregation" || j.Name == "price-actualization" {
			t.Fatalf("market job ran on computed MLK: %+v", j)
		}
	}
	if !sawSkip {
		t.Fatalf("expected skip on MLK, logs=%+v", logs)
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
	d1, skip1 := RunTokenHealth(db, Deps{}, today, now)
	d2, skip2 := RunTokenHealth(db, Deps{}, today, now)
	if skip1 || d1 == "already-ran" {
		t.Fatalf("first run should execute, got skip=%v %s", skip1, d1)
	}
	if !skip2 || d2 != "already-ran" {
		t.Fatalf("second run should skip, got skip=%v %s", skip2, d2)
	}
}

func TestTokenHealthCallsCheckToken(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.SaveWebullToken("live-token", "", "PENDING"); err != nil {
		t.Fatal(err)
	}
	br := &live.MemoryBroker{}
	eng := live.New(db, nil)
	eng.Broker = br
	now := time.Date(2026, 9, 1, 15, 0, 0, 0, time.UTC)
	today := tradingdate.TodayNYSE(now)
	status, skip := RunTokenHealth(db, Deps{Live: eng}, today, now)
	if skip || status != "NORMAL" {
		t.Fatalf("want NORMAL check, got skip=%v status=%s", skip, status)
	}
	row := db.GetWebullToken()
	if row.LastCheckStatus != "NORMAL" {
		t.Fatalf("stored status %q", row.LastCheckStatus)
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
	if len(tg.Sent()) == 0 {
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
	eng.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})
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
	if len(tg.Sent()) == 0 {
		t.Fatal("T-1 must send a telegram")
	}
	text := tg.Sent()[0][1]
	if strings.Contains(text, "11m") || strings.Contains(text, "ENTRY:") {
		t.Fatalf("T-1 sent T-11 overview:\n%s", text)
	}
	if !strings.Contains(text, "1 минута до закрытия") {
		t.Fatalf("T-1 must send the decision message:\n%s", text)
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

func t1Engine(t *testing.T) (*store.DB, *live.Engine, *live.MemoryBroker, *live.MemoryTelegram) {
	t.Helper()
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
	eng.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})
	return db, eng, br, tg
}

func TestTickT1SecondTickDoesNotPlace(t *testing.T) {
	db, eng, br, tg := t1Engine(t)
	now1 := time.Date(2026, 9, 1, 19, 59, 0, 0, time.UTC) // 15:59 ET, until=1
	now2 := time.Date(2026, 9, 1, 19, 59, 20, 0, time.UTC)
	RunTick(db, Deps{Live: eng}, now1, func(JobLog) {})
	RunTick(db, Deps{Live: eng}, now2, func(JobLog) {})
	if len(br.Orders) != 1 {
		t.Fatalf("second T-1 tick must not place, orders=%+v", br.Orders)
	}
	if len(tg.Sent()) != 1 {
		t.Fatalf("T-1 telegram must send once, got %d %+v", len(tg.Sent()), tg.Sent())
	}
	eng2 := live.New(db, eng.Quotes)
	eng2.Telegram = tg
	eng2.Broker = br
	eng2.ChatID = "c"
	now3 := time.Date(2026, 9, 1, 19, 59, 40, 0, time.UTC)
	RunTick(db, Deps{Live: eng2}, now3, func(JobLog) {})
	if len(br.Orders) != 1 {
		t.Fatalf("lock must survive new engine, orders=%+v", br.Orders)
	}
}

func TestTickT1Until2DoesNotPlace(t *testing.T) {
	db, eng, br, _ := t1Engine(t)
	now := time.Date(2026, 9, 1, 19, 58, 0, 0, time.UTC) // 15:58 ET, until=2 → Node wrong_time
	RunTick(db, Deps{Live: eng}, now, func(JobLog) {})
	if len(br.Orders) != 0 {
		t.Fatalf("until=2 must not place, orders=%+v", br.Orders)
	}
}

func TestTickT11SecondTickDoesNotResend(t *testing.T) {
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
	now1 := time.Date(2026, 9, 1, 19, 49, 0, 0, time.UTC) // 15:49 ET, until=11
	now2 := time.Date(2026, 9, 1, 19, 49, 20, 0, time.UTC)
	RunTick(db, Deps{Live: eng}, now1, func(JobLog) {})
	RunTick(db, Deps{Live: eng}, now2, func(JobLog) {})
	if len(tg.Sent()) != 1 {
		t.Fatalf("T-11 must send once, got %d %+v", len(tg.Sent()), tg.Sent())
	}
}
