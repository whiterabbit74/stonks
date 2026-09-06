package live

import (
	"testing"

	"mktorder.com/go/internal/types"
)

// TestExitJournalWriteFailureBlocksEntries covers AUD-035: the exit fill is
// real, but the journal refused the close. Every read failure on this path
// already raises the tracker-persist block; the write failure used to be a log
// line only, so the journal kept showing an open position and nothing stopped
// the next entry.
func TestExitJournalWriteFailureBlocksEntries(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, _ := testEngine(t, bars)

	const oid = "exit-1"
	if err := db.InsertTrade("broker_trades", map[string]any{
		"id": "b-1", "symbol": "AAPL", "status": "open", "entryDate": "2026-09-01",
		"entryPrice": 10.0, "quantity": 2.0, "broker": "webull",
	}); err != nil {
		t.Fatal(err)
	}
	// Reads keep working; only the closing UPDATE is refused.
	if _, err := db.SQL.Exec(`CREATE TRIGGER refuse_close BEFORE UPDATE ON broker_trades
		BEGIN SELECT RAISE(ABORT, 'journal is read-only'); END`); err != nil {
		t.Fatal(err)
	}

	if e.trackerPersistBlocked("webull") {
		t.Fatal("setup: entries must not be blocked yet")
	}
	e.recordFill(map[string]any{
		"clientOrderId": oid, "symbol": "AAPL", "action": "exit",
		"quantity": 2.0, "dateKey": "2026-09-01", "broker": "webull",
	}, map[string]any{"filled_price": 11.0, "filled_qty": 2.0}, "filled")

	if !e.trackerPersistBlocked("webull") {
		t.Fatal("an exit fill the journal did not record must block further entries")
	}
}
