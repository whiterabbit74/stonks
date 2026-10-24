package store

import (
	"os"
	"path/filepath"
	"testing"
)

// AUD-182: closepos -dry opened the database through Open, which creates a
// missing file, runs the schema steps and changes permissions.
func TestOpenReadOnlyWritesNothing(t *testing.T) {
	dir := t.TempDir()
	missing := filepath.Join(dir, "absent.db")
	if db, err := OpenReadOnly(missing); err == nil {
		db.Close()
		t.Fatal("a missing path must be an error")
	}
	if _, err := os.Stat(missing); !os.IsNotExist(err) {
		t.Fatalf("read-only open created %s: %v", missing, err)
	}

	path := filepath.Join(dir, "t.db")
	db, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.SQL.Exec(`UPDATE schema_meta SET version = 7`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	if err := os.Chmod(path, 0o644); err != nil {
		t.Fatal(err)
	}

	ro, err := OpenReadOnly(path)
	if err != nil {
		t.Fatal(err)
	}
	defer ro.Close()
	if _, err := ro.ListPositions(); err != nil {
		t.Fatalf("read failed: %v", err)
	}
	var v int
	if err := ro.SQL.QueryRow(`SELECT version FROM schema_meta`).Scan(&v); err != nil || v != 7 {
		t.Fatalf("schema version %d err %v, want the old 7 untouched", v, err)
	}
	if _, err := ro.SQL.Exec(`UPDATE schema_meta SET version = 8`); err == nil {
		t.Fatal("a write went through the read-only handle")
	}
	if fi, _ := os.Stat(path); fi.Mode().Perm() != 0o644 {
		t.Fatalf("permissions changed to %v", fi.Mode().Perm())
	}
}
