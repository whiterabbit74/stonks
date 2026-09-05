package live

import (
	"fmt"
	"math/rand"
	"os"
	"strconv"
	"strings"
	"time"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

const actualizeMaxAttemptsPerDay = 3

type ActualizeResult struct {
	Success  bool     `json:"success"`
	Updated  bool     `json:"updated"`
	Count    int      `json:"count"`
	Tickers  []string `json:"tickers"`
	Failed   []string `json:"failedTickers,omitempty"`
	TodayKey string   `json:"todayKey"`
	Provider string   `json:"provider"`
	Reason   string   `json:"reason,omitempty"`
}

func envInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		return fallback
	}
	return n
}

func actualizeDelay() time.Duration {
	base := envInt("PRICE_ACTUALIZATION_REQUEST_DELAY_MS", 15000)
	jitterMax := envInt("PRICE_ACTUALIZATION_DELAY_JITTER_MS", 2000)
	if base <= 0 && jitterMax <= 0 {
		return 0
	}
	extra := 0
	if jitterMax > 0 {
		extra = rand.Intn(jitterMax + 1)
	}
	return time.Duration(base+extra) * time.Millisecond
}

func unixMidnightUTC(date string) int64 {
	// external API boundary: session date vs UTC unix window for provider history
	t, err := time.ParseInLocation(tradingdate.Layout, date, time.UTC)
	if err != nil {
		return 0
	}
	return t.Unix()
}

func (e *Engine) historicalWindow(sym string) (startTs, endTs int64) {
	endTs = e.now().Unix()
	bars, _, _ := e.DB.GetOHLC(sym)
	if len(bars) > 0 {
		last := string(bars[len(bars)-1].Date)
		start := tradingdate.AddDays(last, -7)
		if ts := unixMidnightUTC(start); ts > 0 {
			return ts, endTs
		}
	}
	return endTs - 120*24*60*60, endTs
}

func (e *Engine) Actualize(force bool) ActualizeResult {
	today := tradingdate.TodayNYSE(e.now())
	settings := e.DB.Settings()
	provider, _ := settings["resultsRefreshProvider"].(string)
	if provider == "" {
		provider = "finnhub"
	}
	out := ActualizeResult{TodayKey: today, Provider: provider}
	qs := e.quotes()
	if qs == nil {
		out.Reason = "no_quote_source"
		return out
	}
	if !force {
		enabled, _ := settings["enablePostClosePriceActualization"].(bool)
		if !enabled {
			out.Reason = "disabled_by_settings"
			return out
		}
		if fmt.Sprint(settings["lastActualizationDate"]) == today {
			out.Reason = "already_ran_today"
			return out
		}
		if actualizeAttemptsToday(settings, today) >= actualizeAttemptCap(settings) {
			out.Reason = "attempt_limit"
			return out
		}
	}
	seen := map[string]struct{}{}
	var symbols []string
	add := func(raw string) {
		s := store.SafeTicker(raw)
		if s == "" {
			return
		}
		if _, ok := seen[s]; ok {
			return
		}
		seen[s] = struct{}{}
		symbols = append(symbols, s)
	}
	watches, _ := e.DB.ListWatches()
	for _, w := range watches {
		add(fmt.Sprint(w["symbol"]))
	}
	alerts, _ := e.DB.ListEMAAlerts()
	for _, a := range alerts {
		add(fmt.Sprint(a["symbol"]))
	}
	if len(symbols) == 0 {
		out.Reason = "no_tickers"
		return out
	}
	for i, sym := range symbols {
		if i > 0 {
			if d := actualizeDelay(); d > 0 {
				e.sleep(d)
			}
		}
		start, end := e.historicalWindow(sym)
		hist, err := qs.Historical(sym, provider, start, end, "none")
		if err != nil || len(hist.Rows) == 0 {
			out.Failed = append(out.Failed, sym)
			continue
		}
		if err := e.DB.MergeOHLC(sym, hist.Rows); err != nil {
			out.Failed = append(out.Failed, sym)
			continue
		}
		out.Tickers = append(out.Tickers, sym)
	}
	out.Count = len(out.Tickers)
	out.Updated = out.Count > 0
	out.Success = out.Updated
	if out.Count == 0 {
		out.Reason = "none_updated"
	}
	if !force {
		recordActualizeAttempt(e, today, out)
	}
	return out
}

func actualizeAttemptsToday(settings map[string]any, today string) int {
	if fmt.Sprint(settings["lastActualizationAttemptDate"]) != today {
		return 0
	}
	return settingInt(settings, "lastActualizationAttemptCount", 0)
}

func actualizeAttemptCap(settings map[string]any) int {
	n := settingInt(settings, "actualizationMaxAttemptsPerDay", actualizeMaxAttemptsPerDay)
	if n <= 0 {
		return actualizeMaxAttemptsPerDay
	}
	return n
}

func settingInt(settings map[string]any, key string, def int) int {
	v, ok := settings[key]
	if !ok || v == nil {
		return def
	}
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	}
	return def
}

func recordActualizeAttempt(e *Engine, today string, out ActualizeResult) {
	settings := e.DB.Settings()
	attempts := actualizeAttemptsToday(settings, today) + 1
	kv := map[string]any{
		"lastActualizationAttemptDate":  today,
		"lastActualizationAttemptCount": attempts,
	}
	if out.Count > 0 {
		kv["lastActualizationDate"] = today
	}
	_ = e.DB.SetSettingsKeys(kv)
	if out.Count > 0 || attempts < actualizeAttemptCap(settings) {
		return
	}
	failed := strings.Join(out.Failed, ", ")
	if failed == "" {
		failed = out.Reason
	}
	_ = e.Send("", fmt.Sprintf("<b>Актуализация цен не удалась</b>\n%s: исчерпаны %d попыток (%s).", today, attempts, failed))
}

func (e *Engine) UpdatePositions() map[string]any {
	watches, _ := e.DB.ListWatches()
	monitor, _ := e.DB.ListTrades("trades")
	openBySym := map[string]map[string]any{}
	for _, t := range store.OpenBrokerTrades(monitor) {
		sym := store.SafeTicker(fmt.Sprint(t["symbol"]))
		if sym == "" {
			continue
		}
		openBySym[sym] = t
	}
	var changes []map[string]any
	var open map[string]any
	for _, w := range watches {
		sym := store.SafeTicker(fmt.Sprint(w["symbol"]))
		row := openBySym[sym]
		wantOpen := row != nil
		if wantOpen && open == nil {
			open = row
		}
		wasOpen, _ := w["isOpenPosition"].(bool)
		if wantOpen != wasOpen {
			patch := map[string]any{"isOpenPosition": wantOpen}
			if wantOpen {
				patch["entryPrice"] = row["entryPrice"]
				patch["entryDate"] = row["entryDate"]
				patch["currentTradeId"] = row["id"]
			} else {
				patch["currentTradeId"] = nil
			}
			_ = e.DB.PatchWatch(sym, patch)
			changes = append(changes, map[string]any{"symbol": sym, "isOpenPosition": wantOpen})
		}
	}
	if changes == nil {
		changes = []map[string]any{}
	}
	return map[string]any{
		"success":   true,
		"updated":   len(changes),
		"changes":   changes,
		"openTrade": open,
	}
}

func (e *Engine) UpdateAll(force bool) map[string]any {
	prices := e.Actualize(force)
	pos := e.UpdatePositions()
	return map[string]any{
		"success":   prices.Success,
		"prices":    prices,
		"positions": pos,
	}
}
