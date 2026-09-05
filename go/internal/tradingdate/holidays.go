package tradingdate

import (
	"fmt"
	"strings"
	"time"
)

// NthWeekdayOfMonth is the n-th weekday of month (1=first). Matches Node nthWeekdayOfMonthET.
func NthWeekdayOfMonth(year int, month time.Month, weekday time.Weekday, n int) string {
	t := time.Date(year, month, 1, 12, 0, 0, 0, time.UTC)
	for t.Weekday() != weekday {
		t = t.AddDate(0, 0, 1)
	}
	if n > 1 {
		t = t.AddDate(0, 0, 7*(n-1))
	}
	return t.Format(Layout)
}

// LastWeekdayOfMonth matches Node lastWeekdayOfMonthET.
func LastWeekdayOfMonth(year int, month time.Month, weekday time.Weekday) string {
	t := time.Date(year, month+1, 0, 12, 0, 0, 0, time.UTC)
	for t.Weekday() != weekday {
		t = t.AddDate(0, 0, -1)
	}
	return t.Format(Layout)
}

// ObservedFixed is the NYSE observed date for a fixed month/day (Sat→Fri, Sun→Mon).
func ObservedFixed(year int, month time.Month, day int) string {
	t := time.Date(year, month, day, 12, 0, 0, 0, time.UTC)
	switch t.Weekday() {
	case time.Sunday:
		t = t.AddDate(0, 0, 1)
	case time.Saturday:
		t = t.AddDate(0, 0, -1)
	}
	return t.Format(Layout)
}

func easterUTC(year int) time.Time {
	a := year % 19
	b := year / 100
	c := year % 100
	d := b / 4
	e := b % 4
	f := (b + 8) / 25
	g := (b - f + 1) / 3
	h := (19*a + b - d - g + 15) % 30
	i := c / 4
	k := c % 4
	l := (32 + 2*e + 2*i - h - k) % 7
	m := (a + 11*h + 22*l) / 451
	month := (h+l-7*m+114)/31 - 1
	day := ((h + l - 7*m + 114) % 31) + 1
	return time.Date(year, time.Month(month+1), day, 12, 0, 0, 0, time.UTC)
}

func GoodFriday(year int) string {
	e := easterUTC(year).AddDate(0, 0, -2)
	return e.Format(Layout)
}

// juneteenthSince is the first year NYSE observed Juneteenth (June 19).
const juneteenthSince = 2022

type namedHoliday struct {
	date string
	name string
}

func nyseHolidays(year int) []namedHoliday {
	h := make([]namedHoliday, 0, 11)
	h = append(h,
		namedHoliday{ObservedFixed(year, time.January, 1), "New Year's Day"},
		namedHoliday{NthWeekdayOfMonth(year, time.January, time.Monday, 3), "Martin Luther King Jr. Day"},
		namedHoliday{NthWeekdayOfMonth(year, time.February, time.Monday, 3), "Presidents' Day"},
		namedHoliday{GoodFriday(year), "Good Friday"},
		namedHoliday{LastWeekdayOfMonth(year, time.May, time.Monday), "Memorial Day"},
	)
	if year >= juneteenthSince {
		h = append(h, namedHoliday{ObservedFixed(year, time.June, 19), "Juneteenth"})
	}
	h = append(h,
		namedHoliday{ObservedFixed(year, time.July, 4), "Independence Day"},
		namedHoliday{NthWeekdayOfMonth(year, time.September, time.Monday, 1), "Labor Day"},
		namedHoliday{NthWeekdayOfMonth(year, time.November, time.Thursday, 4), "Thanksgiving Day"},
		namedHoliday{ObservedFixed(year, time.December, 25), "Christmas Day"},
	)
	return h
}

func NYSEHolidayDates(year int) []string {
	holidays := nyseHolidays(year)
	prefix := fmt.Sprintf("%04d-", year)
	dates := make([]string, 0, len(holidays))
	for _, h := range holidays {
		if strings.HasPrefix(h.date, prefix) {
			dates = append(dates, h.date)
		}
	}
	return dates
}

func IsNYSEHoliday(date string) bool {
	date = DateKey(date)
	if !IsValid(date) {
		return false
	}
	y, _, _ := split(date)
	for _, h := range nyseHolidays(y) {
		if h.date == date {
			return true
		}
	}
	return false
}

func HolidayName(ymd string) string {
	ymd = DateKey(ymd)
	if !IsValid(ymd) {
		return "Market Holiday"
	}
	y, _, _ := split(ymd)
	for _, h := range nyseHolidays(y) {
		if h.date == ymd {
			return h.name
		}
	}
	return "Market Holiday"
}

func ShortDayName(ymd string) string {
	ymd = DateKey(ymd)
	if !IsValid(ymd) {
		return "Early Close"
	}
	// 12-24 / 07-03 are full holidays when Christmas / Independence Day
	// falls on Saturday (observed Friday), not early-close eves.
	if IsNYSEHoliday(ymd) {
		return "Early Close"
	}
	mmdd := ymd[5:]
	if mmdd == "12-24" {
		return "Christmas Eve"
	}
	if mmdd == "07-03" {
		return "Independence Day Eve"
	}
	y, _, _ := split(ymd)
	thanks := NthWeekdayOfMonth(y, time.November, time.Thursday, 4)
	if ymd == AddDays(thanks, 1) {
		return "Day After Thanksgiving"
	}
	return "Early Close"
}

func NYSEPartsDate(p NYSEParts) string {
	return fmt.Sprintf("%04d-%02d-%02d", p.Year, p.Month, p.Day)
}
