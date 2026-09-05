package live

import (
	"testing"
	"time"
)

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
func TestSanitizeRobinhoodAllowDoesNotFlipWebull(t *testing.T) {
	current := map[string]any{
		"enabled": true,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowNewEntries": false, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": false, "allowExits": true},
		},
	}
	out := sanitizeAutoTradingConfig(map[string]any{
		"brokers": map[string]any{
			"robinhood": map[string]any{"allowNewEntries": true},
		},
	}, current, time.Now())
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
