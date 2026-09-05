package live

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/types"
)

// blockOrderTrackerInserts makes SaveOrderTracker fail while SELECT still
// works, so the pending-tracker guard can fail closed without treating a
// missing table as "no pending".
func blockOrderTrackerInserts(t *testing.T, e *Engine) {
	t.Helper()
	if _, err := e.DB.SQL.Exec(`
            CREATE TRIGGER IF NOT EXISTS order_trackers_block_insert
            BEFORE INSERT ON order_trackers
            BEGIN
                SELECT RAISE(ABORT, 'injected tracker persist failure');
            END;
        `); err != nil {
		t.Fatalf("block order_trackers inserts: %v", err)
	}
	t.Cleanup(func() {
		_, _ = e.DB.SQL.Exec(`DROP TRIGGER IF EXISTS order_trackers_block_insert`)
	})
}

func unblockOrderTrackerInserts(t *testing.T, e *Engine) {
	t.Helper()
	if _, err := e.DB.SQL.Exec(`DROP TRIGGER IF EXISTS order_trackers_block_insert`); err != nil {
		t.Fatalf("unblock order_trackers inserts: %v", err)
	}
}

// blockSettingsWrites makes SetSettingsKeys fail. That helper uses
// INSERT ON CONFLICT DO UPDATE, so both INSERT and UPDATE paths must abort.
func blockSettingsWrites(t *testing.T, e *Engine) {
	t.Helper()
	if _, err := e.DB.SQL.Exec(`
            CREATE TRIGGER IF NOT EXISTS settings_block_update
            BEFORE UPDATE ON settings
            BEGIN
                SELECT RAISE(ABORT, 'injected settings fail');
            END;
        `); err != nil {
		t.Fatalf("block settings updates: %v", err)
	}
	if _, err := e.DB.SQL.Exec(`
            CREATE TRIGGER IF NOT EXISTS settings_block_insert
            BEFORE INSERT ON settings
            BEGIN
                SELECT RAISE(ABORT, 'injected settings fail');
            END;
        `); err != nil {
		t.Fatalf("block settings inserts: %v", err)
	}
	t.Cleanup(func() {
		_, _ = e.DB.SQL.Exec(`DROP TRIGGER IF EXISTS settings_block_update`)
		_, _ = e.DB.SQL.Exec(`DROP TRIGGER IF EXISTS settings_block_insert`)
	})
}

func autotradeLogsContain(t *testing.T, e *Engine, needle string) bool {
	t.Helper()
	logs, err := e.DB.ListAutotradeLogs(50)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.DB.ListAutotradeLogsKind("autotrade", 50); err != nil {
		t.Fatal(err)
	}
	for _, l := range logs {
		if strings.Contains(fmt.Sprint(l["message"]), needle) {
			return true
		}
	}
	return false
}

func TestTrackerPersistBlockedOnSettingsReadError(t *testing.T) {
	db, e, _ := testEngine(t, entryBars)
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	if !e.trackerPersistBlocked("webull") {
		t.Fatal("a failed settings read must not lift trackerPersistFail")
	}
}

// TestPersistTrackerBlockKeepsMemoryFlagWhenSettingsWriteFails is T6/S04:
// a failed settings write must not pretend the protective flag was stored.
func TestPersistTrackerBlockKeepsMemoryFlagWhenSettingsWriteFails(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, _ := testEngine(t, bars)
	blockSettingsWrites(t, e)

	e.mu.Lock()
	e.trackerPersistFail = map[string]bool{"webull": true}
	e.mu.Unlock()

	if err := e.persistTrackerBlock("webull"); err == nil {
		t.Fatal("persistTrackerBlock must return the settings write error")
	}
	if !e.trackerPersistBlocked("webull") {
		t.Fatal("trackerPersistBlocked must stay true when persist write fails")
	}
	if !autotradeLogsContain(t, e, "tracker_persist_block_save_failed") {
		t.Fatal("want tracker_persist_block_save_failed in autotrade logs")
	}
}

// TestClearTrackerPersistBlockKeepsMemoryFlagWhenSettingsWriteFails is the
// mirror of T6/S04: a failed settings write must not report the block cleared.
func TestClearTrackerPersistBlockKeepsMemoryFlagWhenSettingsWriteFails(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, _ := testEngine(t, bars)

	e.mu.Lock()
	e.trackerPersistFail = map[string]bool{"webull": true}
	e.mu.Unlock()
	blockSettingsWrites(t, e)

	if err := e.ClearTrackerPersistBlock("webull", "checked Webull orders by hand, none pending"); err == nil {
		t.Fatal("ClearTrackerPersistBlock must return the settings write error")
	}
	if !e.trackerPersistBlocked("webull") {
		t.Fatal("trackerPersistBlocked must stay true when clear write fails")
	}
	if autotradeLogsContain(t, e, "tracker_persist_block_cleared") {
		t.Fatal("must not log tracker_persist_block_cleared on write fail")
	}
}

// TestTrackerPersistBlockSurvivesRestartAndOnlyClearsExplicitly closes P1-8:
// a failed SaveOrderTracker write must block further entries for that
// broker, that block must survive an Engine restart (it is persisted in
// settings, not just held in memory), and nothing but an explicit resolve
// call may lift it.
func TestTrackerPersistBlockSurvivesRestartAndOnlyClearsExplicitly(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})

	blockOrderTrackerInserts(t, e)
	res := e.Execute("t1")
	unblockOrderTrackerInserts(t, e)
	if !res.Executed {
		t.Fatalf("broker placement itself must still succeed: %+v", res.Broker)
	}
	if len(br.Orders) != 1 {
		t.Fatalf("want 1 broker order despite the failed tracker write, got %+v", br.Orders)
	}
	if !e.trackerPersistBlocked("webull") {
		t.Fatal("a failed SaveOrderTracker must set the trackerPersistFail block")
	}

	// A second attempt must be refused - the whole point of the guard.
	res2 := e.Execute("t1")
	if res2.Executed {
		t.Fatal("tracker_persist_failed must block further entries")
	}
	if len(br.Orders) != 1 {
		t.Fatalf("blocked entry must not reach the broker, got %+v", br.Orders)
	}

	// Simulate a process restart: a fresh Engine over the same DB.
	ny, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Fatal(err)
	}
	e2 := New(db, e.Quotes)
	e2.Broker = br
	e2.Telegram = e.Telegram
	e2.ChatID = "c"
	e2.Now = func() time.Time { return time.Date(2026, 9, 1, 15, 59, 0, 0, ny) }
	if !e2.trackerPersistBlocked("webull") {
		t.Fatal("trackerPersistFail must survive an Engine restart (persisted in settings)")
	}

	// Nothing but an explicit resolve lifts it: a plain PollTrackers or a
	// retried Execute must leave it standing.
	e2.PollTrackers()
	if !e2.trackerPersistBlocked("webull") {
		t.Fatal("PollTrackers must not clear the persist block on its own")
	}

	if err := e2.ClearTrackerPersistBlock("webull", ""); err == nil {
		t.Fatal("ClearTrackerPersistBlock must require a note")
	}
	if err := e2.ClearTrackerPersistBlock("robinhood", "checked, nothing to clear"); err == nil {
		t.Fatal("clearing a broker with no block set must error")
	}
	if err := e2.ClearTrackerPersistBlock("webull", "checked Webull orders by hand, none pending"); err != nil {
		t.Fatalf("ClearTrackerPersistBlock: %v", err)
	}
	if e2.trackerPersistBlocked("webull") {
		t.Fatal("ClearTrackerPersistBlock must lift the block")
	}

	logs, err := db.ListAutotradeLogs(50)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, l := range logs {
		msg := fmt.Sprint(l["message"])
		if strings.Contains(msg, "tracker_persist_block_cleared") && strings.Contains(msg, "checked Webull orders by hand") {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("clearing the block must record the reason in autotrade_logs")
	}

	// A third Execute now goes through again.
	res3 := e2.Execute("t1")
	if !res3.Executed {
		t.Fatalf("entries must resume once the block is cleared: %+v", res3.Broker)
	}
}
