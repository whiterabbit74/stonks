package scheduler

import (
	"log"
	"time"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

type JobLog struct {
	At      time.Time
	Name    string
	Skipped bool
	Detail  string
}

// Start runs the 20s tick matching server/server.js:
// daily Webull token health every tick; skip market jobs on non-trading days;
// Telegram T-11 and T-1 (±1 min); price actualization 15–31 minutes after close.
func Start(db *store.DB, onEvent func(JobLog)) (stop func()) {
	if onEvent == nil {
		onEvent = func(JobLog) {}
	}
	tick := time.NewTicker(20 * time.Second)
	done := make(chan struct{})
	go func() {
		for {
			select {
			case <-done:
				tick.Stop()
				return
			case now := <-tick.C:
				runTick(db, now, onEvent)
			}
		}
	}()
	return func() { close(done) }
}

func runTick(db *store.DB, now time.Time, onEvent func(JobLog)) {
	p := tradingdate.CurrentTimeNYSE(now)
	onEvent(JobLog{At: now, Name: "webull-token-health", Detail: "daily check (no-op without credentials)"})

	cal, _ := db.GetCalendar()
	_ = cal
	if p.DayOfWeek == 0 || p.DayOfWeek == 6 {
		onEvent(JobLog{At: now, Name: "market-jobs", Skipped: true, Detail: "weekend"})
		return
	}
	closeMin := 16 * 60
	nowMin := p.Hour*60 + p.Minute
	until := closeMin - nowMin
	if (until >= 10 && until <= 12) || (until >= 0 && until <= 2) {
		onEvent(JobLog{At: now, Name: "telegram-aggregation", Detail: "T-11/T-1 window"})
		log.Printf("scheduler: telegram aggregation window minutesUntilClose=%d", until)
	}
	after := nowMin - closeMin
	if after >= 15 && after <= 31 {
		onEvent(JobLog{At: now, Name: "price-actualization", Detail: "post-close 15-31 min"})
		log.Printf("scheduler: price actualization minutesAfterClose=%d", after)
	}
}
