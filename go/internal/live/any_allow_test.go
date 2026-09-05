package live

import "testing"

func TestAnyAllowIgnoresDisabledBroker(t *testing.T) {
	cfg := map[string]any{
		"allowExits": false,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": false, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowExits": false},
		},
	}
	if anyAllow(cfg, "allowExits") {
		t.Fatal("disabled webull allowExits must not enable exits")
	}
}
