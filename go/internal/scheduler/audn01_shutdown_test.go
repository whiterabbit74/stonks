package scheduler

import (
	"path/filepath"
	"testing"
	"time"

	"mktorder.com/go/internal/live"
	"mktorder.com/go/internal/store"
)

// AUD-N01: актуализация цен запускалась отдельной goroutine, которую stop() не
// ждал. main доходил до db.Close(), пока задача ещё писала в базу.
func TestStopWaitsForBackgroundWork(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	stop := StartWith(db, Deps{Live: live.New(db, nil)}, nil)

	release := make(chan struct{})
	backgroundWG.Add(1)
	go func() {
		defer backgroundWG.Done()
		<-release
	}()

	done := make(chan struct{})
	go func() {
		stop()
		close(done)
	}()

	select {
	case <-done:
		t.Fatal("stop() вернулся, пока фоновая задача ещё пишет в базу (AUD-N01)")
	case <-time.After(100 * time.Millisecond):
	}

	close(release)
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("stop() не дождался фоновой задачи")
	}
}
