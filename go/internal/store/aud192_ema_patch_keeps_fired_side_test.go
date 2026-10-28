package store

import "testing"

// AUD-192: PATCH {enabled} upserts the row it read; if the alert fired in
// between, the stale nextAction undid the flip. An upsert without nextAction
// keeps the side the alert is on.
func TestEMAUpsertWithoutNextActionKeepsFiredSide(t *testing.T) {
	d := openTestDB(t)
	id, err := d.UpsertEMAAlert(map[string]any{"symbol": "SPY", "nextAction": "buy"})
	if err != nil {
		t.Fatal(err)
	}
	if err := d.MarkEMATriggered(id, "buy", -1.2, "2026-10-28"); err != nil {
		t.Fatal(err)
	}
	if _, err := d.UpsertEMAAlert(map[string]any{"id": id, "symbol": "SPY", "enabled": false}); err != nil {
		t.Fatal(err)
	}
	a, err := d.GetEMAAlert(id)
	if err != nil || a == nil {
		t.Fatalf("get: %v %v", a, err)
	}
	if a.NextAction != "sell" || a.Enabled {
		t.Fatalf("nextAction=%v enabled=%v, want sell/false", a.NextAction, a.Enabled)
	}
	if _, err := d.UpsertEMAAlert(map[string]any{"id": id, "symbol": "SPY", "nextAction": "buy"}); err != nil {
		t.Fatal(err)
	}
	if a, _ := d.GetEMAAlert(id); a.NextAction != "buy" {
		t.Fatalf("an explicit nextAction must still apply, got %v", a.NextAction)
	}
}
