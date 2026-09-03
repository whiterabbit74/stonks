package live

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"mktorder.com/go/internal/ibs"
	"mktorder.com/go/internal/store"
)

var autoTradingBoolFields = []string{
	"enabled", "allowNewEntries", "allowExits", "allowFractionalShares",
}

var autoTradingNumberFields = []string{
	"lowIBS", "highIBS", "executionWindowSeconds", "maxSlippageBps",
}

// autoTradingRemovedFields are keys older builds accepted. They are dropped on
// every save so a value left in the database cannot describe a strategy the
// engine no longer runs: sizing is always the full account, orders are always
// MARKET/DAY/CORE, and the universe is always the monitoring list.
var autoTradingRemovedFields = []string{
	"entrySizingMode", "sizingMode", "fixedQuantity", "fixedNotionalUsd",
	"maxPositionUsd", "orderType", "timeInForce", "supportTradingSession",
	"providerFallback", "symbols", "onlyFromTelegramWatches", "notes",
	"previewBeforeSend", "cancelOpenOrdersBeforeEntry", "dryRun",
}

var entryCapitalModes = map[string]struct{}{
	"standard_safe": {}, "cash_100": {}, "margin_125": {},
	"margin_150": {}, "margin_175": {}, "margin_200": {},
}

func finiteNumber(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		if math.IsNaN(n) || math.IsInf(n, 0) {
			return 0, false
		}
		return n, true
	case float32:
		f := float64(n)
		if math.IsNaN(f) || math.IsInf(f, 0) {
			return 0, false
		}
		return f, true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case int32:
		return float64(n), true
	case json.Number:
		f, err := n.Float64()
		if err != nil || math.IsNaN(f) || math.IsInf(f, 0) {
			return 0, false
		}
		return f, true
	default:
		return 0, false
	}
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func enumIn(v string, allowed ...string) bool {
	for _, a := range allowed {
		if v == a {
			return true
		}
	}
	return false
}

// sanitizeAutoTradingConfig ports autotrade.js:493-526.
func sanitizeAutoTradingConfig(input, current map[string]any) map[string]any {
	next := map[string]any{}
	if current != nil {
		for k, v := range current {
			next[k] = v
		}
	}
	if input == nil {
		input = map[string]any{}
	}
	if inner, ok := input["config"].(map[string]any); ok {
		merged := map[string]any{}
		for k, v := range input {
			if k == "config" {
				continue
			}
			merged[k] = v
		}
		for k, v := range inner {
			merged[k] = v
		}
		input = merged
	}
	for _, field := range autoTradingBoolFields {
		if b, ok := input[field].(bool); ok {
			next[field] = b
		}
	}
	for _, field := range autoTradingRemovedFields {
		delete(next, field)
	}

	for _, field := range autoTradingNumberFields {
		if f, ok := finiteNumber(input[field]); ok {
			next[field] = f
		}
	}
	if f, ok := finiteNumber(next["lowIBS"]); ok {
		next["lowIBS"] = clamp(f, 0, 1)
	}
	if f, ok := finiteNumber(next["highIBS"]); ok {
		next["highIBS"] = clamp(f, 0, 1)
	}
	if f, ok := finiteNumber(next["executionWindowSeconds"]); ok {
		next["executionWindowSeconds"] = math.Max(15, math.Round(f))
	}
	if f, ok := finiteNumber(next["maxSlippageBps"]); ok {
		next["maxSlippageBps"] = clamp(f, 0, 1000)
	}
	low, lok := finiteNumber(next["lowIBS"])
	high, hok := finiteNumber(next["highIBS"])
	if lok && hok && high > 0 && low >= high {
		if f, ok := finiteNumber(current["lowIBS"]); ok {
			next["lowIBS"] = f
		} else {
			next["lowIBS"] = ibs.DefaultLowIBS
		}
		if f, ok := finiteNumber(current["highIBS"]); ok {
			next["highIBS"] = f
		} else {
			next["highIBS"] = ibs.DefaultHighIBS
		}
	}

	if s, ok := input["provider"].(string); ok && enumIn(s, "finnhub", "webull") {
		next["provider"] = s
	}
	if s, ok := input["entryCapitalMode"].(string); ok {
		if _, ok := entryCapitalModes[s]; ok {
			next["entryCapitalMode"] = s
		}
	}
	next["lastModifiedAt"] = time.Now().UTC().Format(time.RFC3339Nano)
	return next
}

// configuredSymbols is the universe the engine may trade: exactly the tickers
// on the monitoring page. A second list in the autotrade config used to narrow
// it by intersection, which meant a ticker could be monitored, signal an entry,
// and be silently skipped - two lists to keep in sync for no gain.
func configuredSymbols(cfg map[string]any, e *Engine) []string {
	_ = cfg
	if e == nil || e.DB == nil {
		return nil
	}
	rows, _ := e.DB.ListWatches()
	seen := map[string]struct{}{}
	var out []string
	for _, w := range rows {
		s := store.SafeTicker(fmt.Sprint(w["symbol"]))
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}

func cfgHas(cfg map[string]any, key string) bool {
	if cfg == nil {
		return false
	}
	v, ok := cfg[key]
	return ok && v != nil
}

func cfgFloatOr(cfg map[string]any, key string, fallback float64) float64 {
	if !cfgHas(cfg, key) {
		return fallback
	}
	return asFloat(cfg[key])
}

func liveLowIBS(cfg map[string]any) float64 {
	if !cfgHas(cfg, "lowIBS") {
		return ibs.DefaultLowIBS
	}
	return asFloat(cfg["lowIBS"])
}

func liveHighIBS(cfg map[string]any) (high float64, invalid bool) {
	if !cfgHas(cfg, "highIBS") {
		return ibs.DefaultHighIBS, false
	}
	high = asFloat(cfg["highIBS"])
	if high == 0 {
		return ibs.DefaultHighIBS, true
	}
	return high, false
}

func allowFlag(cfg map[string]any, key string) bool {
	// Missing keys are false (Node: undefined is falsy). Do not default true.
	return asBool(cfg[key])
}

func strOr(v any, fallback string) string {
	s := strings.TrimSpace(fmt.Sprint(v))
	if s == "" || s == "<nil>" {
		return fallback
	}
	return s
}

func watchThresholds(watch, cfg map[string]any) (low, high float64, highInvalid bool) {
	low = liveLowIBS(cfg)
	high, highInvalid = liveHighIBS(cfg)
	if watch != nil {
		if watch["lowIBS"] != nil {
			low = asFloat(watch["lowIBS"])
		}
		if watch["highIBS"] != nil {
			h := asFloat(watch["highIBS"])
			if h == 0 {
				highInvalid = true
			} else {
				high = h
				highInvalid = false
			}
		}
	}
	return low, high, highInvalid
}

// realtimeQuoteProviders are the providers whose Quote() returns an intraday
// snapshot. alpha_vantage, twelve_data and polygon are deliberately absent:
// their Quote() is synthesised from daily history, so it would answer a live
// IBS question with yesterday's bar. Add "robinhood" here once the provider
// client implements a real-time quote.
var realtimeQuoteProviders = []string{"finnhub", "webull"}

func isRealtimeQuoteProvider(p string) bool {
	for _, r := range realtimeQuoteProviders {
		if r == p {
			return true
		}
	}
	return false
}

// quoteProviderChain is the order in which providers are tried for one symbol:
// the configured one first, then every other real-time provider. A live
// decision is impossible without a quote, so a single provider outage must not
// cancel the day - and the order needs no configuring, since there are only
// ever two of them and asking the second one costs nothing when the first
// already answered.
func quoteProviderChain(cfg map[string]any) []string {
	primary, _ := cfg["provider"].(string)
	primary = strings.ToLower(strings.TrimSpace(primary))
	if !isRealtimeQuoteProvider(primary) {
		primary = "finnhub"
	}
	chain := []string{primary}
	for _, p := range realtimeQuoteProviders {
		if p != primary {
			chain = append(chain, p)
		}
	}
	return chain
}
