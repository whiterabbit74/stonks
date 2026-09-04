package live

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/types"
)

// dropOrderTrackersTable makes the next SaveOrderTracker call fail with a
// real database error (rather than simulating the failure), matching what
// startTracking sees when the write genuinely cannot land. The schema is
// restored immediately after so the rest of the engine keeps working - only
// the one insert is meant to fail.
func dropOrderTrackersTable(t *testing.T, e *Engine) {
	t.Helper()
	if _, err := e.DB.SQL.Exec(`DROP TABLE order_trackers`); err != nil {
		t.Fatalf("drop order_trackers: %v", err)
	}
	t.Cleanup(func() {
		_, _ = e.DB.SQL.Exec(`
            CREATE TABLE IF NOT EXISTS order_trackers (
                client_order_id TEXT PRIMARY KEY,
                symbol          TEXT NOT NULL,
                action          TEXT NOT NULL,
                broker          TEXT NOT NULL DEFAULT 'webull',
                status          TEXT NOT NULL,
                quantity        REAL,
                source          TEXT,
                date_key        TEXT,
                started_at      TEXT NOT NULL,
                attempts        INTEGER NOT NULL DEFAULT 0,
                updated_at      TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_order_trackers_pending ON order_trackers(symbol, action, status);
        `)
	})
}

func recreateOrderTrackersTable(t *testing.T, e *Engine) {
	t.Helper()
	if _, err := e.DB.SQL.Exec(`
        CREATE TABLE IF NOT EXISTS order_trackers (
            client_order_id TEXT PRIMARY KEY,
            symbol          TEXT NOT NULL,
            action          TEXT NOT NULL,
            broker          TEXT NOT NULL DEFAULT 'webull',
            status          TEXT NOT NULL,
            quantity        REAL,
            source          TEXT,
            date_key        TEXT,
            started_at      TEXT NOT NULL,
            attempts        INTEGER NOT NULL DEFAULT 0,
            updated_at      TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_order_trackers_pending ON order_trackers(symbol, action, status);
    `); err != nil {
		t.Fatalf("recreate order_trackers: %v", err)
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

	dropOrderTrackersTable(t, e)
	res := e.Execute("t1")
	recreateOrderTrackersTable(t, e)
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
