package live

import (
	"testing"

	"mktorder.com/go/internal/store"
)

// CanSubmit is the "running" flag the UI shows. It used to ask only about the
// Webull token, so a Robinhood-only setup read as stopped while it was placing
// orders — the AUD-017 class: one broker's state reported as the system's.
func TestCanSubmitSeesARobinhoodOnlySetup(t *testing.T) {
	db, err := store.Open(t.TempDir() + "/t.db")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := New(db, &MemoryQuotes{})
	e.AttachBroker("robinhood", &MemoryBroker{Name: "robinhood"})
	if err := db.SaveRobinhoodTokens("tok", "ref", "Bearer", "trading", ""); err != nil {
		t.Fatal(err)
	}
	if err := db.UpsertRobinhoodHealth("2026-09-01", HealthOK, ""); err != nil {
		t.Fatal(err)
	}
	e.PatchAutoConfig(map[string]any{
		"enabled": true,
		"brokers": map[string]any{"robinhood": map[string]any{"enabled": true, "allowNewEntries": true}},
	})
	if !e.CanSubmit() {
		t.Fatal("a healthy enabled Robinhood is a broker that can submit")
	}
}
