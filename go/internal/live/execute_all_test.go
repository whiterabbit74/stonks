package live

import (
	"fmt"
	"strings"
	"testing"

	"mktorder.com/go/internal/types"
)

func hasAutotradeLog(t *testing.T, e *Engine, substr string) bool {
	t.Helper()
	logs, err := e.DB.ListAutotradeLogs(200)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range logs {
		if strings.Contains(fmt.Sprint(row["message"]), substr) {
			return true
		}
	}
	return false
}

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

// P0-1 regression tests: Execute() must go through executeAll even with one
// broker (or none), so per-broker flags, health, and books are honoured —
// see AUTOTRADE_ROADMAP.md, section "P0-1".

// A single Webull broker with brokers.webull.enabled=false must not trade,
// even though there is an entry signal and autoTrading.enabled is true.
func TestExecuteSingleBrokerRespectsDisabledFlag(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "allowExits": true,
		"brokers": map[string]any{
			"webull": map[string]any{"enabled": false, "allowNewEntries": true, "allowExits": true},
		},
	})
	res := e.Execute("t1")
	if res.Executed || len(br.Orders) != 0 {
		t.Fatalf("a disabled webull must not trade: %+v orders=%d", res, len(br.Orders))
	}
	if !hasAutotradeLog(t, e, "event=execution_skipped") {
		t.Fatal("want an execution_skipped log entry")
	}
	if !hasAutotradeLog(t, e, "reason=broker_disabled") {
		t.Fatal("want the skip reason recorded")
	}
}

// A single Webull broker with allowNewEntries=false must not borrow the
// permission from an unrelated (and unattached) Robinhood config entry —
// anyAllow() used to leak exactly that.
func TestExecuteSingleBrokerIgnoresOtherBrokerAllow(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowExits": true,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowNewEntries": false, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})
	res := e.Execute("t1")
	if res.Executed || len(br.Orders) != 0 {
		t.Fatalf("robinhood's allowNewEntries must not open a webull entry: %+v orders=%d", res, len(br.Orders))
	}
}

// e.Broker is nil (no Webull creds), only Robinhood is attached, and
// broker_trades already has an open Robinhood position. The books must be
// looked up by broker name, not hard-coded to "webull" — otherwise the
// engine would see no open position and enter right on top of it.
func TestExecuteRobinhoodOnlySeesItsOwnOpenPosition(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, _ := testEngine(t, bars)
	e.Broker = nil
	rh := &MemoryBroker{}
	e.AttachBroker("robinhood", rh)
	if err := db.InsertTrade("broker_trades", map[string]any{
		"id": "r1", "symbol": "AAPL", "status": "open", "entryDate": "2026-09-01",
		"entryPrice": 10.0, "quantity": 1.0, "broker": "robinhood",
	}); err != nil {
		t.Fatal(err)
	}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "allowExits": true,
		"brokers": map[string]any{
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})
	res := e.Execute("t1")
	action, _ := res.BrokerDecisions["robinhood"]["action"].(string)
	if action != "none" {
		t.Fatalf("must not enter over the existing robinhood position: decision=%+v", res.BrokerDecisions["robinhood"])
	}
	if res.Executed || len(rh.Orders) != 0 {
		t.Fatalf("no order should have been submitted: %+v orders=%d", res, len(rh.Orders))
	}
}

// No broker configured at all: Execute must not panic and must report "none".
func TestExecuteNoBrokerConfigured(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, _ := testEngine(t, bars)
	e.Broker = nil
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "allowExits": true,
	})
	res := e.Execute("t1")
	if res.Executed {
		t.Fatalf("must not report executed with no broker: %+v", res)
	}
	if action, _ := res.Decision["action"].(string); action != "none" {
		t.Fatalf("want action=none, got %+v", res.Decision)
	}
	if reason, _ := res.Decision["reason"].(string); reason != "no_broker_configured" {
		t.Fatalf("want reason=no_broker_configured, got %+v", res.Decision)
	}
	if !hasAutotradeLog(t, e, "event=execution_skipped") || !hasAutotradeLog(t, e, "reason=no_broker_configured") {
		t.Fatal("want the no_broker_configured skip logged")
	}
}
