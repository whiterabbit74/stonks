package scheduler

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sync"
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
	if yearMap, ok := cal.ShortDays[y]; ok && yearMap != nil {
		_, marked := yearMap[mmdd(p)]
		return marked
	}
	return computedShortDay(p)
}

// computedShortDay uses tradingdate.ShortDayName when the imported calendar
// has no shortDays entry for today. Named sessions are early close; "Early Close"
// is the function's default for every other date.
func computedShortDay(p tradingdate.NYSEParts) bool {
	if p.DayOfWeek == 0 || p.DayOfWeek == 6 {
		return false
	}
	date := tradingdate.NYSEPartsDate(p)
	if tradingdate.IsNYSEHoliday(date) {
		return false
	}
	name := tradingdate.ShortDayName(date)
	return name != "" && name != "Early Close"
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
	var tickWG sync.WaitGroup
	tickWG.Add(1)
	go func() {
		defer tickWG.Done()
		for {
			select {
			case <-done:
				tick.Stop()
				return
			case <-tick.C:
				now := time.Now()
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
	return func() {
		close(done)
		tickWG.Wait()
		engine(db, deps).StopTrackers()
	}
}

func RunTick(db *store.DB, deps Deps, now time.Time, onEvent func(JobLog)) {
	if onEvent == nil {
		onEvent = func(JobLog) {}
	}
	started := time.Now()
	defer func() {
		onEvent(JobLog{At: now, Name: "tick", Detail: fmt.Sprintf("duration_ms=%d", time.Since(started).Milliseconds())})
	}()
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("scheduler: RunTick panic: %v", rec)
			onEvent(JobLog{At: now, Name: "tick-panic", Detail: fmt.Sprint(rec)})
		}
	}()
	p := tradingdate.CurrentTimeNYSE(now)
	today := tradingdate.TodayNYSE(now)
	eng := engine(db, deps)

	raw, _ := db.GetCalendar()
	cal := ParseCalendar(raw)
	rawTrading := IsTradingDay(p, cal)
	trading := rawTrading
	if trading {
		if cov := calendarCoverageThrough(raw); cov != "" && cov < today {
			onEvent(JobLog{At: now, Name: "market-jobs", Skipped: true, Detail: "calendar-coverage-expired"})
			trading = false
		}
	}
	var sess Session
	if trading {
		sess = TradingSession(p, cal)
		nowMin := p.Hour*60 + p.Minute
		until := sess.CloseMin - nowMin
		chat := telegramChatID(eng)
		if until < 10 && until >= 0 {
			reportMissedTelegram(db, eng, now, today, chat, "t11", until, onEvent)
		}
		if until < 0 && until >= -5 {
			reportMissedTelegram(db, eng, now, today, chat, "t1", until, onEvent)
		}
		if (until >= 10 && until <= 12) || (until >= 0 && until <= 2) {
			_ = db.EnsureAggregateSlot(chat, today)
			n := RunTelegramAggregation(db, deps, until)
			onEvent(JobLog{At: now, Name: "telegram-aggregation", Detail: fmt.Sprintf("window until=%d watches=%d", until, n)})
			log.Printf("scheduler: telegram aggregation minutesUntilClose=%d short=%v", until, sess.Short)
		}
	}

	nTrack := eng.PollTrackers()
	onEvent(JobLog{At: now, Name: "order-trackers", Detail: fmt.Sprintf("pending=%d", nTrack)})

	detail, skipped := RunTokenHealth(db, deps, today, now)
	onEvent(JobLog{At: now, Name: "webull-token-health", Skipped: skipped, Detail: detail})

	if !rawTrading {
		onEvent(JobLog{At: now, Name: "market-jobs", Skipped: true, Detail: "non-trading-day"})
		RunCalendarExtend(db, deps, today, now, onEvent)
		return
	}
	if !trading {
		RunCalendarExtend(db, deps, today, now, onEvent)
		return
	}
	nowMin := p.Hour*60 + p.Minute
	after := nowMin - sess.CloseMin
	if after >= 15 && after <= 31 {
		go func() {
			n, errN, skipped := RunPriceActualization(db, deps)
			onEvent(JobLog{At: now, Name: "price-actualization", Skipped: skipped, Detail: fmt.Sprintf("after=%d tickers=%d errors=%d", after, n, errN)})
			log.Printf("scheduler: price actualization minutesAfterClose=%d skipped=%v", after, skipped)
		}()
		RunAutotradeLogRotation(db, today, now, onEvent)
	}
	RunCalendarExtend(db, deps, today, now, onEvent)
}

// autotradeLogRetentionDays / autotradeLogMaxRows are the defaults for the
// rotation below; both are overridable through the settings keys of the same
// name. 30 days keeps a full month of post-mortem material, 20000 rows is the
// ceiling for a stretch of bad quote days inside that month.
const (
	autotradeLogRetentionDays = 30
	autotradeLogMaxRows       = 20000
)

// RunAutotradeLogRotation trims autotrade_logs once per trading day, after the
// close, so the table does not grow without bound.
func RunAutotradeLogRotation(db *store.DB, today string, now time.Time, onEvent func(JobLog)) {
	settings := db.Settings()
	if fmt.Sprint(settings["lastAutotradeLogPruneDate"]) == today {
		return
	}
	days := settingsInt(settings, "autotradeLogRetentionDays", autotradeLogRetentionDays)
	rows := settingsInt(settings, "autotradeLogMaxRows", autotradeLogMaxRows)
	n, err := db.PruneAutotradeLogs(days, rows)
	if merr := db.SetSettingsKeys(map[string]any{"lastAutotradeLogPruneDate": today}); merr != nil {
		onEvent(JobLog{At: now, Name: "autotrade-log-rotation", Detail: "marker-save-failed: " + merr.Error()})
	}
	if err != nil {
		onEvent(JobLog{At: now, Name: "autotrade-log-rotation", Detail: err.Error()})
		return
	}
	onEvent(JobLog{At: now, Name: "autotrade-log-rotation", Detail: fmt.Sprintf("deleted=%d days=%d maxRows=%d", n, days, rows)})
}

// settingsInt reads a setting that JSON round-trips as float64. A negative
// value disables that bound; a missing or unusable one falls back to def.
func settingsInt(settings map[string]any, key string, def int) int {
	v, ok := settings[key]
	if !ok || v == nil {
		return def
	}
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case json.Number:
		if i, err := n.Int64(); err == nil {
			return int(i)
		}
	}
	return def
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

// webullHealthJob runs the daily Webull token check and records the result.
// P0-4: last_check_status must end up holding the classified verdict
// (OK/NEEDS_REAUTH/MISSING/UNREACHABLE/EXPIRING_SOON) that CanSubmit and
// executeAll gate on — the same vocabulary robinhoodHealthJob already writes
// — never the raw word Webull's CheckToken response carried ("NORMAL",
// "PENDING", ...). The raw word is preserved separately in last_check_raw for
// diagnostics.
func webullHealthJob(db *store.DB, eng *live.Engine, todayET string, now time.Time) []live.BrokerHealth {
	row := db.GetWebullToken()
	if row.LastHealthCheckDate == todayET {
		return []live.BrokerHealth{{Broker: "webull", Status: row.LastCheckStatus, Detail: "skipped"}}
	}
	// eng.TokenHealth() returns Webull's own raw word ("NORMAL", "PENDING",
	// "MISSING", "PRESENT") or "UNKNOWN" when the check itself could not
	// reach Webull; on the reachable paths it has already persisted a
	// classified status + the raw word via SaveWebullTokenChecked.
	raw := eng.TokenHealth()
	row = db.GetWebullToken()
	recordedRaw := raw
	if raw == "UNKNOWN" && row.LastCheckRaw != "" {
		recordedRaw = row.LastCheckRaw
	}
	var st string
	var dl *int
	if raw == "UNKNOWN" {
		// Unreachable: do not overwrite a previously known-good classified
		// status with UNREACHABLE outright — same fallback Robinhood's job
		// already applies. daysLeft is still derived from the last known raw
		// word so an expiry warning near the deadline is not lost.
		st = live.RecordedHealth(row.LastCheckStatus, live.HealthUnreachable)
		_, dl = live.ClassifyWebullHealth(row.Token, recordedRaw, row.ExpiresAt, now)
	} else {
		st, dl = live.ClassifyWebullHealth(row.Token, raw, row.ExpiresAt, now)
	}
	_ = db.UpsertWebullHealth(todayET, st, recordedRaw, now.UTC().Format(time.RFC3339Nano))
	row = db.GetWebullToken()
	maybeHealthAlert(db, eng, "webull", row.LastAlertedStatus, row.LastAlertedAt, st, now)
	return []live.BrokerHealth{{Broker: "webull", Status: st, CheckedAt: now.UTC().Format(time.RFC3339), ExpiresAt: row.ExpiresAt, DaysLeft: dl, Detail: recordedRaw}}
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
	if err := eng.Send("", live.HealthAlertText(broker, status, kind)); err != nil {
		return
	}
	if broker == "robinhood" {
		_ = db.SetRobinhoodAlerted(status, now.UTC().Format(time.RFC3339Nano))
	} else {
		_ = db.SetWebullAlerted(status, now.UTC().Format(time.RFC3339Nano))
	}
}

func telegramChatID(eng *live.Engine) string {
	if eng == nil {
		return os.Getenv("TELEGRAM_CHAT_ID")
	}
	if eng.ChatID != "" {
		return eng.ChatID
	}
	return os.Getenv("TELEGRAM_CHAT_ID")
}

func reportMissedTelegram(db *store.DB, eng *live.Engine, now time.Time, today, chat, slot string, until int, onEvent func(JobLog)) {
	t11Sent, t1Sent := db.AggregateState(chat, today)
	switch slot {
	case "t11":
		if t11Sent {
			return
		}
		claimed, err := db.ClaimAggregateT11(chat, today)
		if err != nil || !claimed {
			return
		}
		detail := fmt.Sprintf("missed-t11 until=%d", until)
		onEvent(JobLog{At: now, Name: "telegram-aggregation", Skipped: true, Detail: detail})
		if eng != nil {
			_ = eng.Send("", fmt.Sprintf("<b>Пропущен T-11</b>\nСводка за 11 минут до закрытия не ушла (until=%d).", until))
		}
	case "t1":
		finished, _ := db.T1ExecutionFinished(chat, today)
		if t1Sent || finished {
			return
		}
		claimed, err := db.ClaimMissedT1(chat, today)
		if err != nil {
			onEvent(JobLog{At: now, Name: "telegram-aggregation", Detail: "marker-save-failed: " + err.Error()})
			return
		}
		if !claimed {
			return
		}
		detail := fmt.Sprintf("missed-t1 until=%d", until)
		onEvent(JobLog{At: now, Name: "telegram-aggregation", Skipped: true, Detail: detail})
		if eng != nil {
			_ = eng.Send("", fmt.Sprintf("<b>Пропущен T-1</b>\nРешение за минуту до закрытия не ушло (until=%d).", until))
		}
	}
}

func RunTelegramAggregation(db *store.DB, deps Deps, until int) int {
	if !((until >= 10 && until <= 12) || (until >= 0 && until <= 2)) {
		return 0
	}
	res, _ := engine(db, deps).Aggregate(until, live.AggregateOpts{ForceSend: true, DryRun: until >= 10, UpdateState: true})
	return len(res.Tickers)
}

var actualizeMu sync.Mutex

func RunPriceActualization(db *store.DB, deps Deps) (ok, fail int, skipped bool) {
	if !actualizeMu.TryLock() {
		return 0, 0, true
	}
	defer actualizeMu.Unlock()
	res := engine(db, deps).Actualize(false)
	return res.Count, len(res.Failed), false
}

func calendarCoverageThrough(raw []byte) string {
	var cal map[string]any
	if json.Unmarshal(raw, &cal) != nil {
		return ""
	}
	meta, _ := cal["metadata"].(map[string]any)
	if meta == nil {
		return ""
	}
	cov, _ := meta["webullCoverageThrough"].(string)
	return cov
}

func RunCalendarExtend(db *store.DB, deps Deps, today string, now time.Time, onEvent func(JobLog)) {
	settings := db.Settings()
	if fmt.Sprint(settings["lastCalendarImportDate"]) == today {
		onEvent(JobLog{At: now, Name: "calendar-extend", Skipped: true, Detail: "already-ran"})
		return
	}
	raw, _ := db.GetCalendar()
	cov := calendarCoverageThrough(raw)
	need := cov == "" || tradingdate.AddDays(today, 45) > cov
	if !need {
		if err := db.SetSettingsKeys(map[string]any{"lastCalendarImportDate": today}); err != nil {
			onEvent(JobLog{At: now, Name: "calendar-extend", Detail: "marker-save-failed: " + err.Error()})
		}
		onEvent(JobLog{At: now, Name: "calendar-extend", Skipped: true, Detail: "coverage-ok"})
		return
	}
	_, err := engine(db, deps).ImportWebullCalendar()
	if merr := db.SetSettingsKeys(map[string]any{"lastCalendarImportDate": today}); merr != nil {
		onEvent(JobLog{At: now, Name: "calendar-extend", Detail: "marker-save-failed: " + merr.Error()})
	}
	if err != nil {
		onEvent(JobLog{At: now, Name: "calendar-extend", Detail: err.Error()})
		raw, _ = db.GetCalendar()
		cov = calendarCoverageThrough(raw)
		if cov != "" && tradingdate.AddDays(today, 14) > cov {
			eng := engine(db, deps)
			if eng.ChatID != "" {
				_ = eng.Send(eng.ChatID, "<b>Календарь истекает</b>\nПокрытие Webull меньше 14 дней, продление не удалось.")
			}
		}
		return
	}
	onEvent(JobLog{At: now, Name: "calendar-extend", Detail: "extended"})
}
