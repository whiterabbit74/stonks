package tradingdate

import (
	"strings"
	"testing"
)

func TestNYSEHolidaysKnownDates(t *testing.T) {
	cases := map[string]string{
		"2024-01-15": "Martin Luther King Jr. Day",
		"2024-03-29": "Good Friday",
		"2024-07-04": "Independence Day",
		"2024-11-28": "Thanksgiving Day",
		"2025-01-20": "Martin Luther King Jr. Day",
		"2025-02-17": "Presidents' Day",
		"2025-04-18": "Good Friday",
		"2025-05-26": "Memorial Day",
		"2025-09-01": "Labor Day",
		"2025-11-27": "Thanksgiving Day",
		"2026-01-19": "Martin Luther King Jr. Day",
		"2026-02-16": "Presidents' Day",
		"2026-04-03": "Good Friday",
		"2026-05-25": "Memorial Day",
		"2026-07-03": "Independence Day", // Saturday 07-04 observed Friday
		"2026-09-07": "Labor Day",
		"2026-11-26": "Thanksgiving Day",
		"2026-12-25": "Christmas Day",
		"2027-01-18": "Martin Luther King Jr. Day",
		"2027-11-25": "Thanksgiving Day",
	}
	for date, name := range cases {
		if !IsNYSEHoliday(date) {
			t.Errorf("%s (%s) must be an NYSE holiday", date, name)
		}
		if got := HolidayName(date); got != name {
			t.Errorf("%s name got %q want %q", date, got, name)
		}
	}
	if IsNYSEHoliday("2026-07-04") {
		t.Error("2026-07-04 is Saturday; observed holiday is 07-03")
	}
	if IsNYSEHoliday("2026-01-20") {
		t.Error("2026-01-20 is not MLK")
	}
	if IsNYSEHoliday("2026-09-01") {
		t.Error("2026-09-01 is a Tuesday, not Labor Day")
	}
}

func TestDayAfterThanksgivingIsShortName(t *testing.T) {
	if got := ShortDayName("2025-11-28"); got != "Day After Thanksgiving" {
		t.Fatalf("2025-11-28 got %q", got)
	}
	if got := ShortDayName("2026-11-27"); got != "Day After Thanksgiving" {
		t.Fatalf("2026-11-27 got %q", got)
	}
	if got := ShortDayName("2027-11-26"); got != "Day After Thanksgiving" {
		t.Fatalf("2027-11-26 got %q", got)
	}
	if got := ShortDayName("2025-11-26"); got == "Day After Thanksgiving" || got == "Thanksgiving Eve" {
		t.Fatalf("Wednesday before Thanksgiving is a full session, got %q", got)
	}
}

func TestNYSEHolidayDatesStayInYear(t *testing.T) {
	for _, d := range NYSEHolidayDates(2022) {
		if !strings.HasPrefix(d, "2022-") {
			t.Fatalf("NYSEHolidayDates(2022) leaked %s", d)
		}
	}
}

func TestJuneteenthObservedFrom2022(t *testing.T) {
	if IsNYSEHoliday("2021-06-19") {
		t.Error("2021-06-19 is not an NYSE holiday (Juneteenth from 2022)")
	}
	if IsNYSEHoliday("2021-06-18") {
		t.Error("2021-06-18 must not be observed Juneteenth; NYSE traded that Friday")
	}
	if HolidayName("2021-06-18") == "Juneteenth" {
		t.Error("HolidayName must not label 2021-06-18 as Juneteenth")
	}
	if !IsNYSEHoliday("2022-06-20") {
		t.Error("2022-06-20 is observed Juneteenth (Sunday 06-19 → Monday)")
	}
	if got := HolidayName("2022-06-20"); got != "Juneteenth" {
		t.Errorf("2022-06-20 name got %q", got)
	}
	if !IsNYSEHoliday("2023-06-19") {
		t.Error("2023-06-19 is Juneteenth")
	}
	if got := HolidayName("2023-06-19"); got != "Juneteenth" {
		t.Errorf("2023-06-19 name got %q", got)
	}
}

func TestChristmasEveVsObservedChristmasFriday(t *testing.T) {
	if IsNYSEHoliday("2024-12-24") {
		t.Error("2024-12-25 is a weekday; 12-24 is not a holiday")
	}
	if got := ShortDayName("2024-12-24"); got != "Christmas Eve" {
		t.Errorf("2024-12-24 short name got %q want Christmas Eve", got)
	}

	if !IsNYSEHoliday("2021-12-24") {
		t.Error("2021-12-24 is observed Christmas (Saturday 12-25 → Friday)")
	}
	if got := HolidayName("2021-12-24"); got != "Christmas Day" {
		t.Errorf("2021-12-24 name got %q want Christmas Day", got)
	}
	if got := ShortDayName("2021-12-24"); got == "Christmas Eve" {
		t.Error("2021-12-24 is a full holiday, not Christmas Eve early close")
	}

	if !IsNYSEHoliday("2027-12-24") {
		t.Error("2027-12-24 is observed Christmas")
	}
	if got := ShortDayName("2027-12-24"); got == "Christmas Eve" {
		t.Error("2027-12-24 is a full holiday, not early close")
	}
}

func TestIndependenceEveVsObservedFriday(t *testing.T) {
	if IsNYSEHoliday("2025-07-03") {
		t.Error("2025-07-04 is Friday; 07-03 is not a holiday")
	}
	if got := ShortDayName("2025-07-03"); got != "Independence Day Eve" {
		t.Errorf("2025-07-03 short name got %q want Independence Day Eve", got)
	}

	if !IsNYSEHoliday("2026-07-03") {
		t.Error("2026-07-03 is observed Independence Day (Saturday 07-04 → Friday)")
	}
	if got := ShortDayName("2026-07-03"); got == "Independence Day Eve" {
		t.Error("2026-07-03 is a full holiday, not Independence Day Eve early close")
	}
}
