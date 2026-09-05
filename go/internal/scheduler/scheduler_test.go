package scheduler

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
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
	// RunTokenHealth surfaces the raw word Webull's CheckToken returned.
	if skip || status != "NORMAL" {
		t.Fatalf("want NORMAL check, got skip=%v status=%s", skip, status)
	}
	row := db.GetWebullToken()
	// P0-4: last_check_status holds the classified verdict CanSubmit gates
	// on (OK/NEEDS_REAUTH/...), never the raw Webull word — that is
	// last_check_raw instead.
	if row.LastCheckStatus != live.HealthOK {
		t.Fatalf("stored status %q, want %q", row.LastCheckStatus, live.HealthOK)
	}
	if row.LastCheckRaw != "NORMAL" {
		t.Fatalf("stored raw %q, want NORMAL", row.LastCheckRaw)
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

func TestTickExpiredCoverageBlocksT1AndExtends(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.9})
	raw, _ := json.Marshal(map[string]any{
		"holidays":     map[string]any{},
		"tradingHours": map[string]any{"normal": map[string]any{"start": "09:30", "end": "16:00"}},
		"metadata":     map[string]any{"webullCoverageThrough": "2026-08-01"},
	})
	if err := db.SaveCalendar(raw); err != nil {
		t.Fatal(err)
	}
	tg := &live.MemoryTelegram{}
	br := &live.MemoryBroker{}
	eng := live.New(db, &live.MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}})
	eng.Telegram = tg
	eng.Broker = br
	eng.ChatID = "c"
	eng.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})
	// The tick runs the token-health job before the T-1 aggregation, and
	// executeAll refuses to submit on a MISSING health status. A test broker
	// still needs a token behind it for the T-1 stage to be reached at all.
	eng.PutToken("t", "2027-01-01T00:00:00Z")
	// T-1 placement is bounded by the session close on the engine's own clock,
	// so the engine has to share the tick's simulated time — a real clock says
	// the close is long past and every attempt is skipped as out of budget.
	eng.Now = func() time.Time { return time.Date(2026, 9, 1, 19, 59, 0, 0, time.UTC) }
	now := time.Date(2026, 9, 1, 19, 59, 0, 0, time.UTC)
	var logs []JobLog
	RunTick(db, Deps{Live: eng}, now, func(j JobLog) { logs = append(logs, j) })
	if len(br.Orders) != 0 {
		t.Fatalf("expired coverage must not T-1 trade: %+v", br.Orders)
	}
	sawExpired, sawExtend, sawAgg := false, false, false
	for _, j := range logs {
		if j.Name == "market-jobs" && j.Detail == "calendar-coverage-expired" {
			sawExpired = true
		}
		if j.Name == "calendar-extend" {
			sawExtend = true
		}
		if j.Name == "telegram-aggregation" && !j.Skipped {
			sawAgg = true
		}
		if j.Name == "price-actualization" && !j.Skipped {
			t.Fatalf("actualize must not run on expired coverage: %+v", j)
		}
	}
	if !sawExpired {
		t.Fatalf("want calendar-coverage-expired, logs=%+v", logs)
	}
	if !sawExtend {
		t.Fatalf("expired coverage must still call calendar-extend, logs=%+v", logs)
	}
	if sawAgg {
		t.Fatalf("T-1 aggregation must not run, logs=%+v", logs)
	}
	alert := false
	for _, m := range tg.Sent() {
		if strings.Contains(m[1], "Календарь истекает") {
			alert = true
		}
	}
	if !alert {
		t.Fatalf("want coverage alert, messages=%v", tg.Sent())
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
	// The tick runs the token-health job before the T-1 aggregation, and
	// executeAll refuses to submit on a MISSING health status. A test broker
	// still needs a token behind it for the T-1 stage to be reached at all.
	eng.PutToken("t", "2027-01-01T00:00:00Z")
	// T-1 placement is bounded by the session close on the engine's own clock,
	// so the engine has to share the tick's simulated time — a real clock says
	// the close is long past and every attempt is skipped as out of budget.
	eng.Now = func() time.Time { return time.Date(2026, 9, 1, 19, 59, 0, 0, time.UTC) }
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
	text := telegramTextContaining(tg, "1 минута до закрытия")
	if text == "" {
		t.Fatalf("T-1 must send the decision message:\n%v", tg.Sent())
	}
	if strings.Contains(text, "11m") || strings.Contains(text, "ENTRY:") {
		t.Fatalf("T-1 sent T-11 overview:\n%s", text)
	}
}

func telegramTextContaining(tg *live.MemoryTelegram, needle string) string {
	for _, m := range tg.Sent() {
		if strings.Contains(m[1], needle) {
			return m[1]
		}
	}
	return ""
}

func TestTickT1RunsBeforePollTrackers(t *testing.T) {
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
	// The tick runs the token-health job before the T-1 aggregation, and
	// executeAll refuses to submit on a MISSING health status. A test broker
	// still needs a token behind it for the T-1 stage to be reached at all.
	eng.PutToken("t", "2027-01-01T00:00:00Z")
	// T-1 placement is bounded by the session close on the engine's own clock,
	// so the engine has to share the tick's simulated time — a real clock says
	// the close is long past and every attempt is skipped as out of budget.
	eng.Now = func() time.Time { return time.Date(2026, 9, 1, 19, 59, 0, 0, time.UTC) }
	live.PollTrackersHook = func() {
		if len(br.Orders) == 0 {
			t.Error("PollTrackers ran before T-1 placed the order")
		}
	}
	t.Cleanup(func() { live.PollTrackersHook = nil })
	now := time.Date(2026, 9, 1, 19, 59, 0, 0, time.UTC)
	var logs []JobLog
	RunTick(db, Deps{Live: eng}, now, func(j JobLog) { logs = append(logs, j) })
	if len(br.Orders) != 1 {
		t.Fatalf("T-1 must still place, orders=%d logs=%+v", len(br.Orders), logs)
	}
}

func TestTickActualizeDisabledBySetting(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL"})
	st := db.Settings()
	st["enablePostClosePriceActualization"] = false
	_ = db.SaveSettings(st)
	eng := live.New(db, &live.MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": {{Date: "2026-09-01", Open: 1, High: 2, Low: 1, Close: 1, Volume: 1}}}})
	now := time.Date(2026, 9, 1, 20, 20, 0, 0, time.UTC)
	var logs []JobLog
	RunTick(db, Deps{Live: eng}, now, func(j JobLog) { logs = append(logs, j) })
	for _, j := range logs {
		if j.Name == "price-actualization" && strings.Contains(j.Detail, "tickers=0") {
			return
		}
	}
	t.Fatalf("disabled actualization should request nothing: %+v", logs)
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
	st := db.Settings()
	st["enablePostClosePriceActualization"] = true
	_ = db.SaveSettings(st)
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
	// The tick runs the token-health job before the T-1 aggregation, and
	// executeAll refuses to submit on a MISSING health status. A test broker
	// still needs a token behind it for the T-1 stage to be reached at all.
	eng.PutToken("t", "2027-01-01T00:00:00Z")
	// T-1 placement is bounded by the session close on the engine's own clock,
	// so the engine has to share the tick's simulated time — a real clock says
	// the close is long past and every attempt is skipped as out of budget.
	eng.Now = func() time.Time { return time.Date(2026, 9, 1, 19, 59, 0, 0, time.UTC) }
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
	nT1 := 0
	for _, m := range tg.Sent() {
		if strings.Contains(m[1], "1 минута до закрытия") {
			nT1++
		}
	}
	if nT1 != 1 {
		t.Fatalf("T-1 telegram must send once, got %d %+v", nT1, tg.Sent())
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

func TestEmptyCalendarUsesComputedShortDay(t *testing.T) {
	cal := Calendar{}
	// 2026-12-24 is Thursday; tradingdate.ShortDayName names it Christmas Eve.
	p := tradingdate.NYSEParts{Year: 2026, Month: 12, Day: 24, DayOfWeek: 4}
	sess := TradingSession(p, cal)
	if !sess.Short || sess.CloseMin != 13*60 {
		t.Fatalf("empty calendar must fall back to computed early close, got %+v", sess)
	}
	thanksEve := tradingdate.NYSEParts{Year: 2026, Month: 11, Day: 25, DayOfWeek: 3}
	if !IsShortDay(thanksEve, cal) {
		t.Fatal("Thanksgiving Eve must be a computed short day")
	}
	regular := tradingdate.NYSEParts{Year: 2026, Month: 9, Day: 1, DayOfWeek: 2}
	reg := TradingSession(regular, cal)
	if reg.Short || reg.CloseMin != 16*60 {
		t.Fatalf("regular weekday must stay 16:00, got %+v", reg)
	}
	// 2026-07-03 is the observed Independence Day holiday, not an early close.
	holiday := tradingdate.NYSEParts{Year: 2026, Month: 7, Day: 3, DayOfWeek: 5}
	if IsTradingDay(holiday, cal) {
		t.Fatal("computed holiday with empty calendar must not trade")
	}
	if IsShortDay(holiday, cal) {
		t.Fatal("holiday must not be treated as a short session")
	}
}

func TestTickMissedT11AtT8Alerts(t *testing.T) {
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
	now := time.Date(2026, 9, 1, 19, 52, 0, 0, time.UTC) // 15:52 ET, until=8
	var logs []JobLog
	RunTick(db, Deps{Live: eng}, now, func(j JobLog) { logs = append(logs, j) })
	sawMiss := false
	for _, j := range logs {
		if j.Name == "telegram-aggregation" && j.Skipped && strings.Contains(j.Detail, "missed-t11") {
			sawMiss = true
		}
		if j.Name == "telegram-aggregation" && !j.Skipped {
			t.Fatalf("T-8 must not send T-11: %+v", j)
		}
	}
	if !sawMiss {
		t.Fatalf("T-8 with t11 not sent must JobLog missed-t11, logs=%+v", logs)
	}
	if telegramTextContaining(tg, "Пропущен T-11") == "" {
		t.Fatalf("T-8 must alert missed T-11, messages=%v", tg.Sent())
	}
	n := len(tg.Sent())
	var logs2 []JobLog
	RunTick(db, Deps{Live: eng}, now.Add(20*time.Second), func(j JobLog) { logs2 = append(logs2, j) })
	for _, j := range logs2 {
		if j.Name == "telegram-aggregation" && j.Skipped && strings.Contains(j.Detail, "missed-t11") {
			t.Fatalf("missed T-11 must alert once, second tick %+v", j)
		}
	}
	if len(tg.Sent()) != n {
		t.Fatalf("missed T-11 telegram must send once, got %d", len(tg.Sent()))
	}
}

func TestReportMissedT1ParallelSendsOnce(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	tg := &live.MemoryTelegram{}
	eng := live.New(db, nil)
	eng.Telegram = tg
	eng.ChatID = "c"
	now := time.Date(2026, 9, 1, 20, 5, 0, 0, time.UTC)
	today := "2026-09-01"
	start := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(2)
	for i := 0; i < 2; i++ {
		go func() {
			defer wg.Done()
			<-start
			reportMissedTelegram(db, eng, now, today, "c", "t1", -5, func(JobLog) {})
		}()
	}
	close(start)
	wg.Wait()
	n := 0
	for _, m := range tg.Sent() {
		if strings.Contains(m[1], "Пропущен T-1") {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("missed T-1 telegram must send once, got %d %+v", n, tg.Sent())
	}
}

func TestTickMissedT1AfterCloseAlerts(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	tg := &live.MemoryTelegram{}
	eng := live.New(db, nil)
	eng.Telegram = tg
	eng.ChatID = "c"
	now := time.Date(2026, 9, 1, 20, 5, 0, 0, time.UTC) // 16:05 ET, after close
	var logs []JobLog
	RunTick(db, Deps{Live: eng}, now, func(j JobLog) { logs = append(logs, j) })
	saw := false
	for _, j := range logs {
		if j.Name == "telegram-aggregation" && j.Skipped && strings.Contains(j.Detail, "missed-t1") {
			saw = true
		}
	}
	if !saw {
		t.Fatalf("after close with t1 not sent must JobLog missed-t1, logs=%+v", logs)
	}
	if telegramTextContaining(tg, "Пропущен T-1") == "" {
		t.Fatalf("after close must alert missed T-1, messages=%v", tg.Sent())
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

func TestRunCalendarExtendReportsMarkerSaveFailure(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	raw, _ := json.Marshal(map[string]any{
		"holidays":     map[string]any{},
		"tradingHours": map[string]any{"normal": map[string]any{"start": "09:30", "end": "16:00"}},
		"metadata":     map[string]any{"webullCoverageThrough": "2027-12-31"},
	})
	if err := db.SaveCalendar(raw); err != nil {
		t.Fatal(err)
	}
	if _, err := db.SQL.Exec(`
            CREATE TRIGGER IF NOT EXISTS settings_block_update
            BEFORE UPDATE ON settings
            BEGIN
                SELECT RAISE(ABORT, 'injected settings fail');
            END;
        `); err != nil {
		t.Fatalf("block settings updates: %v", err)
	}
	if _, err := db.SQL.Exec(`
            CREATE TRIGGER IF NOT EXISTS settings_block_insert
            BEFORE INSERT ON settings
            BEGIN
                SELECT RAISE(ABORT, 'injected settings fail');
            END;
        `); err != nil {
		t.Fatalf("block settings inserts: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.SQL.Exec(`DROP TRIGGER IF EXISTS settings_block_update`)
		_, _ = db.SQL.Exec(`DROP TRIGGER IF EXISTS settings_block_insert`)
	})

	today := "2026-09-01"
	now := time.Date(2026, 9, 1, 20, 0, 0, 0, time.UTC)
	var logs []JobLog
	RunCalendarExtend(db, Deps{}, today, now, func(j JobLog) { logs = append(logs, j) })
	for _, j := range logs {
		if strings.Contains(j.Detail, "marker-save-failed") {
			return
		}
	}
	t.Fatalf("want JobLog Detail containing marker-save-failed, got %+v", logs)
}

func sourceFn(t *testing.T, sig string) string {
	t.Helper()
	raw, err := os.ReadFile("scheduler.go")
	if err != nil {
		t.Fatal(err)
	}
	s := string(raw)
	i := strings.Index(s, sig)
	if i < 0 {
		t.Fatalf("%s not found", sig)
	}
	rest := s[i:]
	next := strings.Index(rest[len(sig):], "\nfunc ")
	if next < 0 {
		return rest
	}
	return rest[:len(sig)+next]
}

func TestStartWithStopWaits(t *testing.T) {
	fn := sourceFn(t, "func StartWith(")
	if !strings.Contains(fn, ".Wait()") {
		t.Fatal("StartWith stop must wait the tick goroutine")
	}
	if !strings.Contains(fn, "StopTrackers()") {
		t.Fatal("StartWith stop must wait tracker wheels")
	}
}

func TestRunTickComputesIsTradingDayOnce(t *testing.T) {
	fn := sourceFn(t, "func RunTick(")
	if n := strings.Count(fn, "IsTradingDay("); n != 1 {
		t.Fatalf("RunTick calls IsTradingDay %d times, want 1", n)
	}
	if n := strings.Count(fn, "TradingSession("); n != 1 {
		t.Fatalf("RunTick calls TradingSession %d times, want 1", n)
	}
}

func TestLiveStatusRemoved(t *testing.T) {
	raw, err := os.ReadFile("scheduler.go")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "func liveStatus") {
		t.Fatal("liveStatus is unused and must be deleted")
	}
}
