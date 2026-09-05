package live

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"mktorder.com/go/internal/tradingdate"
)

func loadCalendar(t *testing.T, e *Engine) map[string]any {
	t.Helper()
	raw, err := e.DB.GetCalendar()
	if err != nil {
		t.Fatal(err)
	}
	var cal map[string]any
	if err := json.Unmarshal(raw, &cal); err != nil {
		t.Fatal(err)
	}
	return cal
}

func calendarHoliday(cal map[string]any, date string) any {
	holidays, _ := cal["holidays"].(map[string]any)
	year, _ := holidays[date[:4]].(map[string]any)
	if year == nil {
		return nil
	}
	return year[date[5:]]
}

func nyLoc(t *testing.T) *time.Location {
	t.Helper()
	ny, err := time.LoadLocation(tradingdate.NYZone)
	if err != nil {
		t.Fatal(err)
	}
	return ny
}

func weekdayTradeDays(start, end string, skip map[string]struct{}, limit int) []map[string]any {
	var days []map[string]any
	for d := start; d <= end; d = tradingdate.AddDays(d, 1) {
		if limit > 0 && len(days) >= limit {
			break
		}
		dow := tradingdate.DayOfWeek(d)
		if dow == 0 || dow == 6 {
			continue
		}
		if _, omit := skip[d]; omit {
			continue
		}
		days = append(days, map[string]any{"trade_day": d, "trade_date_type": "FULL_DAY"})
	}
	return days
}

func TestLastReturnedTradeDayIsConservativeCoverage(t *testing.T) {
	start := "2026-03-02"
	end := tradingdate.AddDays(start, 29)
	days := weekdayTradeDays(start, end, nil, 20)
	trading := map[string]string{}
	for _, item := range days {
		trading[fmt.Sprint(item["trade_day"])] = "FULL_DAY"
	}
	got := lastReturnedTradeDay(trading, start, end)
	want := lastTradeDay(days)
	if got != want {
		t.Fatalf("coverageThrough helper=%s want last returned %s", got, want)
	}
	if got == "" || got >= end {
		t.Fatalf("conservative coverage %s must stay before window end %s", got, end)
	}
}

func lastTradeDay(days []map[string]any) string {
	last := ""
	for _, item := range days {
		day := fmt.Sprint(item["trade_day"])
		if last == "" || day > last {
			last = day
		}
	}
	return last
}

func mismatchDates(out map[string]any) map[string]string {
	got := map[string]string{}
	raw, _ := out["nyseMismatches"].([]map[string]any)
	if raw == nil {
		if anyList, ok := out["nyseMismatches"].([]any); ok {
			for _, item := range anyList {
				m, _ := item.(map[string]any)
				date := fmt.Sprint(m["date"])
				got[date] = fmt.Sprint(m["reason"])
			}
			return got
		}
		return got
	}
	for _, m := range raw {
		got[fmt.Sprint(m["date"])] = fmt.Sprint(m["reason"])
	}
	return got
}

// TestImportWebullCalendarTruncatedWindowDoesNotInventTailHolidays is AU-P0-5:
// a 30-calendar-day window that only comes back with 20 trading days must not
// treat the uncovered tail as holidays, and webullCoverageThrough must stop at
// the last day the response actually covered.
func TestImportWebullCalendarTruncatedWindowDoesNotInventTailHolidays(t *testing.T) {
	_, e, br := testEngine(t, nil)
	e.Now = func() time.Time { return time.Date(2026, 3, 2, 15, 59, 0, 0, nyLoc(t)) }

	start := "2026-03-02"
	end := tradingdate.AddDays(start, 29)
	days := weekdayTradeDays(start, end, nil, 20)
	if len(days) != 20 {
		t.Fatalf("setup: want 20 trading days, got %d", len(days))
	}
	br.Days = days
	last := lastTradeDay(days)
	if last >= end {
		t.Fatalf("setup: last returned %s must be before window end %s", last, end)
	}

	out, err := e.ImportWebullCalendar()
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if fmt.Sprint(out["coverageThrough"]) != last {
		t.Fatalf("coverageThrough=%v want last returned %s, not window end %s", out["coverageThrough"], last, end)
	}
	if fmt.Sprint(out["to"]) != end {
		t.Fatalf("to=%v want requested window end %s", out["to"], end)
	}

	cal := loadCalendar(t, e)
	meta, _ := cal["metadata"].(map[string]any)
	if fmt.Sprint(meta["webullCoverageThrough"]) != last {
		t.Fatalf("meta webullCoverageThrough=%v want %s", meta["webullCoverageThrough"], last)
	}
	for d := tradingdate.AddDays(last, 1); d <= end; d = tradingdate.AddDays(d, 1) {
		dow := tradingdate.DayOfWeek(d)
		if dow == 0 || dow == 6 {
			continue
		}
		if calendarHoliday(cal, d) != nil {
			t.Fatalf("fake holiday invented for uncovered tail weekday %s: %v", d, calendarHoliday(cal, d))
		}
	}
}

func TestImportWebullCalendarInteriorGapStillHoliday(t *testing.T) {
	_, e, br := testEngine(t, nil)
	e.Now = func() time.Time { return time.Date(2026, 3, 2, 15, 59, 0, 0, nyLoc(t)) }

	start := "2026-03-02"
	end := tradingdate.AddDays(start, 29)
	hole := "2026-03-10"
	days := weekdayTradeDays(start, end, map[string]struct{}{hole: {}}, 0)
	br.Days = days
	last := lastTradeDay(days)

	out, err := e.ImportWebullCalendar()
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if fmt.Sprint(out["coverageThrough"]) != last {
		t.Fatalf("coverageThrough=%v want last returned %s", out["coverageThrough"], last)
	}
	cal := loadCalendar(t, e)
	if calendarHoliday(cal, hole) == nil {
		t.Fatalf("interior gap %s must still be recorded as a holiday", hole)
	}
	mismatches := mismatchDates(out)
	if mismatches[hole] != "webull_gap_not_nyse_holiday" {
		t.Fatalf("want NYSE mismatch for unexpected gap %s, got %v", hole, mismatches)
	}
	if !hasAutotradeLog(t, e, "event=calendar_nyse_mismatch") || !hasAutotradeLog(t, e, hole) {
		t.Fatal("want calendar_nyse_mismatch logged for the interior gap")
	}
}

func TestImportWebullCalendarNyseHolidayOpenMismatch(t *testing.T) {
	_, e, br := testEngine(t, nil)
	e.Now = func() time.Time { return time.Date(2026, 9, 1, 15, 59, 0, 0, nyLoc(t)) }

	start := "2026-09-01"
	end := tradingdate.AddDays(start, 29)
	br.Days = weekdayTradeDays(start, end, nil, 0)

	out, err := e.ImportWebullCalendar()
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	labor := "2026-09-07"
	if !tradingdate.IsNYSEHoliday(labor) {
		t.Fatal("setup: 2026-09-07 must be Labor Day")
	}
	mismatches := mismatchDates(out)
	if mismatches[labor] != "webull_open_on_nyse_holiday" {
		t.Fatalf("want webull_open_on_nyse_holiday for %s, got %v", labor, mismatches)
	}
	if !hasAutotradeLog(t, e, "event=calendar_nyse_mismatch") || !hasAutotradeLog(t, e, labor) {
		t.Fatal("want calendar_nyse_mismatch logged for Webull trading on an NYSE holiday")
	}
}

func TestDeleteCalendarHoliday(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	raw, err := e.DB.GetCalendar()
	if err != nil {
		t.Fatal(err)
	}
	var cal map[string]any
	if err := json.Unmarshal(raw, &cal); err != nil {
		t.Fatal(err)
	}
	holidays, _ := cal["holidays"].(map[string]any)
	if holidays == nil {
		holidays = map[string]any{}
	}
	yearMap, _ := holidays["2026"].(map[string]any)
	if yearMap == nil {
		yearMap = map[string]any{}
	}
	yearMap["03-10"] = map[string]any{"name": "Fake Closure", "type": "holiday", "description": "Market Closed"}
	holidays["2026"] = yearMap
	cal["holidays"] = holidays
	out, err := json.Marshal(cal)
	if err != nil {
		t.Fatal(err)
	}
	if err := e.DB.SaveCalendar(out); err != nil {
		t.Fatal(err)
	}

	if err := e.DeleteCalendarHoliday("2026-03-10"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if calendarHoliday(loadCalendar(t, e), "2026-03-10") != nil {
		t.Fatal("holiday 2026-03-10 must be gone")
	}
	if err := e.DeleteCalendarHoliday("2026-03-10"); err != nil {
		t.Fatalf("idempotent delete: %v", err)
	}
	if err := e.DeleteCalendarHoliday("2026-02-30"); err == nil {
		t.Fatal("impossible date must be rejected")
	}
	if err := e.DeleteCalendarHoliday("not-a-date"); err == nil {
		t.Fatal("invalid date must be rejected")
	}
}
