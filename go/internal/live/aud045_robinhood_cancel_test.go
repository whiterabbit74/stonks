package live

import (
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-045: Robinhood отдаёт заявки с полями ref_id и state. По
// client_order_id/status они получали пустой id и не отменялись перед
// входом, оставаясь висеть на бирже.
func TestOpenOrderCancelReadsRobinhoodFields(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})

	const stale = "own-stale-rh"
	if err := db.SaveOrderTracker(map[string]any{
		"clientOrderId": stale, "symbol": "AAPL", "action": "entry",
		"status": "filled", "quantity": 1.0, "dateKey": "2026-09-01",
	}); err != nil {
		t.Fatal(err)
	}
	br.Open = []any{map[string]any{"symbol": "AAPL", "state": "queued", "ref_id": stale}}

	e.Execute("test")
	if len(br.Cancelled) != 1 || br.Cancelled[0] != stale {
		t.Fatalf("working Robinhood order must be cancelled before entry, cancelled=%v", br.Cancelled)
	}
}
