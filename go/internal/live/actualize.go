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
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		return 0
	}
	return t.UTC().Unix()
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
	tickers, _ := e.DB.ListTickers()
	for _, t := range tickers {
		add(t)
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
	return out
}

func (e *Engine) UpdatePositions() map[string]any {
	watches, _ := e.DB.ListWatches()
	monitor, _ := e.DB.ListTrades("trades")
	open := store.OpenBrokerTrade(monitor)
	var changes []map[string]any
	openSym := ""
	if open != nil {
		openSym = store.SafeTicker(fmt.Sprint(open["symbol"]))
	}
	for _, w := range watches {
		sym := store.SafeTicker(fmt.Sprint(w["symbol"]))
		wantOpen := openSym != "" && sym == openSym
		wasOpen, _ := w["isOpenPosition"].(bool)
		if wantOpen != wasOpen {
			w["isOpenPosition"] = wantOpen
			if wantOpen {
				w["entryPrice"] = open["entryPrice"]
				w["entryDate"] = open["entryDate"]
				w["currentTradeId"] = open["id"]
			} else {
				w["currentTradeId"] = nil
			}
			_ = e.DB.UpsertWatch(w)
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
