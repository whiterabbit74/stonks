package scheduler

import (
	"encoding/json"
	"fmt"
	"testing"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

// AUD-006c (docs/audits/REGISTRY.md): Go decides trading days from the
// calendar maps *plus* tradingdate's computed rules; app.js reads the maps
// and nothing else. Before FillComputedDays the seeded calendar ran out at
// the end of 2027 and the two disagreed on 30 holidays and 8 early closes
// over 2026-2030 — the SPA showing an open market on Good Friday 2028.
//
// spaLookup is exactly what app.js does: one map lookup, no fallback.
func spaLookup(sec map[string]map[string]any, p tradingdate.NYSEParts) bool {
	by := sec[fmt.Sprintf("%d", p.Year)]
	if by == nil {
		return false
	}
	_, ok := by[fmt.Sprintf("%02d-%02d", p.Month, p.Day)]
	return ok
}

func TestAUD006ServedCalendarMatchesGoDecision(t *testing.T) {
	const from, to = 2026, 2030
	served := FillComputedDays([]byte(store.DefaultCalendarJSON), from, to)
	if !json.Valid(served) {
		t.Fatal("FillComputedDays produced invalid JSON")
	}
	cal, _ := ParseCalendar(served)

	date := fmt.Sprintf("%d-01-01", from)
	end := fmt.Sprintf("%d-12-31", to)
	checked := 0
	for date <= end {
		y, mo, d := tradingdate.YMD(date)
		p := tradingdate.NYSEParts{Year: y, Month: mo, Day: d, DayOfWeek: tradingdate.DayOfWeek(date)}
		if p.DayOfWeek != 0 && p.DayOfWeek != 6 {
			checked++
			if got, want := !spaLookup(cal.Holidays, p), IsTradingDay(p, cal); got != want {
				t.Errorf("%s: SPA sees trading=%v, Go says %v", date, got, want)
			}
			if IsTradingDay(p, cal) {
				if got, want := spaLookup(cal.ShortDays, p), IsShortDay(p, cal); got != want {
					t.Errorf("%s: SPA sees short=%v, Go says %v", date, got, want)
				}
			}
		}
		date = tradingdate.AddDays(date, 1)
	}
	if checked < 1000 {
		t.Fatalf("only %d weekdays checked, the loop is not covering the range", checked)
	}
}

// An operator's override must survive: FillComputedDays fills gaps, it does
// not overwrite what the exchange calendar or a human already recorded.
func TestAUD006FillKeepsStoredEntries(t *testing.T) {
	stored := `{"holidays":{"2028":{"01-17":{"name":"Renamed by operator","type":"holiday"}}},"shortDays":{}}`
	out := FillComputedDays([]byte(stored), 2028, 2028)
	cal, _ := ParseCalendar(out)
	got := cal.Holidays["2028"]["01-17"]
	m, _ := got.(map[string]any)
	if m == nil || m["name"] != "Renamed by operator" {
		t.Fatalf("stored entry was overwritten: %+v", got)
	}
	if _, ok := cal.Holidays["2028"]["07-04"]; !ok {
		t.Fatal("computed holidays were not filled in alongside the stored one")
	}
}
