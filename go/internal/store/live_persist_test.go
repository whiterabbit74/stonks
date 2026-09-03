package store

import (
	"database/sql"
	"path/filepath"
	"testing"
)

func TestOpenTradeForSymbol(t *testing.T) {
	rows := []map[string]any{
		{"id": "h1", "symbol": "AAPL", "status": "open", "isHidden": true},
		{"id": "c1", "symbol": "AAPL", "status": "closed"},
		{"id": "m1", "symbol": "MSFT", "status": "open"},
		{"id": "a1", "symbol": "aapl", "status": "open"},
	}
	got := OpenTradeForSymbol(rows, "AAPL")
	if got == nil || got["id"] != "a1" {
		t.Fatalf("got %+v", got)
	}
	if OpenBrokerTrade(rows)["id"] != "m1" {
		t.Fatalf("OpenBrokerTrade should still return first open non-hidden, got %+v", OpenBrokerTrade(rows))
	}
	if OpenTradeForSymbol(rows, "TSLA") != nil {
		t.Fatal("unknown symbol")
	}
	if OpenTradeForSymbol(rows, "") != nil {
		t.Fatal("empty symbol")
	}
}

func TestPendingTrackersListAndExpire(t *testing.T) {
	db := openTestDB(t)
	mustSaveTracker := func(id, symbol, status, dateKey string, attempts int) {
		t.Helper()
		if err := db.SaveOrderTracker(map[string]any{
			"clientOrderId": id, "symbol": symbol, "action": "entry",
			"status": status, "quantity": 1.0, "source": "test", "dateKey": dateKey,
		}); err != nil {
			t.Fatal(err)
		}
		for i := 0; i < attempts; i++ {
			if _, err := db.BumpOrderTrackerAttempts(id); err != nil {
				t.Fatal(err)
			}
		}
	}
	mustSaveTracker("old", "AAPL", "submitted", "2024-06-03", 0)
	mustSaveTracker("today", "MSFT", "working", "2024-06-04", 0)
	mustSaveTracker("many", "QQQ", "submitted", "2024-06-04", 5)
	mustSaveTracker("done", "IWM", "filled", "2024-06-03", 0)

	pending, err := db.ListPendingTrackers()
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 3 {
		t.Fatalf("pending %d want 3 (filled excluded): %+v", len(pending), pending)
	}
	byID := map[string]map[string]any{}
	for _, p := range pending {
		byID[fmtSprint(p["clientOrderId"])] = p
	}
	if byID["done"] != nil {
		t.Fatal("filled tracker listed as pending")
	}
	if byID["many"]["attempts"] != 5 {
		t.Fatalf("attempts %v", byID["many"]["attempts"])
	}

	n, err := db.ExpireStaleTrackers("2024-06-04", 5)
	if err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Fatalf("expired %d want 2 (old date_key + attempts>=5)", n)
	}
	pending, err = db.ListPendingTrackers()
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 1 || fmtSprint(pending[0]["clientOrderId"]) != "today" {
		t.Fatalf("after expire %+v", pending)
	}
	if fmtSprint(db.FindPendingTracker("MSFT", "entry")["clientOrderId"]) != "today" {
		t.Fatal("today tracker should still be pending")
	}
	if db.FindPendingTracker("AAPL", "entry") != nil {
		t.Fatal("expired AAPL tracker should not be pending")
	}
}

func TestExpireStaleTrackersByAttemptsOnly(t *testing.T) {
	db := openTestDB(t)
	if err := db.SaveOrderTracker(map[string]any{
		"clientOrderId": "t1", "symbol": "AAPL", "action": "exit", "status": "submitted",
		"dateKey": "2024-06-04",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.BumpOrderTrackerAttempts("t1"); err != nil {
		t.Fatal(err)
	}
	n, err := db.ExpireStaleTrackers("2024-06-04", 2)
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("should keep attempts=1 < 2, expired %d", n)
	}
	n, err = db.ExpireStaleTrackers("", 1)
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("attempts-only expire %d", n)
	}
}

func TestAutotradeLogsKindAndCap(t *testing.T) {
	db := openTestDB(t)
	if err := db.AppendAutotradeLog("plain"); err != nil {
		t.Fatal(err)
	}
	if err := db.AppendAutotradeLogKind("monitor", "m1"); err != nil {
		t.Fatal(err)
	}
	if err := db.AppendAutotradeLogKind("autotrade", "a1"); err != nil {
		t.Fatal(err)
	}
	all, err := db.ListAutotradeLogs(0)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 3 {
		t.Fatalf("all %d", len(all))
	}
	mon, err := db.ListAutotradeLogsKind("monitor", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(mon) != 1 || mon[0]["message"] != "m1" || mon[0]["kind"] != "monitor" {
		t.Fatalf("monitor %+v", mon)
	}
	at, err := db.ListAutotradeLogsKind("autotrade", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(at) != 1 || at[0]["message"] != "a1" {
		t.Fatalf("autotrade %+v", at)
	}
}

func TestMigrateAddsTrackerAttempts(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	raw, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := raw.Exec(`
        CREATE TABLE order_trackers (
            client_order_id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            action TEXT NOT NULL,
            status TEXT NOT NULL,
            quantity REAL,
            source TEXT,
            date_key TEXT,
            started_at TEXT NOT NULL
        );
        CREATE TABLE autotrade_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            message TEXT NOT NULL
        );
        INSERT INTO order_trackers (client_order_id, symbol, action, status, started_at, date_key)
        VALUES ('legacy','AAPL','entry','submitted','2024-06-03T00:00:00Z','2024-06-03');
    `); err != nil {
		raw.Close()
		t.Fatal(err)
	}
	raw.Close()
	db, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if !db.hasColumn("order_trackers", "attempts") {
		t.Fatal("attempts column missing after migrate")
	}
	if !db.hasColumn("autotrade_logs", "kind") {
		t.Fatal("kind column missing after migrate")
	}
	pending, err := db.ListPendingTrackers()
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 1 || pending[0]["attempts"] != 0 {
		t.Fatalf("legacy tracker %+v", pending)
	}
	n, err := db.ExpireStaleTrackers("2024-06-04", 64)
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("legacy stale expire %d", n)
	}
}

func fmtSprint(v any) string {
	if v == nil {
		return ""
	}
	return v.(string)
}

func TestWebullAccessTokenPrefersConfirmedToken(t *testing.T) {
	d := openTestDB(t)
	t.Setenv("WEBULL_ACCESS_TOKEN", "env-token")

	// Nothing stored yet: the environment token is all there is.
	if got := d.WebullAccessToken(); got != "env-token" {
		t.Fatalf("empty store = %q, want env-token", got)
	}

	// A freshly created token is PENDING until the user approves the SMS.
	// Sending it would fail every call while a usable env token sits unused.
	if err := d.SaveWebullToken("pending-token", "", "PENDING"); err != nil {
		t.Fatal(err)
	}
	if got := d.WebullAccessToken(); got != "env-token" {
		t.Fatalf("pending token = %q, want env-token", got)
	}

	if err := d.SaveWebullToken("live-token", "2026-12-01T00:00:00Z", "NORMAL"); err != nil {
		t.Fatal(err)
	}
	if got := d.WebullAccessToken(); got != "live-token" {
		t.Fatalf("confirmed token = %q, want live-token", got)
	}

	// A status-only save must not erase the expiry the check reported earlier.
	if err := d.SaveWebullToken("live-token", "", "NORMAL"); err != nil {
		t.Fatal(err)
	}
	if exp := d.GetWebullToken().ExpiresAt; exp != "2026-12-01T00:00:00Z" {
		t.Fatalf("expires_at = %q, want it preserved", exp)
	}
}

func TestWebullAccessTokenFallsBackToUnconfirmedToken(t *testing.T) {
	d := openTestDB(t)
	t.Setenv("WEBULL_ACCESS_TOKEN", "")
	if err := d.SaveWebullToken("only-token", "", "UNKNOWN"); err != nil {
		t.Fatal(err)
	}
	// With no environment token, an unverified token still beats sending no
	// header at all — a daily health check that could not reach Webull must not
	// take the account offline.
	if got := d.WebullAccessToken(); got != "only-token" {
		t.Fatalf("fallback = %q, want only-token", got)
	}
}
