package live

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

// TestPollTrackerMissingNamedBrokerDoesNotUseDefault is AU-P0-2: a robinhood
// tracker whose broker is no longer attached must not be polled through
// defaultBroker (Webull). Webull answering ErrOrderNotFound would otherwise
// finalize the tracker as terminal_absent and deletePhantom the robinhood
// journal row.
func TestFinalizeDoesNotRejournalWhenStatusStampFails(t *testing.T) {
	db, e, br := testEngine(t, entryBars)
	id := "oid-stamp-fail"
	if err := e.DB.SaveOrderTracker(map[string]any{
		"clientOrderId": id, "symbol": "AAPL", "action": "entry",
		"status": "submitted", "quantity": 1.0, "source": "t1", "dateKey": "2026-09-01",
		"broker": "webull", "startedAt": e.now().UTC().Format(time.RFC3339Nano),
	}); err != nil {
		t.Fatal(err)
	}
	br.SetDetail(id, map[string]any{"client_order_id": id, "status": "FILLED", "avg_price": 8.2, "filled_qty": 1.0})
	if _, err := db.SQL.Exec(`
            CREATE TRIGGER IF NOT EXISTS trackers_block_status
            BEFORE UPDATE ON order_trackers
            BEGIN
                SELECT RAISE(ABORT, 'injected tracker stamp failure');
            END;
        `); err != nil {
		t.Fatal(err)
	}
	e.PollTrackers()
	if trackerStatus(t, db, id) == "filled" {
		t.Fatal("stamp failure must leave tracker pending")
	}
	if !autotradeLogsContain(t, e, "tracker_finalize_failed") {
		t.Fatal("want tracker_finalize_failed when SetOrderTrackerStatus fails")
	}
	if db.GetTrade("broker_trades", id) == nil {
		t.Fatal("fill must still be journaled")
	}
	if _, err := db.SQL.Exec(`DROP TRIGGER IF EXISTS trackers_block_status`); err != nil {
		t.Fatal(err)
	}
	e.PollTrackers()
	if trackerStatus(t, db, id) != "filled" {
		t.Fatalf("retry stamp got %q", trackerStatus(t, db, id))
	}
	rows, err := db.ListTrades("broker_trades")
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	for _, r := range rows {
		if fmt.Sprint(r["id"]) == id {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("want 1 journal row, got %d", n)
	}
}

func TestPollTrackerOrderedQtyIsNotAFill(t *testing.T) {
	_, e, br := testEngine(t, entryBars)
	id := "oid-qty-only"
	if err := e.DB.SaveOrderTracker(map[string]any{
		"clientOrderId": id, "symbol": "AAPL", "action": "entry",
		"status": "submitted", "quantity": 2.0, "source": "t1", "dateKey": "2026-09-01",
		"broker": "webull", "startedAt": e.now().UTC().Format(time.RFC3339Nano),
	}); err != nil {
		t.Fatal(err)
	}
	br.SetDetail(id, map[string]any{"client_order_id": id, "status": "NEW", "qty": 2.0})
	e.PollTrackers()
	st := trackerStatus(t, e.DB, id)
	if st == "filled" {
		t.Fatalf("ordered qty without filled_qty must not finalize as filled, got %q", st)
	}
	if e.DB.GetTrade("broker_trades", id) != nil {
		t.Fatal("qty-only detail must not journal a fill")
	}
}

func TestPollTrackerMissingNamedBrokerDoesNotUseDefault(t *testing.T) {
	e, webull, rh := dualBrokerEngine(t, entryBars)
	tg, ok := e.Telegram.(*MemoryTelegram)
	if !ok {
		t.Fatal("want MemoryTelegram")
	}
	journalAAPL(t, e, "rh-oid", "robinhood", 2)
	if err := e.DB.SaveOrderTracker(map[string]any{
		"clientOrderId": "rh-oid", "symbol": "AAPL", "action": "entry",
		"status": "submitted", "quantity": 2.0, "source": "t1", "dateKey": "2026-09-01",
		"broker": "robinhood", "startedAt": e.now().UTC().Format(time.RFC3339Nano),
	}); err != nil {
		t.Fatal(err)
	}
	e.DetachBroker("robinhood")
	if e.BrokerNamed("robinhood") != nil {
		t.Fatal("setup: robinhood must be detached")
	}
	if e.defaultBroker() != webull {
		t.Fatal("setup: default broker must stay Webull")
	}

	beforeW, beforeR := webull.DetailN, rh.DetailN
	e.PollTrackers()

	if webull.DetailN != beforeW {
		t.Fatalf("must not call Webull OrderDetail for a robinhood tracker, DetailN %d -> %d", beforeW, webull.DetailN)
	}
	if rh.DetailN != beforeR {
		t.Fatalf("detached robinhood must not be polled, DetailN %d -> %d", beforeR, rh.DetailN)
	}

	row := e.DB.GetTrade("broker_trades", "rh-oid")
	if row == nil || fmt.Sprint(row["status"]) != "open" {
		t.Fatalf("must not deletePhantom a robinhood journal row: %+v", row)
	}
	st := trackerStatus(t, e.DB, "rh-oid")
	if st != "execution_unknown" {
		t.Fatalf("status %q want execution_unknown", st)
	}

	foundAlert := false
	for _, msg := range tg.Sent() {
		if strings.Contains(msg[1], "не подключ") {
			foundAlert = true
			break
		}
	}
	if !foundAlert {
		t.Fatalf("want an alert that the broker is not connected, got %+v", tg.Sent())
	}
	if !hasAutotradeLog(t, e, "order_execution_unknown") {
		t.Fatal("want order_execution_unknown logged")
	}
}

// TestPollTrackerUnknownRHDetailRecoversFillFromRHHistory is T19 / F04:
// Robinhood OrderDetail returns an unrecognised status, RH history has FILLED
// for the same id, and Webull (the default broker) history is empty. Polling
// that tracker must recover the fill from RH history — not miss it because
// findOrderSnapshot looked at Webull.
func TestPollTrackerUnknownRHDetailRecoversFillFromRHHistory(t *testing.T) {
	e, webull, rh := dualBrokerEngine(t, entryBars)
	id := "rh-unknown-detail"
	if err := e.DB.SaveOrderTracker(map[string]any{
		"clientOrderId": id, "symbol": "AAPL", "action": "entry",
		"status": "submitted", "quantity": 2.0, "source": "t1", "dateKey": "2026-09-01",
		"broker": "robinhood", "startedAt": e.now().UTC().Format(time.RFC3339Nano),
	}); err != nil {
		t.Fatal(err)
	}
	rh.SetDetail(id, map[string]any{"client_order_id": id})
	rh.Hist = []any{map[string]any{
		"client_order_id": id,
		"status":          "FILLED",
		"avg_price":       8.2,
		"filled_qty":      2.0,
	}}
	webull.Hist = []any{}
	if e.defaultBroker() != webull {
		t.Fatal("setup: default broker must stay Webull")
	}

	e.PollTrackers()

	st := trackerStatus(t, e.DB, id)
	if st != "filled" {
		t.Fatalf("status %q want filled (RH history had FILLED; a default-broker lookup would miss it)", st)
	}
	row := e.DB.GetTrade("broker_trades", id)
	if row == nil {
		t.Fatal("journal must recover the Robinhood fill from RH history")
	}
	if fmt.Sprint(row["broker"]) != "robinhood" {
		t.Fatalf("broker %v want robinhood", row["broker"])
	}
	if asFloat(row["quantity"]) != 2 || asFloat(row["entryPrice"]) != 8.2 {
		t.Fatalf("fill %+v", row)
	}
}

// TestFinalizeTrackerStatusUsesBrokerLabel is AU-P0-1 for track.go: fill and
// terminal-status Telegram copy must name the tracker broker, not hardcode Webull.
func TestFinalizeTrackerStatusUsesBrokerLabel(t *testing.T) {
	e, _, _ := dualBrokerEngine(t, entryBars)
	tg := e.Telegram.(*MemoryTelegram)

	tg.Reset()
	e.finalizeTrackerStatus(map[string]any{
		"clientOrderId": "rh-fill", "symbol": "AAPL", "action": "entry",
		"source": "t1", "quantity": 2.0, "broker": "robinhood",
	}, map[string]any{"status": "FILLED", "avg_price": 8.2, "filled_qty": 2.0}, "filled")
	assertTelegramContains(t, tg, "Robinhood исполнено")
	assertTelegramOmits(t, tg, "Webull исполнено")

	tg.Reset()
	e.finalizeTrackerStatus(map[string]any{
		"clientOrderId": "rh-rej", "symbol": "AAPL", "action": "entry",
		"source": "t1", "quantity": 1.0, "broker": "robinhood",
	}, nil, "rejected")
	assertTelegramContains(t, tg, "Robinhood статус заявки")
	assertTelegramOmits(t, tg, "Webull статус заявки")
}

func assertTelegramContains(t *testing.T, tg *MemoryTelegram, want string) {
	t.Helper()
	for _, msg := range tg.Sent() {
		if strings.Contains(msg[1], want) {
			return
		}
	}
	t.Fatalf("want telegram containing %q, got %+v", want, tg.Sent())
}

func assertTelegramOmits(t *testing.T, tg *MemoryTelegram, forbid string) {
	t.Helper()
	for _, msg := range tg.Sent() {
		if strings.Contains(msg[1], forbid) {
			t.Fatalf("telegram must not contain %q: %s", forbid, msg[1])
		}
	}
}
