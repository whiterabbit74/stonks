package live

import (
	"fmt"
	"mktorder.com/go/internal/store"
	"strings"
	"testing"
)

// AUD-002: the exit-fill journal read. An unreadable journal used to make
// awaitFlatAfterExit answer "flat", which is the same answer as a closed
// position — so the T-1 re-entry fired on top of a position that may still
// have been open.
func TestAUD002UnreadableJournalIsNotFlat(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	if !e.awaitFlatAfterExit(nil) {
		t.Fatal("an empty journal is flat")
	}
	if _, err := e.DB.SQL.Exec(`DROP TABLE positions`); err != nil {
		t.Fatal(err)
	}
	if e.awaitFlatAfterExit(nil) {
		t.Fatal("an unreadable journal must not be reported as flat")
	}
}

// AUD-002: UpdatePositions writes on what it reads. An unreadable monitor
// journal looked like "no open trades" and cleared isOpenPosition and
// currentTradeId on every watch, while still reporting success.
func TestAUD002UnreadableJournalDoesNotClearOpenWatches(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	if err := e.DB.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.1, "highIBS": 0.75}); err != nil {
		t.Fatal(err)
	}
	if err := e.DB.SavePosition(store.Position{ID: "t-aapl", Symbol: "AAPL", Status: "open", EntryDate: "2026-09-01", EntryPrice: store.Ptr[float64](10.0)}); err != nil {
		t.Fatal(err)
	}
	if res := e.UpdatePositions(); res["success"] != true {
		t.Fatalf("healthy read must succeed: %+v", res)
	}
	if _, err := e.DB.SQL.Exec(`DROP TABLE positions`); err != nil {
		t.Fatal(err)
	}
	res := e.UpdatePositions()
	if res["success"] != false || res["error"] != "state_read_failed" {
		t.Fatalf("unreadable journal must fail loudly: %+v", res)
	}
	watches, err := e.DB.ListWatches()
	if err != nil {
		t.Fatal(err)
	}
	for _, w := range watches {
		if b, _ := w["isOpenPosition"].(bool); !b {
			t.Fatalf("open flag must survive an unreadable journal: %+v", w)
		}
	}
}

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
