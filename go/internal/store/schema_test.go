package store

import (
	"database/sql"
	"path/filepath"
	"strings"
	"testing"
)

func TestOpenRejectsNewerSchemaVersion(t *testing.T) {
	path := filepath.Join(t.TempDir(), "t.db")
	db, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.SQL.Exec(`UPDATE schema_meta SET version=999`); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	_, err = Open(path)
	if err == nil {
		t.Fatal("Open succeeded on schema version 999; want fail-fast")
	}
	if !strings.Contains(err.Error(), "999") {
		t.Fatalf("error %q should mention database version 999", err)
	}

	raw, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer raw.Close()
	var v int
	if err := raw.QueryRow(`SELECT version FROM schema_meta WHERE id=1`).Scan(&v); err != nil {
		t.Fatal(err)
	}
	if v != 999 {
		t.Fatalf("failed Open must not stamp schema_meta.version, got %d", v)
	}
}

func TestOpenFreshSetsSchemaVersion(t *testing.T) {
	db := openTestDB(t)
	var v int
	if err := db.SQL.QueryRow(`SELECT version FROM schema_meta WHERE id=1`).Scan(&v); err != nil {
		t.Fatal(err)
	}
	if v != SchemaVersion {
		t.Fatalf("schema version=%d want %d", v, SchemaVersion)
	}
}

func TestOpenUpgradesLegacySchemaVersion(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
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
        CREATE TABLE schema_meta (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL);
        INSERT INTO schema_meta (id, version) VALUES (1, 1);
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
		t.Fatal("attempts column missing after upgrade from version 1")
	}
	var v int
	if err := db.SQL.QueryRow(`SELECT version FROM schema_meta WHERE id=1`).Scan(&v); err != nil {
		t.Fatal(err)
	}
	if v != SchemaVersion {
		t.Fatalf("schema version=%d want %d", v, SchemaVersion)
	}
}

func TestOpenUpgradesSchemaVersion2AddsMissedT1Reported(t *testing.T) {
	path := filepath.Join(t.TempDir(), "v2.db")
	raw, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := raw.Exec(`
        CREATE TABLE aggregate_send_state (
            date_key TEXT NOT NULL,
            chat_id  TEXT NOT NULL DEFAULT '',
            t11_sent INTEGER NOT NULL DEFAULT 0,
            t1_sent  INTEGER NOT NULL DEFAULT 0,
            t1_lease_until TEXT,
            t1_execution_finished INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (date_key, chat_id)
        );
        CREATE TABLE schema_meta (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL);
        INSERT INTO schema_meta (id, version) VALUES (1, 2);
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
	if !db.hasColumn("aggregate_send_state", "missed_t1_reported") {
		t.Fatal("missed_t1_reported column missing after upgrade from version 2")
	}
	var v int
	if err := db.SQL.QueryRow(`SELECT version FROM schema_meta WHERE id=1`).Scan(&v); err != nil {
		t.Fatal(err)
	}
	if v != SchemaVersion {
		t.Fatalf("schema version=%d want %d", v, SchemaVersion)
	}
}

// An old database has no per-event mark, only the dataset-wide flag. The
// upgrade must keep its meaning: events of an adjusted dataset are baked in,
// events of a raw one are still pending.
func TestOpenUpgradesSchemaVersion3MarksAppliedSplits(t *testing.T) {
	path := filepath.Join(t.TempDir(), "v3.db")
	raw, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := raw.Exec(`
        CREATE TABLE dataset_meta (
            ticker              TEXT PRIMARY KEY,
            adjusted_for_splits INTEGER DEFAULT 0
        );
        CREATE TABLE splits (
            ticker  TEXT NOT NULL,
            date    TEXT NOT NULL,
            factor  REAL NOT NULL,
            PRIMARY KEY (ticker, date)
        );
        INSERT INTO dataset_meta (ticker, adjusted_for_splits) VALUES ('ADJ', 1), ('RAW', 0);
        INSERT INTO splits (ticker, date, factor) VALUES ('ADJ', '2024-01-04', 2), ('RAW', '2024-01-04', 2);
        CREATE TABLE schema_meta (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL);
        INSERT INTO schema_meta (id, version) VALUES (1, 3);
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
	pending, err := db.ListPendingSplits("ADJ")
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 0 {
		t.Fatalf("adjusted dataset has %d pending splits, want 0", len(pending))
	}
	if pending, err = db.ListPendingSplits("RAW"); err != nil {
		t.Fatal(err)
	}
	if len(pending) != 1 {
		t.Fatalf("raw dataset has %d pending splits, want 1", len(pending))
	}
}

// AUD-041: rows closed before the fix hold the per-share difference. The
// version-5 step scales them to money once, and only once.
func TestOpenUpgradesSchemaVersion4ScalesPnLAbsolute(t *testing.T) {
	path := filepath.Join(t.TempDir(), "v4.db")
	db, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	rows := []struct {
		id     string
		status string
		qty    any
		pnl    any
	}{
		{"closed10", "closed", 10.0, 5.0},
		{"closed1", "closed", 1.0, 5.0},
		{"noqty", "closed", nil, 5.0},
		{"open10", "open", 10.0, nil},
	}
	for _, r := range rows {
		if _, err := db.SQL.Exec(
			`INSERT INTO broker_trades (id, symbol, status, entry_date, entry_price, quantity, pnl_absolute) VALUES (?,?,?,?,?,?,?)`,
			r.id, "QQQ", r.status, "2026-09-01", 100.0, r.qty, r.pnl); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.SQL.Exec(`UPDATE schema_meta SET version=4 WHERE id=1`); err != nil {
		t.Fatal(err)
	}
	db.Close()

	want := map[string]any{"closed10": 50.0, "closed1": 5.0, "noqty": 5.0, "open10": nil}
	for pass := 1; pass <= 2; pass++ { // second Open must not scale again
		db, err = Open(path)
		if err != nil {
			t.Fatal(err)
		}
		for id, w := range want {
			var got sql.NullFloat64
			if err := db.SQL.QueryRow(`SELECT pnl_absolute FROM broker_trades WHERE id=?`, id).Scan(&got); err != nil {
				t.Fatal(err)
			}
			if w == nil {
				if got.Valid {
					t.Fatalf("pass %d: %s pnl_absolute=%v want NULL", pass, id, got.Float64)
				}
				continue
			}
			if !got.Valid || got.Float64 != w.(float64) {
				t.Fatalf("pass %d: %s pnl_absolute=%v want %v", pass, id, got, w)
			}
		}
		db.Close()
	}
}
