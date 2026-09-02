package scheduler

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"mktorder.com/go/internal/ibs"
	"mktorder.com/go/internal/indicators"
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
	if len(cal.Holidays) > 0 || len(cal.ShortDays) > 0 || cal.TradingHours.Normal.End != "" {
		return !IsHoliday(p, cal)
	}
	return p.DayOfWeek >= 1 && p.DayOfWeek <= 5
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
	Now       func() time.Time
}

func Start(db *store.DB, onEvent func(JobLog)) (stop func()) {
	return StartWith(db, Deps{}, onEvent)
}

func StartWith(db *store.DB, deps Deps, onEvent func(JobLog)) (stop func()) {
	if onEvent == nil {
		onEvent = func(JobLog) {}
	}
	if deps.Now == nil {
		deps.Now = time.Now
	}
	if deps.Providers == nil {
		deps.Providers = providers.FromEnv()
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
	if deps.Now == nil {
		deps.Now = func() time.Time { return now }
	}
	p := tradingdate.CurrentTimeNYSE(now)
	today := tradingdate.TodayNYSE(now)

	detail, skipped := RunTokenHealth(db, today, now)
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
		n := RunTelegramAggregation(db, today)
		onEvent(JobLog{At: now, Name: "telegram-aggregation", Detail: fmt.Sprintf("window until=%d watches=%d", until, n)})
		log.Printf("scheduler: telegram aggregation minutesUntilClose=%d short=%v", until, sess.Short)
	}
	after := nowMin - sess.CloseMin
	if after >= 15 && after <= 31 {
		n, errN := RunPriceActualization(db, deps, today)
		onEvent(JobLog{At: now, Name: "price-actualization", Detail: fmt.Sprintf("after=%d tickers=%d errors=%d", after, n, errN)})
		log.Printf("scheduler: price actualization minutesAfterClose=%d", after)
	}
}

func RunTokenHealth(db *store.DB, todayET string, now time.Time) (detail string, skipped bool) {
	row := db.GetWebullToken()
	if row.LastHealthCheckDate == todayET {
		return "already-ran", true
	}
	status := "MISSING"
	token := row.Token
	if token == "" {
		token = os.Getenv("WEBULL_ACCESS_TOKEN")
	}
	if token != "" {
		status = "PRESENT"
	}
	_ = db.UpsertWebullHealth(todayET, status, now.UTC().Format(time.RFC3339Nano))
	_ = db.RecordSchedulerRun("webull-token-health", todayET, status)
	return status, false
}

func RunTelegramAggregation(db *store.DB, todayET string) int {
	watches, _ := db.ListWatches()
	count := 0
	for _, w := range watches {
		sym := fmt.Sprint(w["symbol"])
		bars, _, err := db.GetOHLC(sym)
		if err != nil || len(bars) == 0 {
			continue
		}
		vals := indicators.IBS(bars)
		last := vals[len(vals)-1]
		low, _ := w["lowIBS"].(float64)
		high, _ := w["highIBS"].(float64)
		entry := ibs.IsEntrySignal(last, low)
		exit := ibs.IsExitSignal(last, high)
		_ = db.RecordSchedulerRun("telegram-aggregation", todayET, fmt.Sprintf("%s ibs=%g entry=%v exit=%v", sym, last, entry, exit))
		count++
	}
	return count
}

func RunPriceActualization(db *store.DB, deps Deps, todayET string) (ok, fail int) {
	tickers, _ := db.ListTickers()
	end := time.Now().Unix()
	start := end - 14*24*60*60
	client := deps.Providers
	if client == nil {
		client = providers.FromEnv()
	}
	for _, t := range tickers {
		_, err := client.Historical(t, "finnhub", start, end, "none")
		if err != nil {
			fail++
			_ = db.RecordSchedulerRun("price-actualization", todayET, t+" skip: "+err.Error())
			continue
		}
		ok++
		_ = db.RecordSchedulerRun("price-actualization", todayET, t+" fetched")
	}
	return
}


