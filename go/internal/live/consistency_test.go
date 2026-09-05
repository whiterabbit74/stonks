package live

import (
	"fmt"
	"testing"

	"mktorder.com/go/internal/store"
)

func TestConsistencyReportsOpenJournalOnEveryBroker(t *testing.T) {
	e, _, _ := dualBrokerEngine(t, entryBars)
	mustInsertBrokerTrade(t, e, "w-aapl", "AAPL", "webull", "2026-08-02", 1)
	mustInsertBrokerTrade(t, e, "r-msft", "MSFT", "robinhood", "2026-08-01", 2)

	snap := e.Consistency()
	got := tradeIDs(snap["openBrokerTrades"])
	if !got["w-aapl"] || !got["r-msft"] {
		t.Fatalf("state missing a broker book: openBrokerTrades=%v openBrokerTrade=%v", snap["openBrokerTrades"], snap["openBrokerTrade"])
	}
	syms := issueSymbols(snap, "broker_trade_without_monitor_projection")
	if !syms["AAPL"] || !syms["MSFT"] {
		t.Fatalf("issues missing a broker book: %+v", snap["issues"])
	}
}

func TestConsistencyReportsLivePositionOnEveryBroker(t *testing.T) {
	e, webull, rh := dualBrokerEngine(t, entryBars)
	// Same symbol on both books: a merged held map would collapse them.
	webull.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 1.0}}
	rh.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 2.0}}

	snap := e.Consistency()
	brokers := issueBrokers(snap, "live_broker_position_without_journal")
	if !brokers["webull"] || !brokers["robinhood"] {
		t.Fatalf("second broker live position invisible: %+v", snap["issues"])
	}
}

func TestConsistencyDoesNotMismatchTwoBrokerBooks(t *testing.T) {
	e, webull, rh := dualBrokerEngine(t, entryBars)
	mustInsertBrokerTrade(t, e, "w-aapl", "AAPL", "webull", "2026-08-02", 1)
	mustInsertBrokerTrade(t, e, "r-msft", "MSFT", "robinhood", "2026-08-01", 2)
	mustInsertMonitorTrade(t, e, "m-w-aapl", "AAPL", "w-aapl", "2026-08-02")
	mustInsertMonitorTrade(t, e, "m-r-msft", "MSFT", "r-msft", "2026-08-01")
	webull.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 1.0}}
	rh.Pos = []any{map[string]any{"symbol": "MSFT", "quantity": 2.0}}

	snap := e.Consistency()
	if iss := issueByCode(snap, "monitor_broker_symbol_mismatch"); iss != nil {
		t.Fatalf("two per-broker books must not look like a symbol mismatch: %+v", snap["issues"])
	}
	got := tradeIDs(snap["openBrokerTrades"])
	if !got["w-aapl"] || !got["r-msft"] {
		t.Fatalf("state missing a broker book: %+v", snap["openBrokerTrades"])
	}
	if BlockingMismatch(snap) != nil {
		t.Fatalf("consistent dual-broker books must not block: %+v", snap["issues"])
	}
}

func TestLiveHeldSymbolsReadsEveryAttachedBroker(t *testing.T) {
	e, webull, rh := dualBrokerEngine(t, entryBars)
	webull.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 1.0}}
	rh.Pos = []any{map[string]any{"symbol": "MSFT", "quantity": 2.0}}
	held, err := e.liveHeldSymbols()
	if err != nil {
		t.Fatal(err)
	}
	if held["AAPL"] != 1 || held["MSFT"] != 2 {
		t.Fatalf("merged held must include both brokers, got %v", held)
	}
}

func TestConsistencyStillMismatchesSingleBookDifferentSymbols(t *testing.T) {
	db, e, _ := testEngine(t, entryBars)
	if err := db.InsertTrade("trades", map[string]any{
		"id": "m1", "symbol": "AAPL", "status": "open",
		"entryDate": "2026-08-01", "entryPrice": 10.0,
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.InsertTrade("broker_trades", map[string]any{
		"id": "b1", "symbol": "MSFT", "status": "open",
		"entryDate": "2026-08-01", "entryPrice": 20.0, "quantity": 1.0, "broker": "webull",
	}); err != nil {
		t.Fatal(err)
	}
	snap := e.Consistency()
	block := BlockingMismatch(snap)
	if block == nil || fmt.Sprint(block["code"]) != "monitor_broker_symbol_mismatch" {
		t.Fatalf("singleton different-symbol books must still mismatch: %+v", snap["issues"])
	}
}

func mustInsertBrokerTrade(t *testing.T, e *Engine, id, symbol, broker, entryDate string, qty float64) {
	t.Helper()
	if err := e.DB.InsertTrade("broker_trades", map[string]any{
		"id": id, "symbol": symbol, "status": "open",
		"entryDate": entryDate, "entryPrice": 10.0, "quantity": qty, "broker": broker,
	}); err != nil {
		t.Fatal(err)
	}
}

func mustInsertMonitorTrade(t *testing.T, e *Engine, id, symbol, linked, entryDate string) {
	t.Helper()
	if err := e.DB.InsertTrade("trades", map[string]any{
		"id": id, "symbol": symbol, "status": "open",
		"entryDate": entryDate, "entryPrice": 10.0,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := e.DB.SQL.Exec(`UPDATE trades SET linked_broker_trade_id=? WHERE id=?`, linked, id); err != nil {
		t.Fatal(err)
	}
}

func tradeIDs(v any) map[string]bool {
	out := map[string]bool{}
	switch rows := v.(type) {
	case []map[string]any:
		for _, row := range rows {
			out[fmt.Sprint(row["id"])] = true
		}
	case []any:
		for _, row := range rows {
			m, _ := row.(map[string]any)
			if m != nil {
				out[fmt.Sprint(m["id"])] = true
			}
		}
	}
	return out
}

func issueSymbols(snap map[string]any, code string) map[string]bool {
	out := map[string]bool{}
	for _, iss := range issuesOf(snap) {
		if fmt.Sprint(iss["code"]) == code {
			out[store.SafeTicker(fmt.Sprint(iss["symbol"]))] = true
		}
	}
	return out
}

func issueBrokers(snap map[string]any, code string) map[string]bool {
	out := map[string]bool{}
	for _, iss := range issuesOf(snap) {
		if fmt.Sprint(iss["code"]) == code {
			out[fmt.Sprint(iss["broker"])] = true
		}
	}
	return out
}

func issueByCode(snap map[string]any, code string) map[string]any {
	for _, iss := range issuesOf(snap) {
		if fmt.Sprint(iss["code"]) == code {
			return iss
		}
	}
	return nil
}

func issuesOf(snap map[string]any) []map[string]any {
	if snap == nil {
		return nil
	}
	switch issues := snap["issues"].(type) {
	case []map[string]any:
		return issues
	case []any:
		var out []map[string]any
		for _, row := range issues {
			if m, _ := row.(map[string]any); m != nil {
				out = append(out, m)
			}
		}
		return out
	}
	return nil
}
