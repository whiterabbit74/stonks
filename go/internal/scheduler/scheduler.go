package scheduler

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
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

// computedShortDay is the fallback for a calendar year with no shortDays
// entry. It shares tradingdate.IsComputedShortDay with the live engine so the
// scheduler's session close and the engine's T-1 deadline cannot drift apart.
func computedShortDay(p tradingdate.NYSEParts) bool {
	return tradingdate.IsComputedShortDay(tradingdate.NYSEPartsDate(p))
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

	raw, calErr := db.GetCalendar()
	cal := ParseCalendar(raw)
	rawTrading := IsTradingDay(p, cal)
	trading := rawTrading
	if trading {
		// An unreadable calendar is not an empty calendar: falling back to the
		// computed session would run T-11/T-1 on a schedule nobody confirmed.
		detail, alert := "", ""
		if calErr != nil {
			detail = "calendar-read-failed"
			alert = fmt.Sprintf("<b>Календарь биржи недоступен</b>\nЧтение календаря не удалось (%s), торговый день %s пропущен.", calErr.Error(), today)
		} else if cov := calendarCoverageThrough(raw); cov != "" && cov < today {
			detail = "calendar-coverage-expired"
			alert = fmt.Sprintf("<b>Календарь биржи устарел</b>\nПокрытие заканчивается на %s, торговый день %s пропущен.", cov, today)
		}
		if detail != "" {
			onEvent(JobLog{At: now, Name: "market-jobs", Skipped: true, Detail: detail})
			settings := db.Settings()
			if fmt.Sprint(settings["lastCalendarCoverageAlertDate"]) != today {
				if err := eng.Send(telegramChatID(eng), alert); err == nil {
					if err := db.SetSettingsKeys(map[string]any{"lastCalendarCoverageAlertDate": today}); err != nil {
						onEvent(JobLog{At: now, Name: "calendar-coverage-alert", Skipped: true, Detail: "persist failed: " + err.Error()})
					}
				} else {
					onEvent(JobLog{At: now, Name: "calendar-coverage-alert", Skipped: true, Detail: err.Error()})
				}
			}
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
		// The first tick inside a window owns it, so the upper bound is when
		// the message actually goes out: 12/2 sent the overview at T-12 and
		// took the decision at T-2, a minute before the documented time. The
		// lower bound is what tolerates a late tick, and it is unchanged.
		if (until >= 10 && until <= 11) || (until >= 0 && until <= 1) {
			_ = db.EnsureAggregateSlot(chat, today)
			n, aggErr := runTelegramAggregation(db, deps, until)
			detail := fmt.Sprintf("window until=%d watches=%d", until, n)
			if aggErr != nil {
				detail += " error=" + aggErr.Error()
			}
			onEvent(JobLog{At: now, Name: "telegram-aggregation", Skipped: aggErr != nil, Detail: detail})
			log.Printf("scheduler: telegram aggregation minutesUntilClose=%d short=%v", until, sess.Short)
		}
	}

	nTrack := eng.PollTrackers()
	onEvent(JobLog{At: now, Name: "order-trackers", Detail: fmt.Sprintf("pending=%d", nTrack)})

	detail, skipped := RunTokenHealth(db, deps, today, now)
	onEvent(JobLog{At: now, Name: "broker-token-health", Skipped: skipped, Detail: detail})

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

// RunTokenHealth runs the daily health check for every broker and reports one
// line for all of them. Answering with Webull alone hid a Robinhood
// reauth in the job log, and called the whole job "already-ran" on a day
// Robinhood had just been checked.
func RunTokenHealth(db *store.DB, deps Deps, todayET string, now time.Time) (detail string, skipped bool) {
	hs := RunBrokerHealth(db, deps, todayET, now)
	if len(hs) == 0 {
		return "already-ran", true
	}
	parts := make([]string, 0, len(hs))
	skipped = true
	for _, h := range hs {
		if h.Detail != "skipped" {
			skipped = false
		}
		word := h.Detail
		if word == "" || word == "skipped" {
			word = h.Status
		}
		parts = append(parts, h.Broker+"="+word)
	}
	if skipped {
		return "already-ran", true
	}
	return strings.Join(parts, " "), false
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
			// The claim is taken before the send so two ticks cannot both
			// report; a send that then fails must give it back, or a blip in
			// Telegram loses the alert for the whole day.
			if err := eng.Send("", fmt.Sprintf("<b>Пропущен T-11</b>\nСводка за 11 минут до закрытия не ушла (until=%d).", until)); err != nil {
				if rerr := db.ReleaseAggregateT11(chat, today); rerr != nil {
					onEvent(JobLog{At: now, Name: "telegram-aggregation", Detail: "marker-save-failed: " + rerr.Error()})
				}
			}
		}
	case "t1":
		if t1Sent {
			return
		}
		// Execution finished without a report is not a missed T-1 — the orders
		// went out — but it used to silence this branch entirely, so a Telegram
		// outage across the whole one-minute window left the day's trade with
		// no message at all. The report itself can no longer be rebuilt here
		// (the window is over); say what happened instead of nothing.
		finished, _ := db.T1ExecutionFinished(chat, today)
		claimed, err := db.ClaimMissedT1(chat, today)
		if err != nil {
			onEvent(JobLog{At: now, Name: "telegram-aggregation", Detail: "marker-save-failed: " + err.Error()})
			return
		}
		if !claimed {
			return
		}
		detail := fmt.Sprintf("missed-t1 until=%d", until)
		text := fmt.Sprintf("<b>Пропущен T-1</b>\nРешение за минуту до закрытия не ушло (until=%d).", until)
		if finished {
			detail = fmt.Sprintf("t1-report-lost until=%d", until)
			text = fmt.Sprintf("<b>T-1 без отчёта</b>\nОрдера T-1 отработали, отчёт в Telegram не ушёл (until=%d). Смотрите журнал сделок.", until)
		}
		onEvent(JobLog{At: now, Name: "telegram-aggregation", Skipped: true, Detail: detail})
		if eng != nil {
			if err := eng.Send("", text); err != nil {
				if rerr := db.ReleaseMissedT1(chat, today); rerr != nil {
					onEvent(JobLog{At: now, Name: "telegram-aggregation", Detail: "marker-save-failed: " + rerr.Error()})
				}
			}
		}
	}
}

func RunTelegramAggregation(db *store.DB, deps Deps, until int) int {
	n, _ := runTelegramAggregation(db, deps, until)
	return n
}

func runTelegramAggregation(db *store.DB, deps Deps, until int) (int, error) {
	if !((until >= 10 && until <= 11) || (until >= 0 && until <= 1)) {
		return 0, nil
	}
	res, err := engine(db, deps).Aggregate(until, live.AggregateOpts{ForceSend: true, DryRun: until >= 10, UpdateState: true})
	return len(res.Tickers), err
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

// FillComputedDays returns the calendar with the computed NYSE holidays and
// early closes written into its maps for the given years. Go already falls
// back to tradingdate when the stored calendar has no entry for a date
// (IsTradingDay, IsShortDay); the SPA reads the maps and nothing else, so
// without this it treats every uncovered holiday as a normal session — the
// seeded calendar runs out at the end of 2027. Filling the payload the
// server hands out keeps one source of truth instead of a second holiday
// algorithm in JavaScript. Stored entries win: an operator's override or an
// imported exchange calendar is never replaced.
func FillComputedDays(raw []byte, fromYear, toYear int) []byte {
	var cal map[string]any
	if json.Unmarshal(raw, &cal) != nil || cal == nil {
		return raw
	}
	section := func(name string) map[string]any {
		m, _ := cal[name].(map[string]any)
		if m == nil {
			m = map[string]any{}
			cal[name] = m
		}
		return m
	}
	holidays, shorts := section("holidays"), section("shortDays")
	year := func(sec map[string]any, y int) map[string]any {
		key := strconv.Itoa(y)
		m, _ := sec[key].(map[string]any)
		if m == nil {
			m = map[string]any{}
			sec[key] = m
		}
		return m
	}
	for y := fromYear; y <= toYear; y++ {
		hy := year(holidays, y)
		for _, d := range tradingdate.NYSEHolidayDates(y) {
			if _, ok := hy[d[5:]]; !ok {
				hy[d[5:]] = map[string]any{"name": tradingdate.HolidayName(d), "type": "holiday", "computed": true}
			}
		}
		sy := year(shorts, y)
		for d := fmt.Sprintf("%04d-01-01", y); d[:4] == strconv.Itoa(y); d = tradingdate.AddDays(d, 1) {
			p := tradingdate.NYSEParts{Year: y, DayOfWeek: tradingdate.DayOfWeek(d)}
			p.Year, p.Month, p.Day = tradingdate.YMD(d)
			if !computedShortDay(p) {
				continue
			}
			if _, ok := sy[d[5:]]; !ok {
				sy[d[5:]] = map[string]any{"name": tradingdate.ShortDayName(d), "type": "short", "computed": true}
			}
		}
	}
	out, err := json.Marshal(cal)
	if err != nil {
		return raw
	}
	return out
}
