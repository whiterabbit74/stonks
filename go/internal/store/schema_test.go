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
