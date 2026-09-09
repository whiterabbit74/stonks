package store

import "testing"

// AUD-116: startTracking saves the tracker after the order is placed, and the
// scheduler's poll can finalise that order first. A plain status overwrite put
// the finished order back in the polling queue and its fill was booked twice.
func TestSaveOrderTrackerKeepsTerminalStatus(t *testing.T) {
	db := openTestDB(t)
	rec := map[string]any{"clientOrderId": "x1", "symbol": "AAPL", "action": "exit", "quantity": 10}
	if err := db.SaveOrderTracker(rec); err != nil {
		t.Fatal(err)
	}
	if err := db.SetOrderTrackerStatus("x1", "filled"); err != nil {
		t.Fatal(err)
	}
	if err := db.SaveOrderTracker(rec); err != nil { // late startTracking write
		t.Fatal(err)
	}
	if got := db.GetOrderTracker("x1")["status"]; got != "filled" {
		t.Fatalf("status = %v, want filled", got)
	}
	pending, err := db.ListPendingTrackers()
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range pending {
		if p["clientOrderId"] == "x1" {
			t.Fatal("a filled order must not return to the polling queue")
		}
	}
}
