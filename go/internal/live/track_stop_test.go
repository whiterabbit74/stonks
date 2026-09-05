package live

import (
	"sync"
	"testing"
	"time"
)

func TestStopTrackersWaitsForWheel(t *testing.T) {
	_, e, _ := testEngine(t, entryBars)
	var once sync.Once
	inSleep := make(chan struct{})
	e.Sleep = func(time.Duration) {
		once.Do(func() { close(inSleep) })
		time.Sleep(150 * time.Millisecond)
	}
	e.TrackSubmitted("oid-stop")
	select {
	case <-inSleep:
	case <-time.After(2 * time.Second):
		t.Fatal("wheel never entered Sleep")
	}
	t0 := time.Now()
	e.StopTrackers()
	if time.Since(t0) < 80*time.Millisecond {
		t.Fatal("StopTrackers returned before the wheel finished")
	}
}
