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

func TestOpenBrokerTradeForFiltersBroker(t *testing.T) {
	rows := []map[string]any{
		{"id": "w1", "symbol": "AAPL", "status": "open", "broker": "webull"},
		{"id": "r1", "symbol": "AAPL", "status": "open", "broker": "robinhood"},
		{"id": "w-closed", "symbol": "MSFT", "status": "closed", "broker": "webull"},
		{"id": "legacy", "symbol": "QQQ", "status": "open", "broker": ""},
	}
	if got := OpenBrokerTradeFor(rows, "webull"); got == nil || got["id"] != "w1" {
		t.Fatalf("webull %+v", got)
	}
	if got := OpenBrokerTradeFor(rows, "robinhood"); got == nil || got["id"] != "r1" {
		t.Fatalf("robinhood %+v", got)
	}
	legacyOnly := []map[string]any{
		{"id": "legacy", "symbol": "QQQ", "status": "open", "broker": ""},
		{"id": "r1", "symbol": "AAPL", "status": "open", "broker": "robinhood"},
	}
	if got := OpenBrokerTradeFor(legacyOnly, "webull"); got == nil || got["id"] != "legacy" {
		t.Fatalf("blank broker counts as webull, got %+v", got)
	}
	if OpenBrokerTradeFor(legacyOnly, "robinhood")["id"] != "r1" {
		t.Fatal("robinhood should skip the blank webull row")
	}
}

func TestOpenBrokerTradesByBrokerListsEveryOpenRow(t *testing.T) {
	rows := []map[string]any{
		{"id": "w1", "symbol": "AAPL", "status": "open", "broker": "webull"},
		{"id": "r1", "symbol": "MSFT", "status": "open", "broker": "robinhood"},
		{"id": "w-closed", "symbol": "TSLA", "status": "closed", "broker": "webull"},
		{"id": "hidden", "symbol": "QQQ", "status": "open", "isHidden": true, "broker": "webull"},
		{"id": "legacy", "symbol": "IWM", "status": "open", "broker": ""},
	}
	all := OpenBrokerTrades(rows)
	if len(all) != 3 {
		t.Fatalf("open rows %+v", all)
	}
	grouped := OpenBrokerTradesByBroker(rows)
	if len(grouped["webull"]) != 2 || grouped["webull"][0]["id"] != "w1" || grouped["webull"][1]["id"] != "legacy" {
		t.Fatalf("webull %+v", grouped["webull"])
	}
	if len(grouped["robinhood"]) != 1 || grouped["robinhood"][0]["id"] != "r1" {
		t.Fatalf("robinhood %+v", grouped["robinhood"])
	}
}

func TestListTradesSelectsBroker(t *testing.T) {
	db := openTestDB(t)
	if err := db.InsertTrade("broker_trades", map[string]any{
		"id": "r1", "symbol": "AAPL", "status": "open", "entryDate": "2026-09-01",
		"entryPrice": 10.0, "quantity": 1.0, "broker": "robinhood",
	}); err != nil {
		t.Fatal(err)
	}
	rows, err := db.ListTrades("broker_trades")
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || fmtSprint(rows[0]["broker"]) != "robinhood" {
		t.Fatalf("list %+v", rows)
	}
	got := db.GetTrade("broker_trades", "r1")
	if got == nil || fmtSprint(got["broker"]) != "robinhood" {
		t.Fatalf("get %+v", got)
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
	row, err := db.FindPendingTracker("MSFT", "entry")
	if err != nil {
		t.Fatal(err)
	}
	if fmtSprint(row["clientOrderId"]) != "today" {
		t.Fatal("today tracker should still be pending")
	}
	row, err = db.FindPendingTracker("AAPL", "entry")
	if err != nil {
		t.Fatal(err)
	}
	if row != nil {
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

func TestPendingTrackerQueryError(t *testing.T) {
	db := openTestDB(t)
	row, err := db.FindPendingTracker("AAPL", "entry")
	if err != nil {
		t.Fatal(err)
	}
	if row != nil {
		t.Fatal("empty pending is (nil, nil)")
	}
	row, err = db.AnyPendingTracker()
	if err != nil || row != nil {
		t.Fatalf("empty AnyPendingTracker: %v %+v", err, row)
	}
	if _, err := db.SQL.Exec(`DROP TABLE order_trackers`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.FindPendingTracker("AAPL", "entry"); err == nil {
		t.Fatal("want error when order_trackers is unreadable")
	}
	if _, err := db.AnyPendingTrackerFor("webull"); err == nil {
		t.Fatal("want error from AnyPendingTrackerFor")
	}
	if _, err := db.FindPendingTrackerBroker("AAPL", "exit", "webull"); err == nil {
		t.Fatal("want error from FindPendingTrackerBroker")
	}
}

func TestGetRobinhoodOAuthErrEmptyVsScan(t *testing.T) {
	db := openTestDB(t)
	row, err := db.GetRobinhoodOAuthErr()
	if err != nil {
		t.Fatal(err)
	}
	if row.AccessToken != "" {
		t.Fatalf("empty %+v", row)
	}
	if db.GetRobinhoodOAuth().AccessToken != "" {
		t.Fatal("GetRobinhoodOAuth must still return zero on empty")
	}
	if _, err := db.SQL.Exec(`DROP TABLE robinhood_oauth`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.GetRobinhoodOAuthErr(); err == nil {
		t.Fatal("want scan/query error")
	}
	_ = db.GetRobinhoodOAuth()
}

func TestT1ExecutionFinishedEmptyVsError(t *testing.T) {
	db := openTestDB(t)
	done, err := db.T1ExecutionFinished("c", "2026-09-01")
	if err != nil {
		t.Fatal(err)
	}
	if done {
		t.Fatal("missing row is not finished")
	}
	if _, err := db.SQL.Exec(`INSERT INTO aggregate_send_state (date_key, chat_id, t11_sent, t1_sent, t1_execution_finished) VALUES ('2026-09-01', 'c', 0, 0, 1)`); err != nil {
		t.Fatal(err)
	}
	done, err = db.T1ExecutionFinished("c", "2026-09-01")
	if err != nil || !done {
		t.Fatalf("finished after insert: %v %v", done, err)
	}
	if _, err := db.SQL.Exec(`DROP TABLE aggregate_send_state`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.T1ExecutionFinished("c", "2026-09-01"); err == nil {
		t.Fatal("want query error")
	}
}
