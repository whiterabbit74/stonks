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
	items, err := e.Broker.CalendarDays(start, end)
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
	holidays, _ := cal["holidays"].(map[string]any)
	if holidays == nil {
		holidays = map[string]any{}
	}
	shortDays, _ := cal["shortDays"].(map[string]any)
	if shortDays == nil {
		shortDays = map[string]any{}
	}
	newH, newS := 0, 0
	for d := start; d <= end; d = tradingdate.AddDays(d, 1) {
		dow := tradingdate.DayOfWeek(d)
		if dow == 0 || dow == 6 {
			continue
		}
		year, mmdd := d[:4], d[5:]
		if _, ok := trading[d]; !ok {
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
	meta["webullCoverageThrough"] = end
	cal["metadata"] = meta
	out, err := json.Marshal(cal)
	if err != nil {
		return nil, err
	}
	if err := e.DB.SaveCalendar(out); err != nil {
		return nil, err
	}
	return map[string]any{
		"ok": true, "from": start, "to": end, "coverageThrough": end,
		"tradingDaysFound": len(trading), "newHolidays": newH, "newShortDays": newS,
	}, nil
}


