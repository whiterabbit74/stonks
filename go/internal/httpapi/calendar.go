package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"mktorder.com/go/internal/scheduler"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

func (s *Server) handleGetCalendar(w http.ResponseWriter, r *http.Request) {
	raw, err := s.DB.GetCalendar()
	if err != nil {
		// An unreadable store is not an empty calendar: answering with the
		// default plus computed days would show the UI a healthy source
		// while the scheduler is skipping the day (see AUD-020).
		writeJSON(w, 500, map[string]any{"error": "Не удалось прочитать торговый календарь"})
		return
	}
	if store.CalendarHolidaysEmpty(raw) {
		raw = json.RawMessage(store.DefaultCalendarJSON)
	}
	// The SPA reads these maps and has no computed fallback of its own, so
	// hand it a payload that already covers the years it can show.
	y, _, _ := tradingdate.YMD(tradingdate.TodayNYSE(time.Now()))
	raw = scheduler.FillComputedDays(raw, y-1, y+3)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(200)
	_, _ = w.Write(raw)
}

func (s *Server) handlePrevDay(w http.ResponseWriter, r *http.Request) {
	raw, err := s.DB.GetCalendar()
	cal, perr := scheduler.ParseCalendar(raw)
	if err != nil || perr != nil {
		writeJSON(w, 500, map[string]any{"error": "Не удалось прочитать календарь"})
		return
	}
	d := tradingdate.AddDays(tradingdate.TodayNYSE(time.Now()), -1)
	for i := 0; i < 30; i++ {
		y, m, day := tradingdate.YMD(d)
		parts := tradingdate.NYSEParts{Year: y, Month: m, Day: day, DayOfWeek: tradingdate.DayOfWeek(d)}
		if scheduler.IsTradingDay(parts, cal) {
			writeJSON(w, 200, map[string]any{"date": d})
			return
		}
		d = tradingdate.AddDays(d, -1)
	}
	writeJSON(w, 200, map[string]any{"date": d})
}

func (s *Server) handleImportCalendar(w http.ResponseWriter, r *http.Request) {
	out, err := s.liveEng().ImportWebullCalendar()
	if err != nil {
		code := 502
		if out != nil {
			if _, ok := out["unknownTypes"]; ok {
				code = 422
			}
			writeJSON(w, code, out)
			return
		}
		writeJSON(w, code, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, out)
}

func (s *Server) handlePatchCalendarDay(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Year string `json:"year"`
		Mmdd string `json:"mmdd"`
		Type string `json:"type"`
		Name string `json:"name"`
	}
	if err := readJSON(r, &body); err != nil || body.Year == "" || body.Mmdd == "" || body.Type == "" {
		writeJSON(w, 400, map[string]any{"error": "year, mmdd and type are required"})
		return
	}
	if !regexp.MustCompile(`^\d{4}$`).MatchString(body.Year) {
		writeJSON(w, 400, map[string]any{"error": "year must be a four-digit year"})
		return
	}
	if !regexp.MustCompile(`^\d{2}-\d{2}$`).MatchString(body.Mmdd) {
		writeJSON(w, 400, map[string]any{"error": "mmdd must be a valid MM-DD date"})
		return
	}
	if body.Type != "normal" && body.Type != "holiday" && body.Type != "short" {
		writeJSON(w, 400, map[string]any{"error": "type must be normal, holiday or short"})
		return
	}
	// Read-modify-write of the whole calendar blob: a failed read or an
	// unparseable blob would look like an empty calendar and save this single
	// day over every stored holiday and short day.
	raw, err := s.DB.GetCalendar()
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Не удалось прочитать календарь"})
		return
	}
	var cal map[string]any
	if err := json.Unmarshal(raw, &cal); err != nil || cal == nil {
		writeJSON(w, 500, map[string]any{"error": "Не удалось разобрать календарь"})
		return
	}
	holidays, _ := cal["holidays"].(map[string]any)
	if holidays == nil {
		holidays = map[string]any{}
	}
	shortDays, _ := cal["shortDays"].(map[string]any)
	if shortDays == nil {
		shortDays = map[string]any{}
	}
	deleteNested(holidays, body.Year, body.Mmdd)
	deleteNested(shortDays, body.Year, body.Mmdd)
	name := strings.TrimSpace(body.Name)
	if len(name) > 120 {
		name = name[:120]
	}
	if body.Type == "holiday" {
		yearMap, _ := holidays[body.Year].(map[string]any)
		if yearMap == nil {
			yearMap = map[string]any{}
		}
		if name == "" {
			name = "Holiday"
		}
		yearMap[body.Mmdd] = map[string]any{"name": name, "type": "holiday", "description": "Market Closed"}
		holidays[body.Year] = yearMap
	} else if body.Type == "short" {
		yearMap, _ := shortDays[body.Year].(map[string]any)
		if yearMap == nil {
			yearMap = map[string]any{}
		}
		if name == "" {
			name = "Early Close"
		}
		yearMap[body.Mmdd] = map[string]any{"name": name, "type": "short", "description": "Early close at 1:00 PM", "hours": 3.5}
		shortDays[body.Year] = yearMap
	}
	cal["holidays"] = holidays
	cal["shortDays"] = shortDays
	meta, _ := cal["metadata"].(map[string]any)
	if meta == nil {
		meta = map[string]any{}
	}
	meta["lastUpdated"] = tradingdate.TodayNYSE(time.Now())
	cal["metadata"] = meta
	out, _ := json.Marshal(cal)
	if err := s.DB.SwapCalendar(raw, out); err != nil {
		code := 500
		if errors.Is(err, store.ErrCalendarChanged) {
			code = 409
		}
		writeJSON(w, code, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "year": body.Year, "mmdd": body.Mmdd, "type": body.Type})
}

func deleteNested(root map[string]any, year, mmdd string) {
	yearMap, _ := root[year].(map[string]any)
	if yearMap == nil {
		return
	}
	delete(yearMap, mmdd)
}
