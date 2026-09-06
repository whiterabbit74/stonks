package live

import (
	"sync"
	"testing"
)

// AUD-012 (docs/audits/REGISTRY.md): the operator resolves a tracker by hand
// at the same moment the automatic poll finalizes it.

// TestAUD004ResolveTrackerRacesPoll has the operator resolve a tracker by hand
// at the same moment the automatic poll finalizes it. Both paths call
// recordFill; only one journal row and one close may result.
func TestAUD004ResolveTrackerRacesPoll(t *testing.T) {
	e, w, _ := dualBrokerEngine(t, entryBars)
	ev := e.Execute("t1")
	if !ev.Executed {
		t.Fatalf("entry not submitted: %+v", ev.Broker)
	}
	e.StopTrackers()
	id := w.Orders[0].ClientOrderID
	ordered := asFloat(trackerFor(t, e, id)["quantity"])
	w.SetDetail(id, map[string]any{
		"status": "FILLED", "client_order_id": id,
		"filled_qty": ordered, "filled_price": 8.25,
	})

	var wg sync.WaitGroup
	wg.Add(2)
	start := make(chan struct{})
	go func() {
		defer wg.Done()
		<-start
		e.PollTrackers()
	}()
	go func() {
		defer wg.Done()
		<-start
		_, _ = e.ResolveTracker(id, "filled", "manual check at broker", 8.25, ordered)
	}()
	close(start)
	wg.Wait()

	if rows := brokerRows(t, e.DB, id); len(rows) != 1 {
		t.Fatalf("want exactly one journal row, got %d: %+v", len(rows), rows)
	}
	if e.trackerPersistBlocked("webull") {
		t.Fatal("the race raised a tracker-persist block: entries are now wrongly blocked")
	}
}
