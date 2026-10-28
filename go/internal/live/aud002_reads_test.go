package live

import (
	"fmt"

	"strings"
	"testing"
)

// AUD-002: an exit fill whose local rows cannot be read used to be dropped in
// silence — the broker was flat, the journal still showed the position open,
// and nothing told the operator.
func TestAUD002UnreadableJournalOnExitFillRaisesBlock(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	id := "oid-exit-unreadable"
	seedOrderMeta(e, id, orderMeta{
		Action: "exit", Symbol: "AAPL", Quantity: 1,
		Broker: "webull", DateKey: "2026-09-01",
	})
	if _, err := e.DB.SQL.Exec(`DROP TABLE positions`); err != nil {
		t.Fatal(err)
	}
	e.recordFill(map[string]any{
		"clientOrderId": id, "symbol": "AAPL", "action": "exit",
		"quantity": 1.0, "dateKey": "2026-09-01", "broker": "webull",
	}, map[string]any{"status": "filled", "filled_qty": 1.0, "avg_price": 10.0}, "filled")

	if !e.trackerPersistBlocked("webull") {
		t.Fatal("an unrecordable exit fill must raise the tracker persist block")
	}
	logs, err := e.DB.ListAutotradeLogs(50)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, l := range logs {
		if strings.Contains(fmt.Sprint(l["message"]), "local_trade_close_failed") {
			found = true
		}
	}
	if !found {
		t.Fatalf("operator must see why the exit was not journaled: %+v", logs)
	}
}
