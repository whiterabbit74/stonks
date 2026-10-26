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

// A ticker the monitoring does not hold is not a finding at all: it is
// autotrade's to clear on the monitoring's next exit, and T-11 lists it as
// plain information (CORE §3).
func TestConsistencyIgnoresTickerTheMonitoringDoesNotHold(t *testing.T) {
	e, webull, rh := dualBrokerEngine(t, entryBars)
	webull.Pos = []any{map[string]any{"symbol": "TQQQ", "quantity": 10.0}}
	rh.Pos = []any{map[string]any{"symbol": "TQQQ", "quantity": 5.0}}
	snap := e.Consistency()
	if issues, _ := snap["issues"].([]map[string]any); len(issues) != 0 {
		t.Fatalf("a leftover is no finding: %+v", issues)
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

// An unreadable broker book is still reported, and named by its broker.
func TestUnreadableBookIsReported(t *testing.T) {
	e, webull, rh := dualBrokerEngine(t, entryBars)
	webull.FailPositions = fmt.Errorf("positions down")
	rh.Pos = nil
	issues, _ := e.Consistency()["issues"].([]map[string]any)
	if len(issues) != 1 || fmt.Sprint(issues[0]["code"]) != "broker_positions_unavailable" || issues[0]["broker"] != "webull" {
		t.Fatalf("unreadable Webull book must be reported as Webull's: %+v", issues)
	}
}

// Позиции читаются у каждого брокера и остаются раздельными: слитая в один
// map книга — это ровно тот способ, которым состояние Webull начинает решать
// за Robinhood.
func TestHeldSymbolsStayPerBroker(t *testing.T) {
	e, webull, rh := dualBrokerEngine(t, entryBars)
	webull.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 1.0}}
	rh.Pos = []any{map[string]any{"symbol": "MSFT", "quantity": 2.0}}
	byBroker := map[string]map[string]float64{}
	for name, bk := range e.heldSymbolsByBrokerBooks(backgroundWindow()) {
		if bk.err != nil {
			t.Fatal(bk.err)
		}
		byBroker[name] = bk.held
	}
	if byBroker["webull"]["AAPL"] != 1 || len(byBroker["webull"]) != 1 {
		t.Fatalf("Webull держит только AAPL, got %v", byBroker["webull"])
	}
	if byBroker["robinhood"]["MSFT"] != 2 || len(byBroker["robinhood"]) != 1 {
		t.Fatalf("Robinhood держит только MSFT, got %v", byBroker["robinhood"])
	}
}
