package live

import (
	"fmt"

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
	end := e.now().Unix()
	start := end - 40*365*24*60*60
	for _, sym := range symbols {
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
