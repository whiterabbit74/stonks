package httpapi

import (
	"path/filepath"
	"testing"

	"mktorder.com/go/internal/store"
)

// AUD-026 class: an unreadable robinhood_oauth row looked exactly like "not
// connected", and the broker was left unattached for the whole process — so
// its positions and open orders never reached the T-1 reconcile and an entry
// would go out as if nothing were held there.
func TestAUD026UnreadableRobinhoodRowStillAttachesBroker(t *testing.T) {
	t.Setenv("ADMIN_PASSWORD", "test-secret")
	t.Setenv("GO_ENV", "development")
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := db.SQL.Exec(`DROP TABLE robinhood_oauth`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.GetRobinhoodOAuthErr(); err == nil {
		t.Fatal("the row must be unreadable for this test to mean anything")
	}

	s := New(db, dir)
	if s.Live.Brokers["robinhood"] == nil {
		t.Fatal("a failed token read left the Robinhood broker unattached and its book invisible")
	}
}
