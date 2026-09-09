package live

import (
	"fmt"
	"mktorder.com/go/internal/store"
	"testing"

	"mktorder.com/go/internal/types"
)

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

func TestEvaluateIgnoresDisabledBrokerAllowExits(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 11.9, Volume: 1}}
	db, e, br := testEngine(t, bars)
	br.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 1.0}}
	if err := db.SavePosition(store.Position{ID: "b1", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-01", EntryPrice: store.Ptr[float64](10.0), Quantity: 1, Webull: store.BrokerLeg{Qty: 1, EntryPrice: store.Ptr[float64](10.0)}}); err != nil {
		t.Fatal(err)
	}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "highIBS": 0.75, "allowExits": false, "allowNewEntries": false,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": false, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowExits": false},
		},
	})
	ev := e.Evaluate()
	if fmt.Sprint(ev.Decision["action"]) == "exit" {
		t.Fatalf("disabled webull allowExits must not enable Evaluate exit: %+v", ev.Decision)
	}
	if fmt.Sprint(ev.Decision["reason"]) != "exits_disabled" {
		t.Fatalf("want exits_disabled, got %+v", ev.Decision)
	}
}
