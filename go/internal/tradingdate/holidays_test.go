package tradingdate

import "testing"

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

func TestThanksgivingEveShortName(t *testing.T) {
	if got := ShortDayName("2026-11-25"); got != "Thanksgiving Eve" {
		t.Fatalf("got %q", got)
	}
	if got := ShortDayName("2025-11-26"); got != "Thanksgiving Eve" {
		t.Fatalf("2025 eve got %q", got)
	}
}
