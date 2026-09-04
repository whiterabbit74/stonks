package scheduler

import (
	"path/filepath"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
)

func rotationDB(t *testing.T) *store.DB {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "rot.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func autotradeLogCount(t *testing.T, db *store.DB) int {
	t.Helper()
	var n int
	if err := db.SQL.QueryRow(`SELECT COUNT(1) FROM autotrade_logs`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	return n
}

func TestPruneAutotradeLogsDropsOldAndOverflow(t *testing.T) {
	db := rotationDB(t)
	old := time.Now().UTC().AddDate(0, 0, -40).Format(time.RFC3339Nano)
	for i := 0; i < 5; i++ {
		if _, err := db.SQL.Exec(`INSERT INTO autotrade_logs (ts, message, kind) VALUES (?, 'old', 'quote_problem')`, old); err != nil {
			t.Fatalf("insert old: %v", err)
		}
	}
	for i := 0; i < 10; i++ {
		if err := db.AppendAutotradeLogKind("quote_problem", "fresh"); err != nil {
			t.Fatalf("insert fresh: %v", err)
		}
	}

	n, err := db.PruneAutotradeLogs(30, 0)
	if err != nil {
		t.Fatalf("prune by age: %v", err)
	}
	if n != 5 {
		t.Fatalf("age rule must delete the 5 rows older than 30 days, deleted %d", n)
	}
	if got := autotradeLogCount(t, db); got != 10 {
		t.Fatalf("10 fresh rows must survive, got %d", got)
	}

	n, err = db.PruneAutotradeLogs(0, 4)
	if err != nil {
		t.Fatalf("prune by rows: %v", err)
	}
	if n != 6 {
		t.Fatalf("row cap 4 must delete 6 of 10, deleted %d", n)
	}
	if got := autotradeLogCount(t, db); got != 4 {
		t.Fatalf("row cap must leave exactly 4 rows, got %d", got)
	}
}

func TestPruneAutotradeLogsKeepsNewestRows(t *testing.T) {
	db := rotationDB(t)
	for _, m := range []string{"first", "second", "third"} {
		if err := db.AppendAutotradeLogKind("", m); err != nil {
			t.Fatalf("insert: %v", err)
		}
	}
	if _, err := db.PruneAutotradeLogs(0, 1); err != nil {
		t.Fatalf("prune: %v", err)
	}
	rows, err := db.ListAutotradeLogs(10)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rows) != 1 || rows[0]["message"] != "third" {
		t.Fatalf("the newest row must be the one kept, got %v", rows)
	}
}

func TestRunAutotradeLogRotationRunsOncePerDay(t *testing.T) {
	db := rotationDB(t)
	old := time.Now().UTC().AddDate(0, 0, -90).Format(time.RFC3339Nano)
	if _, err := db.SQL.Exec(`INSERT INTO autotrade_logs (ts, message, kind) VALUES (?, 'old', '')`, old); err != nil {
		t.Fatalf("insert: %v", err)
	}
	if err := db.AppendAutotradeLogKind("", "fresh"); err != nil {
		t.Fatalf("insert: %v", err)
	}

	var events []JobLog
	collect := func(j JobLog) { events = append(events, j) }
	now := time.Now()

	RunAutotradeLogRotation(db, "2026-09-04", now, collect)
	if len(events) != 1 {
		t.Fatalf("first run must report, got %v", events)
	}
	if got := autotradeLogCount(t, db); got != 1 {
		t.Fatalf("the 90-day-old row must be gone, %d rows left", got)
	}

	// A second call on the same trading day is a no-op: the day marker gates it.
	if _, err := db.SQL.Exec(`INSERT INTO autotrade_logs (ts, message, kind) VALUES (?, 'old2', '')`, old); err != nil {
		t.Fatalf("insert: %v", err)
	}
	RunAutotradeLogRotation(db, "2026-09-04", now, collect)
	if len(events) != 1 {
		t.Fatalf("second run on the same day must not report, got %v", events)
	}
	if got := autotradeLogCount(t, db); got != 2 {
		t.Fatalf("second run on the same day must delete nothing, %d rows left", got)
	}

	RunAutotradeLogRotation(db, "2026-09-05", now, collect)
	if len(events) != 2 {
		t.Fatalf("the next trading day must run again, got %v", events)
	}
	if got := autotradeLogCount(t, db); got != 1 {
		t.Fatalf("the next day must drop the old row, %d rows left", got)
	}
}

func TestRunAutotradeLogRotationHonoursSettings(t *testing.T) {
	db := rotationDB(t)
	for i := 0; i < 6; i++ {
		if err := db.AppendAutotradeLogKind("", "fresh"); err != nil {
			t.Fatalf("insert: %v", err)
		}
	}
	s := db.Settings()
	s["autotradeLogRetentionDays"] = float64(0)
	s["autotradeLogMaxRows"] = float64(2)
	if err := db.SaveSettings(s); err != nil {
		t.Fatalf("save settings: %v", err)
	}
	RunAutotradeLogRotation(db, "2026-09-04", time.Now(), func(JobLog) {})
	if got := autotradeLogCount(t, db); got != 2 {
		t.Fatalf("autotradeLogMaxRows=2 must leave 2 rows, got %d", got)
	}
}
