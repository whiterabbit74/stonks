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
	if !lok {
		low = ibs.DefaultLowIBS
	}
	high, hok := finiteNumber(next["highIBS"])
	if !hok {
		high = ibs.DefaultHighIBS
	}
	if high == 0 {
		return nil, fmt.Errorf("%w: highIBS 0 is an inverted pair", ErrInvalidAutoConfig)
	}
	if _, _, err := ibs.SanitizeThresholds(low, high); err != nil {
		return nil, fmt.Errorf("%w: %s", ErrInvalidAutoConfig, err)
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
func configuredSymbols(rows []store.Watch) []string {
	seen := map[string]struct{}{}
	var out []string
	for _, w := range rows {
		s := store.SafeTicker(w.Symbol)
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

// TradingConfig is the autoTrading settings object as the trading code reads
// it: decoded from the stored map in one place, so a mistyped key or value is
// resolved here once instead of by an ad-hoc coercion at every read.
//
// Flags are strict: only a JSON boolean true is true. A string "true", a 1 or
// a missing key is false, so a mistyped flag can only switch trading off.
// Numbers keep asFloat's reading (a numeric string is that number, anything
// else is 0): a garbage threshold is caught as a pair by ibs.Pair, and a
// garbage reserve leaves the MinEntryReservePct floor in place.
type TradingConfig struct {
	Enabled bool
	// Provider is the configured primary quote provider, lowercased.
	Provider string
	// LowIBS/HighIBS are the global pair before the per-watch overlay; it is
	// checked as a pair only after the overlay (watchThresholds).
	LowIBS, HighIBS        float64
	ExecutionWindowSeconds float64
	MaxSlippageBps         float64
	EntryReservePct        float64
	CapitalMode            CapitalModeInfo
	Brokers                map[string]BrokerFlags
}

// BrokerFlags are one broker's autotrade switches. A broker with no entry in
// TradingConfig.Brokers is all false.
type BrokerFlags struct {
	Enabled, AllowNewEntries, AllowExits bool
}

// ParseTradingConfig decodes the autoTrading settings object. nil is the
// all-off config.
func ParseTradingConfig(cfg map[string]any) TradingConfig {
	flag := func(m map[string]any, key string) bool {
		b, _ := m[key].(bool)
		return b
	}
	num := func(key string, fallback float64) float64 {
		if !cfgHas(cfg, key) {
			return fallback
		}
		return asFloat(cfg[key])
	}
	provider, _ := cfg["provider"].(string)
	mode, _ := cfg["entryCapitalMode"].(string)
	out := TradingConfig{
		Enabled:                flag(cfg, "enabled"),
		Provider:               strings.ToLower(strings.TrimSpace(provider)),
		LowIBS:                 num("lowIBS", ibs.DefaultLowIBS),
		HighIBS:                num("highIBS", ibs.DefaultHighIBS),
		ExecutionWindowSeconds: num("executionWindowSeconds", 0),
		MaxSlippageBps:         num("maxSlippageBps", 0),
		EntryReservePct:        num("entryReservePct", 0),
		CapitalMode:            resolveCapitalMode(mode),
		Brokers:                map[string]BrokerFlags{},
	}
	// Webull predates per-broker objects: a key its nested object does not
	// set falls back to the flat flag. Robinhood never inherits (P2-2, B-0).
	flat := BrokerFlags{flag(cfg, "enabled"), flag(cfg, "allowNewEntries"), flag(cfg, "allowExits")}
	brokers, _ := cfg["brokers"].(map[string]any)
	for _, name := range []string{"webull", "robinhood"} {
		b, ok := brokers[name].(map[string]any)
		if !ok {
			if name == "webull" {
				out.Brokers[name] = flat
			}
			continue
		}
		f := BrokerFlags{flag(b, "enabled"), flag(b, "allowNewEntries"), flag(b, "allowExits")}
		if name == "webull" {
			if !cfgHas(b, "enabled") {
				f.Enabled = flat.Enabled
			}
			if !cfgHas(b, "allowNewEntries") {
				f.AllowNewEntries = flat.AllowNewEntries
			}
			if !cfgHas(b, "allowExits") {
				f.AllowExits = flat.AllowExits
			}
		}
		out.Brokers[name] = f
	}
	return out
}

func strOr(v any, fallback string) string {
	s := strings.TrimSpace(fmt.Sprint(v))
	if s == "" || s == "<nil>" {
		return fallback
	}
	return s
}

// watchThresholds resolves the pair the live decision compares against. Both
// sources are map[string]any read out of SQLite, where asFloat turns a value it
// cannot read into 0 — and a highIBS of 0 makes every reading an exit, which is
// why the pair is resolved as a pair: ibs.Pair sends anything the write path
// would have rejected back to the documented defaults.
// watchThresholds are the watch's own thresholds; a ticker held off the
// watchlist (watch == nil) uses the global ones.
func watchThresholds(watch *store.Watch, cfg TradingConfig) (low, high float64) {
	low, high = cfg.LowIBS, cfg.HighIBS
	if watch != nil {
		low, high = watch.LowIBS, watch.HighIBS
	}
	return ibs.Pair(low, high)
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
func quoteProviderChain(cfg TradingConfig) []string {
	primary := cfg.Provider
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
