package live

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"mktorder.com/go/internal/ibs"
	"mktorder.com/go/internal/store"
)

var ErrInvalidAutoConfig = errors.New("invalid autotrading config")

const maxExecutionWindowSeconds = 3600

var autoTradingBoolFields = []string{
	"enabled", "allowNewEntries", "allowExits",
}

var autoTradingNumberFields = []string{
	"lowIBS", "highIBS", "executionWindowSeconds", "maxSlippageBps", "entryReservePct",
}

// autoTradingRemovedFields are keys older builds accepted. They are dropped on
// every save so a value left in the database cannot describe a strategy the
// engine no longer runs: sizing is always the full account, orders are always
// MARKET/DAY/CORE, and the universe is always the monitoring list.
var autoTradingRemovedFields = []string{
	"entrySizingMode", "sizingMode", "fixedQuantity", "fixedNotionalUsd",
	"maxPositionUsd", "orderType", "timeInForce", "supportTradingSession",
	"providerFallback", "symbols", "onlyFromTelegramWatches", "notes",
	"allowFractionalShares",
	"previewBeforeSend", "cancelOpenOrdersBeforeEntry", "dryRun",
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

// sanitizeAutoTradingConfig ports autotrade.js:493-526. now is the engine's
// clock (e.now()), not time.Now() directly, so saving the config obeys test
// clocks the same way every other timestamped write in this package does
// (P2-8).
func sanitizeAutoTradingConfig(input, current map[string]any, now time.Time) (map[string]any, error) {
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
	low, lok := finiteNumber(next["lowIBS"])
	high, hok := finiteNumber(next["highIBS"])
	if hok && high == 0 {
		return nil, fmt.Errorf("%w: highIBS 0 is an inverted pair", ErrInvalidAutoConfig)
	}
	if lok && hok {
		if _, _, err := ibs.SanitizeThresholds(low, high); err != nil {
			return nil, fmt.Errorf("%w: %s", ErrInvalidAutoConfig, err)
		}
	}
	if f, ok := finiteNumber(next["executionWindowSeconds"]); ok {
		if f < 15 || f > maxExecutionWindowSeconds {
			return nil, fmt.Errorf("%w: executionWindowSeconds must be in [15, %d]", ErrInvalidAutoConfig, maxExecutionWindowSeconds)
		}
		next["executionWindowSeconds"] = math.Round(f)
	}
	if f, ok := finiteNumber(next["maxSlippageBps"]); ok {
		if f < 0 || f > 1000 {
			return nil, fmt.Errorf("%w: maxSlippageBps must be in [0, 1000]", ErrInvalidAutoConfig)
		}
		next["maxSlippageBps"] = f
	}
	if f, ok := finiteNumber(next["entryReservePct"]); ok {
		if f < MinEntryReservePct || f > 0.1 {
			return nil, fmt.Errorf("%w: entryReservePct must be in [%g, 0.1]", ErrInvalidAutoConfig, MinEntryReservePct)
		}
		next["entryReservePct"] = f
	}

	if s, ok := input["provider"].(string); ok {
		s = strings.ToLower(strings.TrimSpace(s))
		if !enumIn(s, "finnhub", "webull", "robinhood") {
			return nil, fmt.Errorf("%w: unknown provider", ErrInvalidAutoConfig)
		}
		next["provider"] = s
	}
	if s, ok := input["entryCapitalMode"].(string); ok {
		if validEntryCapitalMode(s) {
			next["entryCapitalMode"] = s
		}
	}
	next["brokers"] = sanitizeBrokers(input, current, next)
	next["lastModifiedAt"] = now.UTC().Format(time.RFC3339Nano)
	return next, nil
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
	return asFloat(cfg["highIBS"]), false
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
			high = asFloat(watch["highIBS"])
			highInvalid = false
		}
	}
	return low, high, highInvalid
}

// realtimeQuoteProviders are the providers whose Quote() returns an intraday
// snapshot. alpha_vantage, twelve_data and polygon are deliberately absent:
// their Quote() is synthesised from daily history, so it would answer a live
// IBS question with yesterday's bar. Robinhood is here too (its Quote() is a
// real-time equity quote, providers/robinhood.go robinhoodQuote) and is also
// selectable as the primary provider on the autotrade settings page (P2-6) -
// it is not a silent fallback the operator never chose.
//
// Webull leads: it is the paid subscription and the broker that executes the
// order, it answers a whole watch list in one snapshot request, and Finnhub's
// free tier serves one symbol per call — so the fallback is the one that costs
// a request per ticker, not the primary.
var realtimeQuoteProviders = []string{"webull", "finnhub", "robinhood"}

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
		primary = realtimeQuoteProviders[0]
	}
	chain := []string{primary}
	for _, p := range realtimeQuoteProviders {
		if p != primary {
			chain = append(chain, p)
		}
	}
	return chain
}
