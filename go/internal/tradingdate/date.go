package tradingdate

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const Layout = "2006-01-02"
const NYZone = "America/New_York"

var ymd = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
var isoPrefix = regexp.MustCompile(`^(\d{4})-(\d{1,2})-(\d{1,2})`)
var usDate = regexp.MustCompile(`^(\d{1,2})/(\d{1,2})/(\d{4})`)
var euDate = regexp.MustCompile(`^(\d{1,2})[.](\d{1,2})[.](\d{4})`)

func IsValid(value string) bool {
	return ymd.MatchString(value)
}

func DateKey(s string) string {
	if len(s) >= 10 {
		return s[:10]
	}
	return s
}

func YMD(date string) (int, int, int) {
	return split(date)
}

func FormatDisplay(date, locale string) string {
	if !IsValid(date) {
		return date
	}
	parts := strings.Split(date, "-")
	if locale == "en" {
		return parts[1] + "/" + parts[2] + "/" + parts[0]
	}
	return parts[2] + "." + parts[1] + "." + parts[0]
}

func Compare(a, b string) int {
	if a < b {
		return -1
	}
	if a > b {
		return 1
	}
	return 0
}

func utcMidnight(date string) time.Time {
	t, err := time.ParseInLocation(Layout, date, time.UTC)
	if err != nil {
		y, m, d := 1970, 1, 1
		fmt.Sscanf(date, "%d-%d-%d", &y, &m, &d)
		t = time.Date(y, time.Month(m), d, 0, 0, 0, 0, time.UTC)
	}
	return t
}

// DaysBetween matches JS Math.round((utc(to)-utc(from))/86400000).
func DaysBetween(from, to string) int {
	ms := float64(utcMidnight(to).UnixMilli() - utcMidnight(from).UnixMilli())
	return int(math.Round(ms / 86400000))
}

func DayOfWeek(date string) int {
	return int(utcMidnight(date).Weekday())
}

func AddDays(date string, days int) string {
	y, m, d := split(date)
	t := time.Date(y, time.Month(m), d+days, 12, 0, 0, 0, time.UTC)
	return t.Format(Layout)
}

func split(date string) (int, int, int) {
	parts := strings.Split(date, "-")
	if len(parts) < 3 {
		return 0, 0, 0
	}
	y, _ := strconv.Atoi(parts[0])
	m, _ := strconv.Atoi(parts[1])
	d, _ := strconv.Atoi(parts[2])
	return y, m, d
}

func ChartTimestamp(date string) int64 {
	y, m, d := split(date)
	t := time.Date(y, time.Month(m), d, 12, 0, 0, 0, time.UTC)
	return t.Unix()
}

func TodayNYSE(now time.Time) string {
	loc, err := time.LoadLocation(NYZone)
	if err != nil {
		loc = time.FixedZone("EST", -5*3600)
	}
	return now.In(loc).Format(Layout)
}

type NYSEParts struct {
	Year, Month, Day, Hour, Minute, DayOfWeek int
}

func CurrentTimeNYSE(now time.Time) NYSEParts {
	loc, err := time.LoadLocation(NYZone)
	if err != nil {
		loc = time.FixedZone("EST", -5*3600)
	}
	t := now.In(loc)
	return NYSEParts{
		Year: t.Year(), Month: int(t.Month()), Day: t.Day(),
		Hour: t.Hour(), Minute: t.Minute(), DayOfWeek: int(t.Weekday()),
	}
}

type ParseResult struct {
	IsValid bool    `json:"isValid"`
	Date    *string `json:"date"`
	Format  string  `json:"format,omitempty"`
	Error   string  `json:"error,omitempty"`
}

func isLeap(year int) bool {
	return (year%4 == 0 && year%100 != 0) || year%400 == 0
}

func toKey(y, m, d int) (string, bool) {
	if m < 1 || m > 12 || d < 1 {
		return "", false
	}
	dim := []int{31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}
	if isLeap(y) {
		dim[1] = 29
	}
	if d > dim[m-1] {
		return "", false
	}
	s := fmt.Sprintf("%04d-%02d-%02d", y, m, d)
	return s, true
}

func Parse(dateStr string) ParseResult {
	if dateStr == "" {
		return ParseResult{IsValid: false, Error: "Empty date string"}
	}
	if m := isoPrefix.FindStringSubmatch(dateStr); m != nil {
		y, _ := strconv.Atoi(m[1])
		mo, _ := strconv.Atoi(m[2])
		d, _ := strconv.Atoi(m[3])
		if key, ok := toKey(y, mo, d); ok {
			return ParseResult{IsValid: true, Date: &key, Format: "YYYY-MM-DD"}
		}
		return ParseResult{IsValid: false, Error: "Impossible date: " + dateStr}
	}
	if m := usDate.FindStringSubmatch(dateStr); m != nil {
		mo, _ := strconv.Atoi(m[1])
		d, _ := strconv.Atoi(m[2])
		y, _ := strconv.Atoi(m[3])
		if key, ok := toKey(y, mo, d); ok {
			return ParseResult{IsValid: true, Date: &key, Format: "M/D/YYYY"}
		}
		return ParseResult{IsValid: false, Error: "Impossible date: " + dateStr}
	}
	if m := euDate.FindStringSubmatch(dateStr); m != nil {
		d, _ := strconv.Atoi(m[1])
		mo, _ := strconv.Atoi(m[2])
		y, _ := strconv.Atoi(m[3])
		if key, ok := toKey(y, mo, d); ok {
			return ParseResult{IsValid: true, Date: &key, Format: "D.M.YYYY"}
		}
		return ParseResult{IsValid: false, Error: "Impossible date: " + dateStr}
	}
	return ParseResult{IsValid: false, Error: "Invalid date format"}
}
