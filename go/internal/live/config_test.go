package live

import (
	"fmt"
	"testing"
	"time"
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
	en, entries, exits := brokerFlags(cfg, "webull")
	if !en || !entries || !exits {
		t.Fatalf("webull must inherit flat flags, got enabled=%v entries=%v exits=%v", en, entries, exits)
	}
	en, entries, exits = brokerFlags(cfg, "robinhood")
	if en || entries || exits {
		t.Fatalf("robinhood empty nested must be all false, got enabled=%v entries=%v exits=%v", en, entries, exits)
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
