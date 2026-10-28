package live

import (
	"fmt"
	"testing"
	"time"

	"mktorder.com/go/internal/ibs"
)

func mustSanitize(t *testing.T, input, current map[string]any) map[string]any {
	t.Helper()
	out, err := sanitizeAutoTradingConfig(input, current, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	return out
}

// TestBrokerFlagsLegacyEmptyNested is B-0 engine truth: a post-upgrade
// config with flat allows and empty nested broker objects. Webull inherits
// the flat keys; Robinhood does not.
func TestBrokerFlagsLegacyEmptyNested(t *testing.T) {
	cfg := map[string]any{
		"enabled":         true,
		"allowNewEntries": true,
		"allowExits":      true,
		"brokers": map[string]any{
			"webull":    map[string]any{},
			"robinhood": map[string]any{},
		},
	}
	brokers := ParseTradingConfig(cfg).Brokers
	if f := brokers["webull"]; !f.Enabled || !f.AllowNewEntries || !f.AllowExits {
		t.Fatalf("webull must inherit flat flags, got %+v", f)
	}
	if f := brokers["robinhood"]; f.Enabled || f.AllowNewEntries || f.AllowExits {
		t.Fatalf("robinhood empty nested must be all false, got %+v", f)
	}
}

// TestSanitizeRobinhoodAllowDoesNotFlipWebull is B-6: a patch that only sets
// brokers.robinhood.allowNewEntries, with no flat allowNewEntries/allowExits,
// must not change brokers.webull.allowNewEntries. The SPA used to OR the two
// broker checkboxes into a top-level allow flag, which brokerFlags then
// inherited onto a Webull object that had no key of its own.
func TestSanitizeFillsMissingWebullKeysFromFlat(t *testing.T) {
	current := map[string]any{
		"enabled":         true,
		"allowNewEntries": true,
		"allowExits":      true,
		"brokers": map[string]any{
			"webull":    map[string]any{},
			"robinhood": map[string]any{},
		},
	}
	out := mustSanitize(t, map[string]any{}, current)
	brokers, _ := out["brokers"].(map[string]any)
	webull, _ := brokers["webull"].(map[string]any)
	if webull["enabled"] != true || webull["allowNewEntries"] != true || webull["allowExits"] != true {
		t.Fatalf("missing webull keys must fill from flat, got %+v", webull)
	}
	rh, _ := brokers["robinhood"].(map[string]any)
	if _, ok := rh["enabled"]; ok {
		t.Fatalf("must not fill robinhood from flat, got %+v", rh)
	}
	if _, ok := rh["allowNewEntries"]; ok {
		t.Fatalf("must not fill robinhood allowNewEntries from flat, got %+v", rh)
	}
}

func TestSanitizeDoesNotOverwriteSetWebullKeys(t *testing.T) {
	current := map[string]any{
		"enabled":         true,
		"allowNewEntries": true,
		"allowExits":      false,
		"brokers": map[string]any{
			"webull": map[string]any{"enabled": true, "allowNewEntries": false, "allowExits": true},
		},
	}
	out := mustSanitize(t, map[string]any{"enabled": false}, current)
	brokers, _ := out["brokers"].(map[string]any)
	webull, _ := brokers["webull"].(map[string]any)
	if webull["allowNewEntries"] != false || webull["allowExits"] != true || webull["enabled"] != true {
		t.Fatalf("set nested webull keys must stay, got %+v", webull)
	}
}

func TestSanitizeFlatEnabledFalseDoesNotSetNestedWebull(t *testing.T) {
	current := map[string]any{
		"enabled": false,
		"brokers": map[string]any{
			"webull":    map[string]any{},
			"robinhood": map[string]any{},
		},
	}
	out := mustSanitize(t, map[string]any{"enabled": false, "lowIBS": 0.2}, current)
	webull, _ := out["brokers"].(map[string]any)["webull"].(map[string]any)
	if _, ok := webull["enabled"]; ok {
		t.Fatalf("flat PATCH enabled:false must not persist brokers.webull.enabled, got %+v", webull)
	}
	later := mustSanitize(t, map[string]any{"enabled": true}, out)
	webull, _ = later["brokers"].(map[string]any)["webull"].(map[string]any)
	if webull["enabled"] != true {
		t.Fatalf("master toggle enabled:true must still fill missing webull.enabled, got %+v", webull)
	}
}

func TestSanitizeAllowPatchDoesNotMaterializeDefaultEnabledFalse(t *testing.T) {
	current := map[string]any{
		"enabled": false,
		"brokers": map[string]any{
			"webull":    map[string]any{},
			"robinhood": map[string]any{},
		},
	}
	mid := mustSanitize(t, map[string]any{"allowNewEntries": true, "allowExits": true}, current)
	webull, _ := mid["brokers"].(map[string]any)["webull"].(map[string]any)
	if _, ok := webull["enabled"]; ok {
		t.Fatalf("allow-only patch must not persist default enabled:false onto webull, got %+v", webull)
	}
	out := mustSanitize(t, map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true}, mid)
	webull, _ = out["brokers"].(map[string]any)["webull"].(map[string]any)
	if webull["enabled"] != true {
		t.Fatalf("later enabled:true must fill missing webull.enabled, got %+v", webull)
	}
}

func TestEvaluateLiveRequiresEnabledBroker(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	e.PatchAutoConfig(map[string]any{
		"enabled": true,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": false, "allowNewEntries": true, "allowExits": true},
			"robinhood": map[string]any{"enabled": false, "allowNewEntries": true, "allowExits": true},
		},
	})
	if e.Evaluate().Live {
		t.Fatal("live must be false when every broker is enabled:false")
	}
}

func TestSanitizeRobinhoodAllowDoesNotFlipWebull(t *testing.T) {
	current := map[string]any{
		"enabled": true,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowNewEntries": false, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": false, "allowExits": true},
		},
	}
	out := mustSanitize(t, map[string]any{
		"brokers": map[string]any{
			"robinhood": map[string]any{"allowNewEntries": true},
		},
	}, current)
	if _, ok := out["allowNewEntries"]; ok {
		t.Fatalf("must not write a flat allowNewEntries, got %v", out["allowNewEntries"])
	}
	if _, ok := out["allowExits"]; ok {
		t.Fatalf("must not write a flat allowExits, got %v", out["allowExits"])
	}
	brokers, _ := out["brokers"].(map[string]any)
	webull, _ := brokers["webull"].(map[string]any)
	if webull["allowNewEntries"] != false {
		t.Fatalf("webull allowNewEntries flipped: %+v", webull)
	}
	if webull["allowExits"] != true || webull["enabled"] != true {
		t.Fatalf("webull other flags mutated: %+v", webull)
	}
	rh, _ := brokers["robinhood"].(map[string]any)
	if rh["allowNewEntries"] != true {
		t.Fatalf("robinhood allowNewEntries not applied: %+v", rh)
	}
}

func TestSanitizeRejectsOutOfRangeWindowAndUnknownProvider(t *testing.T) {
	if _, err := sanitizeAutoTradingConfig(map[string]any{"executionWindowSeconds": 99999}, map[string]any{"lowIBS": 0.1, "highIBS": 0.75}, time.Now()); err == nil {
		t.Fatal("executionWindowSeconds above the cap must error")
	}
	out := mustSanitize(t, map[string]any{"provider": "Webull"}, map[string]any{"lowIBS": 0.1, "highIBS": 0.75})
	if fmt.Sprint(out["provider"]) != "webull" {
		t.Fatalf("provider case got %v", out["provider"])
	}
	if _, err := sanitizeAutoTradingConfig(map[string]any{"provider": "nope"}, map[string]any{"lowIBS": 0.1, "highIBS": 0.75}, time.Now()); err == nil {
		t.Fatal("unknown provider must error")
	}
}

func TestSanitizeValidatesEffectiveThresholdPair(t *testing.T) {
	if _, err := sanitizeAutoTradingConfig(map[string]any{"lowIBS": 0.95}, nil, time.Now()); err == nil {
		t.Fatal("lowIBS must be checked against the default highIBS")
	}
	out := mustSanitize(t, map[string]any{"lowIBS": 0.05}, nil)
	if asFloat(out["lowIBS"]) != 0.05 {
		t.Fatalf("valid lowIBS was not kept: %+v", out)
	}
	if _, err := sanitizeAutoTradingConfig(map[string]any{"lowIBS": 0.6}, map[string]any{"highIBS": 0.5}, time.Now()); err == nil {
		t.Fatal("partial patch must be checked against the existing highIBS")
	}
}

// A mistyped flag can only switch trading off: the engine takes a JSON true,
// as the SPA's brokerFlag does, and nothing else. asBool used to read "true"
// and "1" as on for the master switch and the broker flags.
func TestTradingConfigMistypedFlagsFailClosed(t *testing.T) {
	for _, v := range []any{"true", "1", 1.0, map[string]any{}} {
		raw := map[string]any{
			"enabled": v, "allowNewEntries": v, "allowExits": v,
			"brokers": map[string]any{"robinhood": map[string]any{"enabled": v, "allowNewEntries": v, "allowExits": v}},
		}
		cfg := ParseTradingConfig(raw)
		if cfg.Enabled || autotradeOn(raw) || (&Engine{}).evalLive(cfg) {
			t.Fatalf("enabled %#v must read as off", v)
		}
		for name, f := range cfg.Brokers {
			if f != (BrokerFlags{}) {
				t.Fatalf("%s flags %#v must read as off, got %+v", name, v, f)
			}
		}
		// A set nested key does not fall back to the flat one.
		raw = map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true,
			"brokers": map[string]any{"webull": map[string]any{"enabled": v, "allowNewEntries": v, "allowExits": v}}}
		if f := ParseTradingConfig(raw).Brokers["webull"]; f != (BrokerFlags{}) {
			t.Fatalf("webull nested %#v must read as off, got %+v", v, f)
		}
		// Saving does not promote a mistyped flat flag to a real true.
		out := mustSanitize(t, map[string]any{}, map[string]any{"enabled": v, "allowNewEntries": v, "allowExits": v})
		if webull, _ := out["brokers"].(map[string]any)["webull"].(map[string]any); len(webull) != 0 {
			t.Fatalf("flat %#v copied onto webull: %+v", v, webull)
		}
	}
}

// An out-of-range or inverted pair in the config goes back to the documented
// defaults as a pair, never into the decision.
func TestTradingConfigBadThresholdsFallBackToDefaults(t *testing.T) {
	for _, raw := range []map[string]any{
		{"lowIBS": 1.5, "highIBS": 0.75},
		{"lowIBS": -0.1, "highIBS": 0.75},
		{"lowIBS": 0.1, "highIBS": 2.0},
		{"lowIBS": 0.8, "highIBS": 0.3},
		{"lowIBS": 0.1, "highIBS": "0.75x"},
	} {
		low, high := watchThresholds(nil, ParseTradingConfig(raw))
		if low != ibs.DefaultLowIBS || high != ibs.DefaultHighIBS {
			t.Fatalf("%v: got %v/%v want defaults", raw, low, high)
		}
	}
}
