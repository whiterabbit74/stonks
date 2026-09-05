package live

import (
	"encoding/json"
	"fmt"

	"mktorder.com/go/internal/tradingdate"
)

var knownTradeDateTypes = map[string]struct{}{"FULL_DAY": {}, "HALF_DAY": {}, "": {}}

func (e *Engine) ImportWebullCalendar() (map[string]any, error) {
	if e.Broker == nil {
		return nil, fmt.Errorf("webull sync requires credentials")
	}
	raw, err := e.DB.GetCalendar()
	if err != nil {
		return nil, err
	}
	cal := map[string]any{}
	if json.Unmarshal(raw, &cal) != nil {
		cal = map[string]any{}
	}
	meta, _ := cal["metadata"].(map[string]any)
	if meta == nil {
		meta = map[string]any{}
	}
	today := tradingdate.TodayNYSE(e.now())
	start := today
	if cov, _ := meta["webullCoverageThrough"].(string); cov != "" && cov >= "2000-01-01" {
		start = tradingdate.AddDays(cov, 1)
	}
	end := tradingdate.AddDays(start, 29)
	x := e.webullExtras()
	if x == nil {
		return nil, fmt.Errorf("Webull credentials are missing")
	}
	items, err := x.CalendarDays(start, end)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, fmt.Errorf("Webull вернул 0 торговых дней — данные ещё не доступны или формат ответа изменился")
	}
	trading := map[string]string{}
	unknown := map[string]string{}
	for _, item := range items {
		day := fmt.Sprint(item["trade_day"])
		if day == "" || day == "<nil>" {
			continue
		}
		if day < start || day > end {
			continue
		}
		typ := fmt.Sprint(item["trade_date_type"])
		if typ == "<nil>" {
			typ = ""
		}
		if _, ok := knownTradeDateTypes[typ]; !ok {
			if _, seen := unknown[typ]; !seen {
				unknown[typ] = day
			}
		}
		if typ == "" {
			typ = "FULL_DAY"
		}
		trading[day] = typ
	}
	if len(unknown) > 0 {
		return map[string]any{"ok": false, "error": "unknown trade_date_type", "unknownTypes": unknown}, fmt.Errorf("Webull вернул неизвестные типы торговых дней")
	}
	if len(trading) == 0 {
		return nil, fmt.Errorf("Webull вернул 0 торговых дней — данные ещё не доступны или формат ответа изменился")
	}
	// Last returned trade_day is the conservative coverage bound: a truncated
	// payload must not claim the requested window end, and weekdays after this
	// date are an uncovered tail rather than holidays.
	coverageThrough := lastReturnedTradeDay(trading, start, end)
	if coverageThrough == "" {
		return nil, fmt.Errorf("Webull вернул 0 торговых дней — данные ещё не доступны или формат ответа изменился")
	}
	holidays, _ := cal["holidays"].(map[string]any)
	if holidays == nil {
		holidays = map[string]any{}
	}
	shortDays, _ := cal["shortDays"].(map[string]any)
	if shortDays == nil {
		shortDays = map[string]any{}
	}
	newH, newS := 0, 0
	mismatches := []map[string]any{}
	for d := start; d <= coverageThrough; d = tradingdate.AddDays(d, 1) {
		dow := tradingdate.DayOfWeek(d)
		if dow == 0 || dow == 6 {
			continue
		}
		year, mmdd := d[:4], d[5:]
		_, returned := trading[d]
		if reason := nyseCalendarMismatch(d, returned); reason != "" {
			mismatches = append(mismatches, map[string]any{"date": d, "reason": reason})
			e.logAuto("calendar_nyse_mismatch", "", map[string]any{"date": d, "reason": reason})
		}
		if !returned {
			if yearMap, _ := holidays[year].(map[string]any); yearMap != nil {
				if yearMap[mmdd] != nil {
					continue
				}
			}
			yearMap, _ := holidays[year].(map[string]any)
			if yearMap == nil {
				yearMap = map[string]any{}
			}
			yearMap[mmdd] = map[string]any{"name": tradingdate.HolidayName(d), "type": "holiday", "description": "Market Closed"}
			holidays[year] = yearMap
			newH++
			continue
		}
		if trading[d] == "HALF_DAY" {
			if yearMap, _ := shortDays[year].(map[string]any); yearMap != nil {
				if yearMap[mmdd] != nil {
					continue
				}
			}
			yearMap, _ := shortDays[year].(map[string]any)
			if yearMap == nil {
				yearMap = map[string]any{}
			}
			yearMap[mmdd] = map[string]any{"name": tradingdate.ShortDayName(d), "type": "short", "description": "Early close at 1:00 PM", "hours": 3.5}
			shortDays[year] = yearMap
			newS++
		}
	}
	cal["holidays"] = holidays
	cal["shortDays"] = shortDays
	meta["lastUpdated"] = today
	meta["webullCoverageThrough"] = coverageThrough
	cal["metadata"] = meta
	out, err := json.Marshal(cal)
	if err != nil {
		return nil, err
	}
	if err := e.DB.SaveCalendar(out); err != nil {
		return nil, err
	}
	return map[string]any{
		"ok": true, "from": start, "to": end, "coverageThrough": coverageThrough,
		"tradingDaysFound": len(trading), "newHolidays": newH, "newShortDays": newS,
		"nyseMismatches": mismatches,
	}, nil
}

func lastReturnedTradeDay(trading map[string]string, start, end string) string {
	last := ""
	for day := range trading {
		if day < start || day > end {
			continue
		}
		if last == "" || day > last {
			last = day
		}
	}
	return last
}

func nyseCalendarMismatch(date string, webullReturned bool) string {
	isHoliday := tradingdate.IsNYSEHoliday(date)
	if webullReturned && isHoliday {
		return "webull_open_on_nyse_holiday"
	}
	if !webullReturned && !isHoliday {
		return "webull_gap_not_nyse_holiday"
	}
	return ""
}

// DeleteCalendarHoliday removes a stored holiday for date (YYYY-MM-DD).
// HTTP operators should keep using PATCH /api/trading-calendar/day with type=normal.
func (e *Engine) DeleteCalendarHoliday(date string) error {
	parsed := tradingdate.Parse(date)
	if !parsed.IsValid || parsed.Date == nil {
		if parsed.Error != "" {
			return fmt.Errorf("%s", parsed.Error)
		}
		return fmt.Errorf("invalid date")
	}
	date = *parsed.Date
	raw, err := e.DB.GetCalendar()
	if err != nil {
		return err
	}
	cal := map[string]any{}
	if json.Unmarshal(raw, &cal) != nil {
		cal = map[string]any{}
	}
	holidays, _ := cal["holidays"].(map[string]any)
	if holidays == nil {
		return nil
	}
	year, mmdd := date[:4], date[5:]
	yearMap, _ := holidays[year].(map[string]any)
	if yearMap == nil {
		return nil
	}
	delete(yearMap, mmdd)
	holidays[year] = yearMap
	cal["holidays"] = holidays
	meta, _ := cal["metadata"].(map[string]any)
	if meta == nil {
		meta = map[string]any{}
	}
	meta["lastUpdated"] = tradingdate.TodayNYSE(e.now())
	cal["metadata"] = meta
	out, err := json.Marshal(cal)
	if err != nil {
		return err
	}
	return e.DB.SaveCalendar(out)
}
