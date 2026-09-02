package scheduler

import (
	"testing"
	"time"

	"mktorder.com/go/internal/store"
)

func TestTickDoesNotPanic(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(dir + "/t.db")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	var logs []JobLog
	runTick(db, time.Date(2026, 9, 1, 20, 0, 0, 0, time.UTC), func(j JobLog) { logs = append(logs, j) })
	if len(logs) == 0 {
		t.Fatal("expected at least token-health event")
	}
}
