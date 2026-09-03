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
	"enabled", "allowNewEntries", "allowExits", "onlyFromTelegramWatches",
	"allowFractionalShares", "previewBeforeSend", "cancelOpenOrdersBeforeEntry",
}

var autoTradingNumberFields = []string{
	"lowIBS", "highIBS", "executionWindowSeconds", "fixedQuantity",
	"fixedNotionalUsd", "maxPositionUsd", "maxSlippageBps",
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
	delete(next, "dryRun")

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
	if f, ok := finiteNumber(next["fixedQuantity"]); ok {
		next["fixedQuantity"] = math.Max(0.00001, f)
	}
	if f, ok := finiteNumber(next["fixedNotionalUsd"]); ok {
		next["fixedNotionalUsd"] = math.Max(1, f)
	}
	if f, ok := finiteNumber(next["maxPositionUsd"]); ok {
		next["maxPositionUsd"] = math.Max(1, f)
	}
	if f, ok := finiteNumber(next["maxSlippageBps"]); ok {
		next["maxSlippageBps"] = clamp(f, 0, 1000)
	}

	if s, ok := input["provider"].(string); ok && enumIn(s, "finnhub", "webull") {
		next["provider"] = s
	}
	if s, ok := input["entrySizingMode"].(string); ok && enumIn(s, "balance", "quantity", "notional") {
		next["entrySizingMode"] = s
	}
	if s, ok := input["entryCapitalMode"].(string); ok {
		if _, ok := entryCapitalModes[s]; ok {
			next["entryCapitalMode"] = s
		}
	}
	if s, ok := input["sizingMode"].(string); ok && enumIn(s, "quantity", "notional") {
		next["sizingMode"] = s
	}
	if s, ok := input["orderType"].(string); ok && enumIn(s, "MARKET", "LIMIT") {
		next["orderType"] = s
	}
	if s, ok := input["timeInForce"].(string); ok && enumIn(s, "DAY", "GTC") {
		next["timeInForce"] = s
	}
	if s, ok := input["supportTradingSession"].(string); ok && enumIn(s, "CORE", "ALL", "N") {
		next["supportTradingSession"] = s
	}
	if s, ok := input["symbols"].(string); ok {
		next["symbols"] = s
	}
	if s, ok := input["notes"].(string); ok {
		next["notes"] = s
	}
	next["lastModifiedAt"] = time.Now().UTC().Format(time.RFC3339Nano)
	return next
}

func splitSymbols(raw string) []string {
	var out []string
	seen := map[string]struct{}{}
	for _, p := range strings.Split(raw, ",") {
		s := store.SafeTicker(p)
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

// configuredSymbols ports autotrade.js getConfiguredSymbols (intersection, not union).
func configuredSymbols(cfg map[string]any, e *Engine) []string {
	if cfg == nil {
		cfg = map[string]any{}
	}
	explicit := []string{}
	if raw, ok := cfg["symbols"].(string); ok && raw != "" {
		explicit = splitSymbols(raw)
	}
	onlyWatches := asBool(cfg["onlyFromTelegramWatches"])
	if !onlyWatches && len(explicit) > 0 {
		return explicit
	}
	var watches []string
	if e != nil && e.DB != nil {
		rows, _ := e.DB.ListWatches()
		seen := map[string]struct{}{}
		for _, w := range rows {
			s := store.SafeTicker(fmt.Sprint(w["symbol"]))
			if s == "" {
				continue
			}
			if _, ok := seen[s]; ok {
				continue
			}
			seen[s] = struct{}{}
			watches = append(watches, s)
		}
	}
	if len(watches) > 0 {
		if len(explicit) == 0 {
			return watches
		}
		allow := map[string]struct{}{}
		for _, s := range explicit {
			allow[s] = struct{}{}
		}
		var inter []string
		for _, s := range watches {
			if _, ok := allow[s]; ok {
				inter = append(inter, s)
			}
		}
		return inter
	}
	return explicit
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
