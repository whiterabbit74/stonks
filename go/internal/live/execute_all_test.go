package live

import (
	"testing"

	"mktorder.com/go/internal/types"
)

func TestExecuteAllMirrorsBothBrokers(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	rh := &MemoryBroker{Acct: br.Acct, Pos: br.Pos}
	e.Brokers = map[string]Broker{"webull": br, "robinhood": rh}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "allowExits": true,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})
	ev := e.Execute("t1")
	if !ev.Executed {
		t.Fatalf("want executed %+v", ev.Broker)
	}
	got, _ := ev.Broker.(map[string]any)
	if got["webull"] == nil || got["robinhood"] == nil {
		t.Fatalf("both brokers: %+v", ev.Broker)
	}
	if len(br.Orders) == 0 || len(rh.Orders) == 0 {
		t.Fatalf("orders webull=%d rh=%d", len(br.Orders), len(rh.Orders))
	}
}

func TestExecuteAllSkipsRobinhoodWhenEntriesDisabled(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	rh := &MemoryBroker{Acct: br.Acct, Pos: br.Pos}
	e.Brokers = map[string]Broker{"webull": br, "robinhood": rh}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": false, "allowExits": true},
		},
	})
	ev := e.Execute("t1")
	if len(rh.Orders) != 0 {
		t.Fatal("robinhood must be skipped")
	}
	if len(br.Orders) == 0 && !ev.Executed {
		t.Fatalf("webull should still trade %+v", ev)
	}
}

func TestExecuteAllSkipsNeedsReauth(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	rh := &MemoryBroker{Acct: br.Acct, Pos: br.Pos}
	e.Brokers = map[string]Broker{"webull": br, "robinhood": rh}
	_ = e.DB.UpsertRobinhoodHealth("2026-09-01", HealthNeedsReauth, "now")
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})
	_ = e.Execute("t1")
	if len(rh.Orders) != 0 {
		t.Fatal("NEEDS_REAUTH broker must not trade")
	}
}
