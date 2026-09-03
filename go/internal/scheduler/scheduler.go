package scheduler

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"mktorder.com/go/internal/live"
	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

type JobLog struct {
	At      time.Time
	Name    string
	Skipped bool
	Detail  string
}

type Calendar struct {
	Holidays     map[string]map[string]any `json:"holidays"`
	ShortDays    map[string]map[string]any `json:"shortDays"`
	TradingHours struct {
		Normal struct {
			Start string `json:"start"`
			End   string `json:"end"`
		} `json:"normal"`
		Short struct {
			Start string `json:"start"`
			End   string `json:"end"`
		} `json:"short"`
	} `json:"tradingHours"`
}

func ParseCalendar(raw []byte) Calendar {
	var c Calendar
	_ = json.Unmarshal(raw, &c)
	if c.Holidays == nil {
		c.Holidays = map[string]map[string]any{}
	}
	if c.ShortDays == nil {
		c.ShortDays = map[string]map[string]any{}
	}
	return c
}

func mmdd(p tradingdate.NYSEParts) string {
	return fmt.Sprintf("%02d-%02d", p.Month, p.Day)
}

func IsHoliday(p tradingdate.NYSEParts, cal Calendar) bool {
	y := fmt.Sprintf("%d", p.Year)
	yearMap := cal.Holidays[y]
	if yearMap == nil {
		return false
	}
	_, ok := yearMap[mmdd(p)]
	return ok
}

func IsShortDay(p tradingdate.NYSEParts, cal Calendar) bool {
	y := fmt.Sprintf("%d", p.Year)
	yearMap := cal.ShortDays[y]
	if yearMap == nil {
		return false
	}
	_, ok := yearMap[mmdd(p)]
	return ok
}

func IsTradingDay(p tradingdate.NYSEParts, cal Calendar) bool {
	if p.DayOfWeek == 0 || p.DayOfWeek == 6 {
		return false
	}
	if IsHoliday(p, cal) {
		return false
	}
	if tradingdate.IsNYSEHoliday(tradingdate.NYSEPartsDate(p)) {
		return false
	}
	return true
}

func parseHM(hm string, fallback int) int {
	if hm == "" {
		return fallback
	}
	var h, m int
	if _, err := fmt.Sscanf(hm, "%d:%d", &h, &m); err != nil {
		return fallback
	}
	return h*60 + m
}

type Session struct {
	OpenMin  int
	CloseMin int
	Short    bool
}

func TradingSession(p tradingdate.NYSEParts, cal Calendar) Session {
	normalEnd := parseHM(cal.TradingHours.Normal.End, 16*60)
	shortEnd := parseHM(cal.TradingHours.Short.End, 13*60)
	startMin := parseHM(cal.TradingHours.Normal.Start, 9*60+30)
	short := IsShortDay(p, cal)
	closeMin := normalEnd
	if short {
		closeMin = shortEnd
	}
	return Session{OpenMin: startMin, CloseMin: closeMin, Short: short}
}

type Deps struct {
	Providers *providers.Client
	Live      *live.Engine
}

func Start(db *store.DB, onEvent func(JobLog)) (stop func()) {
	return StartWith(db, Deps{}, onEvent)
}

func StartWith(db *store.DB, deps Deps, onEvent func(JobLog)) (stop func()) {
	if onEvent == nil {
		onEvent = func(JobLog) {}
	}
	if deps.Providers == nil {
		deps.Providers = providers.FromEnv()
	}
	engine(db, deps).ResumeTrackers()
	tick := time.NewTicker(20 * time.Second)
	done := make(chan struct{})
	go func() {
		for {
			select {
			case <-done:
				tick.Stop()
				return
			case now := <-tick.C:
				RunTick(db, deps, now, onEvent)
			}
		}
	}()
	return func() { close(done) }
}

func RunTick(db *store.DB, deps Deps, now time.Time, onEvent func(JobLog)) {
	if onEvent == nil {
		onEvent = func(JobLog) {}
	}
	p := tradingdate.CurrentTimeNYSE(now)
	today := tradingdate.TodayNYSE(now)

	nTrack := engine(db, deps).PollTrackers()
	onEvent(JobLog{At: now, Name: "order-trackers", Detail: fmt.Sprintf("pending=%d", nTrack)})

	detail, skipped := RunTokenHealth(db, deps, today, now)
	onEvent(JobLog{At: now, Name: "webull-token-health", Skipped: skipped, Detail: detail})

	raw, _ := db.GetCalendar()
	cal := ParseCalendar(raw)
	if !IsTradingDay(p, cal) {
		onEvent(JobLog{At: now, Name: "market-jobs", Skipped: true, Detail: "non-trading-day"})
		return
	}
	sess := TradingSession(p, cal)
	nowMin := p.Hour*60 + p.Minute
	until := sess.CloseMin - nowMin
	if (until >= 10 && until <= 12) || (until >= 0 && until <= 2) {
		n := RunTelegramAggregation(db, deps, until)
		onEvent(JobLog{At: now, Name: "telegram-aggregation", Detail: fmt.Sprintf("window until=%d watches=%d", until, n)})
		log.Printf("scheduler: telegram aggregation minutesUntilClose=%d short=%v", until, sess.Short)
	}
	after := nowMin - sess.CloseMin
	if after >= 15 && after <= 31 {
		n, errN := RunPriceActualization(db, deps)
		onEvent(JobLog{At: now, Name: "price-actualization", Detail: fmt.Sprintf("after=%d tickers=%d errors=%d", after, n, errN)})
		log.Printf("scheduler: price actualization minutesAfterClose=%d", after)
	}
}

func engine(db *store.DB, deps Deps) *live.Engine {
	if deps.Live != nil {
		return deps.Live
	}
	return live.New(db, deps.Providers)
}

func RunTokenHealth(db *store.DB, deps Deps, todayET string, now time.Time) (detail string, skipped bool) {
	row := db.GetWebullToken()
	if row.LastHealthCheckDate == todayET {
		return "already-ran", true
	}
	status := engine(db, deps).TokenHealth()
	_ = db.UpsertWebullHealth(todayET, status, now.UTC().Format(time.RFC3339Nano))
	return status, false
}

func RunTelegramAggregation(db *store.DB, deps Deps, until int) int {
	// Node runTelegramAggregation returns wrong_time unless the clock minute is exactly 11 or 1.
	if until != 11 && until != 1 {
		return 0
	}
	res, _ := engine(db, deps).Aggregate(until, live.AggregateOpts{ForceSend: true, DryRun: until > 2, UpdateState: true})
	return len(res.Tickers)
}

func RunPriceActualization(db *store.DB, deps Deps) (ok, fail int) {
	res := engine(db, deps).Actualize(true)
	return res.Count, len(res.Failed)
}
