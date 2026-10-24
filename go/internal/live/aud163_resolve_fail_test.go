package live

import (
	"testing"
	"time"

	"mktorder.com/go/internal/types"
)

// AUD-163: when the final status could not be written, ResolveTracker still
// answered success and the operator saw "resolved" on a pending order.
func TestResolveTrackerReportsFailedWrite(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	br.ListingLag = true
	prev := ListingLagWait
	ListingLagWait = 0
	t.Cleanup(func() { ListingLagWait = prev })
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	if res := e.Execute("t1"); !res.Executed {
		t.Fatalf("submit %+v", res.Broker)
	}
	oid := br.Orders[0].ClientOrderID
	if _, err := db.SQL.Exec(`CREATE TRIGGER no_final BEFORE UPDATE OF status ON order_trackers BEGIN SELECT RAISE(ABORT, 'locked'); END;`); err != nil {
		t.Fatal(err)
	}
	if _, err := e.ResolveTracker(oid, "absent", "checked at broker", 0, 0); err == nil {
		t.Fatal("a status that was not written must not be reported as resolved")
	}
}
