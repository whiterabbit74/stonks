package tradingdate

import (
	"fmt"
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

func NYSEHolidayDates(year int) []string {
	return []string{
		ObservedFixed(year, time.January, 1),
		NthWeekdayOfMonth(year, time.January, time.Monday, 3),
		NthWeekdayOfMonth(year, time.February, time.Monday, 3),
		GoodFriday(year),
		LastWeekdayOfMonth(year, time.May, time.Monday),
		ObservedFixed(year, time.June, 19),
		ObservedFixed(year, time.July, 4),
		NthWeekdayOfMonth(year, time.September, time.Monday, 1),
		NthWeekdayOfMonth(year, time.November, time.Thursday, 4),
		ObservedFixed(year, time.December, 25),
	}
}

func IsNYSEHoliday(date string) bool {
	date = DateKey(date)
	if !IsValid(date) {
		return false
	}
	y, _, _ := split(date)
	for _, d := range NYSEHolidayDates(y) {
		if d == date {
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
	mmdd := ymd[5:]
	names := map[string]string{
		ObservedFixed(y, time.January, 1)[5:]:                    "New Year's Day",
		NthWeekdayOfMonth(y, time.January, time.Monday, 3)[5:]:   "Martin Luther King Jr. Day",
		NthWeekdayOfMonth(y, time.February, time.Monday, 3)[5:]:  "Presidents' Day",
		GoodFriday(y)[5:]:                                        "Good Friday",
		LastWeekdayOfMonth(y, time.May, time.Monday)[5:]:         "Memorial Day",
		ObservedFixed(y, time.June, 19)[5:]:                      "Juneteenth",
		ObservedFixed(y, time.July, 4)[5:]:                       "Independence Day",
		NthWeekdayOfMonth(y, time.September, time.Monday, 1)[5:]: "Labor Day",
		NthWeekdayOfMonth(y, time.November, time.Thursday, 4)[5:]: "Thanksgiving Day",
		ObservedFixed(y, time.December, 25)[5:]:                  "Christmas Day",
	}
	if n := names[mmdd]; n != "" {
		return n
	}
	return "Market Holiday"
}

func ShortDayName(ymd string) string {
	ymd = DateKey(ymd)
	if !IsValid(ymd) {
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
	if ymd == AddDays(thanks, -1) {
		return "Thanksgiving Eve"
	}
	return "Early Close"
}

func NYSEPartsDate(p NYSEParts) string {
	return fmt.Sprintf("%04d-%02d-%02d", p.Year, p.Month, p.Day)
}
