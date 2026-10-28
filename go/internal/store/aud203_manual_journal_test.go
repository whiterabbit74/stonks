package store

import (
	"errors"
	"testing"
)

// AUD-203: the operator's POST and PATCH could open a second monitoring
// position next to the one T-1 holds (invariant H).
func TestManualEditCannotOpenSecondMonitorPosition(t *testing.T) {
	d := openTestDB(t)
	if _, err := d.OpenMonitorPosition(Position{ID: "m1", Symbol: "AAA", EntryDate: "2026-09-01"}); err != nil {
		t.Fatal(err)
	}
	var invalid ValidationError
	if err := d.AddPosition(Position{Symbol: "BBB", Status: "open", EntryDate: "2026-09-02"}); !errors.As(err, &invalid) {
		t.Fatalf("POST of a second open monitoring position: %v", err)
	}
	// A test row or a hidden row is not the monitoring's.
	if err := d.AddPosition(Position{Symbol: "CCC", Status: "open", EntryDate: "2026-09-02", IsTest: true}); err != nil {
		t.Fatal(err)
	}
	rows, _ := d.OpenPositions()
	var testID string
	for _, p := range rows {
		if p.IsTest {
			testID = p.ID
		}
	}
	if _, err := d.PatchPosition(testID, func(p *Position) error { p.IsTest = false; return nil }); !errors.As(err, &invalid) {
		t.Fatalf("PATCH isTest=false next to the monitoring's position: %v", err)
	}
	if n := countMonitorOpen(t, d); n != 1 {
		t.Fatalf("open monitoring positions = %d, want 1", n)
	}
}

// The monitoring's own row stays editable: the check excludes the row itself.
func TestPatchOfMonitorPositionItself(t *testing.T) {
	d := openTestDB(t)
	p, err := d.OpenMonitorPosition(Position{ID: "m1", Symbol: "AAA", EntryDate: "2026-09-01"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := d.PatchPosition(p.ID, func(p *Position) error { p.Notes = "x"; return nil }); err != nil {
		t.Fatal(err)
	}
}

// AUD-204: a row stored before a rule existed could not be edited at all,
// not even hidden; the edit is refused only for what it breaks.
func TestPatchLegacyRowRefusesOnlyNewBreakage(t *testing.T) {
	d := openTestDB(t)
	if err := d.SavePosition(Position{ID: "old", Symbol: "AAA", Status: "closed", EntryDate: "2026-09-01", IsTest: true}); err != nil {
		t.Fatal(err)
	}
	if _, err := d.PatchPosition("old", func(p *Position) error { p.IsHidden = true; return nil }); err != nil {
		t.Fatalf("hiding a legacy row: %v", err)
	}
	var invalid ValidationError
	if _, err := d.PatchPosition("old", func(p *Position) error { p.ExitDate = "2026-08-01"; return nil }); !errors.As(err, &invalid) {
		t.Fatalf("an exit date before the entry is still refused: %v", err)
	}
}

func countMonitorOpen(t *testing.T, d *DB) int {
	t.Helper()
	var n int
	if err := d.SQL.QueryRow(`SELECT COUNT(*) FROM positions WHERE status='open' AND is_test=0 AND is_hidden=0`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}
