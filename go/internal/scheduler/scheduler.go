package scheduler

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"mktorder.com/go/internal/live"
	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/robinhood"
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

// Start builds the one Engine the whole scheduler shares. A fresh Engine per
// call would drop the in-memory order metadata and the tracker de-duplication
// that in-flight orders depend on.
func Start(db *store.DB, onEvent func(JobLog)) (stop func()) {
	p := providers.FromEnv()
	return StartWith(db, Deps{Providers: p, Live: live.New(db, p)}, onEvent)
}

func StartWith(db *store.DB, deps Deps, onEvent func(JobLog)) (stop func()) {
	if onEvent == nil {
		onEvent = func(JobLog) {}
	}
	if deps.Providers == nil {
		deps.Providers = providers.FromEnv()
	}
	deps.Providers.UseWebullToken(db.WebullAccessToken)
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
				func() {
					defer func() {
						if rec := recover(); rec != nil {
							log.Printf("scheduler: RunTick panic: %v", rec)
							onEvent(JobLog{At: now, Name: "tick-panic", Detail: fmt.Sprint(rec)})
						}
					}()
					RunTick(db, deps, now, onEvent)
				}()
			}
		}
	}()
	return func() { close(done) }
}

func RunTick(db *store.DB, deps Deps, now time.Time, onEvent func(JobLog)) {
	if onEvent == nil {
		onEvent = func(JobLog) {}
	}
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("scheduler: RunTick panic: %v", rec)
			onEvent(JobLog{At: now, Name: "tick-panic", Detail: fmt.Sprint(rec)})
		}
	}()
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
	hs := RunBrokerHealth(db, deps, todayET, now)
	if len(hs) == 0 {
		return "already-ran", true
	}
	for _, h := range hs {
		if h.Broker == "webull" {
			if h.Detail == "skipped" {
				return "already-ran", true
			}
			if h.Detail != "" {
				return h.Detail, false
			}
			return h.Status, false
		}
	}
	return hs[0].Status, false
}

func RunBrokerHealth(db *store.DB, deps Deps, todayET string, now time.Time) []live.BrokerHealth {
	eng := engine(db, deps)
	var out []live.BrokerHealth
	out = append(out, webullHealthJob(db, eng, todayET, now)...)
	out = append(out, robinhoodHealthJob(db, eng, todayET, now)...)
	return out
}

func webullHealthJob(db *store.DB, eng *live.Engine, todayET string, now time.Time) []live.BrokerHealth {
	row := db.GetWebullToken()
	if row.LastHealthCheckDate == todayET {
		return []live.BrokerHealth{{Broker: "webull", Status: row.LastCheckStatus, Detail: "skipped"}}
	}
	raw := eng.TokenHealth()
	recorded := raw
	if raw == "UNKNOWN" && row.LastCheckStatus != "" {
		recorded = row.LastCheckStatus
	}
	_ = db.UpsertWebullHealth(todayET, recorded, now.UTC().Format(time.RFC3339Nano))
	row = db.GetWebullToken()
	st, dl := live.ClassifyWebullHealth(row.Token, recorded, row.ExpiresAt, now)
	if raw == "UNKNOWN" {
		st = live.RecordedHealth(row.LastCheckStatus, live.HealthUnreachable)
	}
	maybeHealthAlert(db, eng, "webull", row.LastAlertedStatus, row.LastAlertedAt, st, now)
	return []live.BrokerHealth{{Broker: "webull", Status: st, CheckedAt: now.UTC().Format(time.RFC3339), ExpiresAt: row.ExpiresAt, DaysLeft: dl, Detail: recorded}}
}

func robinhoodHealthJob(db *store.DB, eng *live.Engine, todayET string, now time.Time) []live.BrokerHealth {
	row := db.GetRobinhoodOAuth()
	if row.LastHealthCheckDate == todayET {
		return []live.BrokerHealth{{Broker: "robinhood", Status: row.LastCheckStatus, Detail: "skipped"}}
	}
	svc := robinhood.New(db)
	st, _ := svc.KeepAlive()
	if st == "" {
		st = live.HealthUnreachable
	}
	row = db.GetRobinhoodOAuth()
	if st == live.HealthOK {
		classified, _ := live.ClassifyRobinhoodHealth(row.AccessToken, row.RefreshToken, st, row.ExpiresAt, now)
		if classified == live.HealthExpiringSoon {
			st = classified
		}
	}
	recorded := live.RecordedHealth(row.LastCheckStatus, st)
	_ = db.UpsertRobinhoodHealth(todayET, recorded, now.UTC().Format(time.RFC3339Nano))
	row = db.GetRobinhoodOAuth()
	_, dl := live.ClassifyRobinhoodHealth(row.AccessToken, row.RefreshToken, recorded, row.ExpiresAt, now)
	maybeHealthAlert(db, eng, "robinhood", row.LastAlertedStatus, row.LastAlertedAt, recorded, now)
	return []live.BrokerHealth{{Broker: "robinhood", Status: recorded, CheckedAt: now.UTC().Format(time.RFC3339), ExpiresAt: row.ExpiresAt, DaysLeft: dl, Detail: recorded}}
}

func liveStatus(raw string) string {
	switch strings.ToUpper(strings.TrimSpace(raw)) {
	case "UNKNOWN":
		return live.HealthUnreachable
	case "MISSING":
		return live.HealthMissing
	case "NORMAL", "OK":
		return live.HealthOK
	default:
		if raw == "" {
			return live.HealthMissing
		}
		return raw
	}
}

func maybeHealthAlert(db *store.DB, eng *live.Engine, broker, prev, prevAt, status string, now time.Time) {
	if status == live.HealthMissing && (prev == "" || prev == live.HealthMissing) {
		return
	}
	t := time.Time{}
	if prevAt != "" {
		t, _ = time.Parse(time.RFC3339Nano, prevAt)
		if t.IsZero() {
			t, _ = time.Parse(time.RFC3339, prevAt)
		}
	}
	send, kind := live.ShouldHealthAlert(prev, status, t, now)
	if !send {
		return
	}
	_ = eng.Send("", live.HealthAlertText(broker, status, kind))
	if broker == "robinhood" {
		_ = db.SetRobinhoodAlerted(status, now.UTC().Format(time.RFC3339Nano))
	} else {
		_ = db.SetWebullAlerted(status, now.UTC().Format(time.RFC3339Nano))
	}
}

func RunTelegramAggregation(db *store.DB, deps Deps, until int) int {
	// Node runTelegramAggregation returns wrong_time unless the clock minute is exactly 11 or 1.
	if until != 11 && until != 1 {
		return 0
	}
	res, _ := engine(db, deps).Aggregate(until, live.AggregateOpts{ForceSend: true, DryRun: until == 11, UpdateState: true})
	return len(res.Tickers)
}

func RunPriceActualization(db *store.DB, deps Deps) (ok, fail int) {
	res := engine(db, deps).Actualize(true)
	return res.Count, len(res.Failed)
}
