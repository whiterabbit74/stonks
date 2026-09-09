package live

import (
	"fmt"
	"testing"

	"mktorder.com/go/internal/store"
)

// Consistency no longer compares the journal against itself — there is one row
// per position — so what is left is the journal against the brokers' live books.

// A position the journal knows about is not a finding, on any broker.
func TestConsistencyIsSilentOnAJournaledPosition(t *testing.T) {
	e, webull, rh := dualBrokerEngine(t, entryBars)
	webull.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 1.0}}
	rh.Pos = nil
	if err := e.DB.SavePosition(store.Position{
		ID: "p1", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-01",
		EntryPrice: store.Ptr[float64](10.0), Quantity: 1,
		Webull: store.BrokerLeg{Qty: 1, EntryPrice: store.Ptr[float64](10.0), EntryOrderID: "w1"},
	}); err != nil {
		t.Fatal(err)
	}
	snap := e.Consistency()
	issues, _ := snap["issues"].([]map[string]any)
	if len(issues) != 0 {
		t.Fatalf("a journaled position is not a finding: %+v", issues)
	}
	if BlockingMismatch(snap) != nil {
		t.Fatalf("nothing here blocks entries: %+v", issues)
	}
}

// Both brokers holding the same journaled ticker is the normal two-broker case,
// not a discrepancy. The old reconciler reported it because each broker had its
// own row and the pairing failed.
func TestConsistencySilentWhenBothBrokersHoldTheSamePosition(t *testing.T) {
	e, webull, rh := dualBrokerEngine(t, entryBars)
	webull.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 1.0}}
	rh.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 2.0}}
	if err := e.DB.SavePosition(store.Position{
		ID: "p1", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-01",
		EntryPrice: store.Ptr[float64](10.0), Quantity: 3,
		Webull:    store.BrokerLeg{Qty: 1, EntryOrderID: "w1"},
		Robinhood: store.BrokerLeg{Qty: 2, EntryOrderID: "r1"},
	}); err != nil {
		t.Fatal(err)
	}
	issues, _ := e.Consistency()["issues"].([]map[string]any)
	if len(issues) != 0 {
		t.Fatalf("two legs of one position are not a mismatch: %+v", issues)
	}
}

// A ticker held with nothing in the journal is worth saying out loud, but it
// does not block: the engine exits a held position on its signal whether or not
// the journal knows about it.
func TestConsistencyReportsHeldTickerWithoutJournalWithoutBlocking(t *testing.T) {
	e, webull, rh := dualBrokerEngine(t, entryBars)
	webull.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 1.0}}
	rh.Pos = nil
	snap := e.Consistency()
	issues, _ := snap["issues"].([]map[string]any)
	if len(issues) != 1 || fmt.Sprint(issues[0]["code"]) != "broker_position_without_journal" {
		t.Fatalf("want one note about the unjournaled position: %+v", issues)
	}
	if BlockingMismatch(snap) != nil {
		t.Fatal("an unjournaled broker position must not block entries")
	}
}

// A journaled position whose leg is missing is repairable from the book, and
// Reconcile says so.
func TestConsistencyOffersToFillAMissingLeg(t *testing.T) {
	e, webull, rh := dualBrokerEngine(t, entryBars)
	webull.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 4.0}}
	rh.Pos = nil
	_ = e.DB.SavePosition(store.Position{ID: "p1", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-01"})
	issues, _ := e.Consistency()["issues"].([]map[string]any)
	if len(issues) != 1 || fmt.Sprint(issues[0]["code"]) != "position_leg_missing" {
		t.Fatalf("want a repairable leg finding: %+v", issues)
	}
	if issues[0]["autoFixable"] != true {
		t.Fatalf("filling a leg from the book is auto-applicable: %+v", issues[0])
	}
}

// An unreadable broker book is the one live finding that still blocks: we do
// not know what we hold, and buying on that is how a position gets opened twice.
func TestUnreadableBookBlocksEntries(t *testing.T) {
	e, webull, rh := dualBrokerEngine(t, entryBars)
	webull.FailPositions = fmt.Errorf("positions down")
	rh.Pos = nil
	snap := e.Consistency()
	block := BlockingMismatch(snap)
	if block == nil || fmt.Sprint(block["code"]) != "broker_positions_unavailable" {
		t.Fatalf("unreadable book must block: %+v", snap["issues"])
	}
	// It blocks that broker, not the other one.
	if BlockingMismatchFor(snap, "robinhood") != nil {
		t.Fatal("Webull's unreadable book must not block Robinhood")
	}
}

// Позиции читаются у каждого брокера и остаются раздельными: слитая в один
// map книга — это ровно тот способ, которым состояние Webull начинает решать
// за Robinhood.
func TestHeldSymbolsStayPerBroker(t *testing.T) {
	e, webull, rh := dualBrokerEngine(t, entryBars)
	webull.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 1.0}}
	rh.Pos = []any{map[string]any{"symbol": "MSFT", "quantity": 2.0}}
	byBroker, err := e.heldSymbolsByBroker()
	if err != nil {
		t.Fatal(err)
	}
	if byBroker["webull"]["AAPL"] != 1 || len(byBroker["webull"]) != 1 {
		t.Fatalf("Webull держит только AAPL, got %v", byBroker["webull"])
	}
	if byBroker["robinhood"]["MSFT"] != 2 || len(byBroker["robinhood"]) != 1 {
		t.Fatalf("Robinhood держит только MSFT, got %v", byBroker["robinhood"])
	}
}
