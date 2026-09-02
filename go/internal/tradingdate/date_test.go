package tradingdate

import (
	"os"
	"testing"
	"time"

	"mktorder.com/go/internal/goldens"
)

func TestParseDateGolden(t *testing.T) {
	var g map[string]ParseResult
	goldens.Load("parse-date.json", &g)
	cases := []string{"iso", "isoImpossible", "us", "eu", "empty"}
	inputs := map[string]string{
		"iso": "2024-11-17", "isoImpossible": "2024-02-30",
		"us": "11/17/2024", "eu": "17.11.2024", "empty": "",
	}
	for _, k := range cases {
		got := Parse(inputs[k])
		want := g[k]
		if got.IsValid != want.IsValid {
			t.Errorf("%s valid got %v want %v", k, got.IsValid, want.IsValid)
		}
		if (got.Date == nil) != (want.Date == nil) {
			t.Errorf("%s date ptr mismatch", k)
			continue
		}
		if got.Date != nil && *got.Date != *want.Date {
			t.Errorf("%s date got %s want %s", k, *got.Date, *want.Date)
		}
		if got.Format != want.Format {
			t.Errorf("%s format got %s want %s", k, got.Format, want.Format)
		}
	}
}

func TestDaysBetweenAndAdd(t *testing.T) {
	if DaysBetween("2023-01-01", "2024-01-01") != 365 {
		t.Fatalf("days %d", DaysBetween("2023-01-01", "2024-01-01"))
	}
	if AddDays("2023-01-01", 28) != "2023-01-29" {
		t.Fatalf("add %s", AddDays("2023-01-01", 28))
	}
	if DayOfWeek("2023-01-01") != 0 { // Sunday
		t.Fatalf("dow %d", DayOfWeek("2023-01-01"))
	}
}

func TestTZStable(t *testing.T) {
	a := DaysBetween("2004-08-19", "2025-01-15")
	b := AddDays("2024-02-28", 1)
	c := Parse("2024-02-30")
	d := TodayNYSE(time.Date(2026, 9, 1, 23, 0, 0, 0, time.UTC))
	t.Logf("tz=%s days=%d add=%s impossible=%v todayNY=%s", os.Getenv("TZ"), a, b, c.IsValid, d)
	if a != DaysBetween("2004-08-19", "2025-01-15") {
		t.Fatal("unstable")
	}
	if b != "2024-02-29" {
		t.Fatalf("leap add %s", b)
	}
	if c.IsValid {
		t.Fatal("2024-02-30 must be rejected")
	}
}
