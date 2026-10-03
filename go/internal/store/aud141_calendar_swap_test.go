package store

import (
	"errors"
	"testing"
)

// AUD-141: two overlapping calendar edits read the same blob; the later write
// must be refused instead of erasing the earlier one.
func TestSwapCalendarRefusesStaleWrite(t *testing.T) {
	db := openTestDB(t)
	base, err := db.GetCalendar() // no row yet: the built-in default
	if err != nil {
		t.Fatal(err)
	}
	if err := db.SwapCalendar(base, []byte(`{"a":1}`)); err != nil {
		t.Fatalf("first insert: %v", err)
	}
	if err := db.SwapCalendar(base, []byte(`{"b":1}`)); !errors.Is(err, ErrCalendarChanged) {
		t.Fatalf("stale insert: %v", err)
	}
	if err := db.SwapCalendar([]byte(`{"a":1}`), []byte(`{"a":2}`)); err != nil {
		t.Fatalf("update: %v", err)
	}
	if err := db.SwapCalendar([]byte(`{"a":1}`), []byte(`{"c":1}`)); !errors.Is(err, ErrCalendarChanged) {
		t.Fatalf("stale update: %v", err)
	}
	if got, _ := db.GetCalendar(); string(got) != `{"a":2}` {
		t.Fatalf("calendar = %s", got)
	}
}
