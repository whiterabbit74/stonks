package httpapi

import (
	"encoding/json"
	"strings"
	"testing"

	"mktorder.com/go/internal/live"
)

// TestTrackerResolveEndpoint covers P0-2's HTTP surface: an execution_unknown
// tracker blocks entries; POST .../resolve with outcome=absent clears it and
// deletes the phantom journal row; a second resolve on the same tracker
// fails cleanly instead of double-recording anything.
func TestTrackerResolveEndpoint(t *testing.T) {
	s, _, br := liveServer(t)
	prevLagWait := live.ListingLagWait
	live.ListingLagWait = 0
	t.Cleanup(func() { live.ListingLagWait = prevLagWait })
	br.ListingLag = true
	s.Live.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})

	rec := postJSON(s, "/api/autotrade/execute", map[string]any{})
	if rec.Code != 200 {
		t.Fatalf("execute %d %s", rec.Code, rec.Body.String())
	}
	if len(br.Orders) != 1 {
		t.Fatalf("want 1 broker order, got %+v", br.Orders)
	}
	oid := br.Orders[0].ClientOrderID
	s.Live.PollTrackers()

	row, err := s.DB.AnyPendingTrackerFor("webull")
	if err != nil {
		t.Fatal(err)
	}
	if row == nil {
		t.Fatal("execution_unknown must block entries before resolve")
	}

	// Wrong outcome value is rejected.
	rec = postJSON(s, "/api/autotrade/trackers/"+oid+"/resolve", map[string]any{"outcome": "maybe", "note": "x"})
	if rec.Code != 400 {
		t.Fatalf("invalid outcome: want 400, got %d %s", rec.Code, rec.Body.String())
	}

	// Missing note is rejected.
	rec = postJSON(s, "/api/autotrade/trackers/"+oid+"/resolve", map[string]any{"outcome": "absent"})
	if rec.Code != 400 {
		t.Fatalf("missing note: want 400, got %d %s", rec.Code, rec.Body.String())
	}

	// Unknown clientOrderId 404s.
	rec = postJSON(s, "/api/autotrade/trackers/does-not-exist/resolve", map[string]any{"outcome": "absent", "note": "x"})
	if rec.Code != 404 {
		t.Fatalf("unknown tracker: want 404, got %d %s", rec.Code, rec.Body.String())
	}

	rec = postJSON(s, "/api/autotrade/trackers/"+oid+"/resolve", map[string]any{"outcome": "absent", "note": "checked with broker, no such order"})
	if rec.Code != 200 {
		t.Fatalf("resolve absent %d %s", rec.Code, rec.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out["ok"] != true {
		t.Fatalf("resolve response: %v", out)
	}
	row, err = s.DB.AnyPendingTrackerFor("webull")
	if err != nil {
		t.Fatal(err)
	}
	if row != nil {
		t.Fatal("resolve(absent) must lift the entry block")
	}

	// Resolving an already-resolved tracker fails.
	rec = postJSON(s, "/api/autotrade/trackers/"+oid+"/resolve", map[string]any{"outcome": "absent", "note": "again"})
	if rec.Code != 400 {
		t.Fatalf("double resolve: want 400, got %d %s", rec.Code, rec.Body.String())
	}
}

// TestTrackerPersistBlockResolveEndpoint covers P1-8's HTTP surface: clearing
// a broker with no block set errors, clearing without a note errors, and a
// successful clear records the reason in autotrade_logs.
func TestTrackerPersistBlockResolveEndpoint(t *testing.T) {
	s, _, _ := liveServer(t)

	rec := postJSON(s, "/api/autotrade/trackers/persist-block/webull/resolve", map[string]any{"note": "nothing to clear"})
	if rec.Code != 400 {
		t.Fatalf("clearing an unset block: want 400, got %d %s", rec.Code, rec.Body.String())
	}

	// Force the block on directly (SaveOrderTracker failure paths are
	// exercised at the live package level; here we only need the block set
	// to test the HTTP surface that lifts it).
	if err := s.DB.SaveSettings(map[string]any{"trackerPersistFail": map[string]any{"webull": true}}); err != nil {
		t.Fatal(err)
	}
	s.Live = live.New(s.DB, s.Live.Quotes) // fresh engine reads the persisted block

	rec = postJSON(s, "/api/autotrade/trackers/persist-block/webull/resolve", map[string]any{})
	if rec.Code != 400 {
		t.Fatalf("missing note: want 400, got %d %s", rec.Code, rec.Body.String())
	}

	rec = postJSON(s, "/api/autotrade/trackers/persist-block/webull/resolve", map[string]any{"note": "checked Webull orders by hand"})
	if rec.Code != 200 {
		t.Fatalf("resolve %d %s", rec.Code, rec.Body.String())
	}

	logs, err := s.DB.ListAutotradeLogs(50)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, l := range logs {
		if strings.Contains(fmtStr(l["message"]), "tracker_persist_block_cleared") && strings.Contains(fmtStr(l["message"]), "checked Webull orders by hand") {
			found = true
		}
	}
	if !found {
		t.Fatal("clearing the block must be recorded in autotrade_logs")
	}
}

func fmtStr(v any) string {
	s, _ := v.(string)
	return s
}
