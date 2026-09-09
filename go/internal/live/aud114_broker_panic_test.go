package live

import (
	"context"
	"testing"
	"time"
)

// panicBroker imitates an adapter that blows up while parsing a broker answer:
// a nil map, an index out of range. The engine must survive it.
type panicBroker struct {
	MemoryBroker
}

func (p *panicBroker) Positions(context.Context) ([]any, error) { panic("audit: broker down") }
func (p *panicBroker) OpenOrders(context.Context) ([]any, error) {
	panic("audit: broker down")
}

func TestBrokerPanicStaysWithThatBroker(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	e.Sleep = func(time.Duration) {}
	healthy := &MemoryBroker{Pos: []any{map[string]any{"symbol": "AAPL", "quantity": 5}}}
	e.Brokers = map[string]Broker{"webull": &panicBroker{}, "robinhood": healthy}

	books := e.heldSymbolsByBrokerBooks(backgroundWindow())
	if books["webull"].err == nil {
		t.Fatal("a panicking broker must end with its own read error")
	}
	if got := books["robinhood"].held["AAPL"]; got != 5 {
		t.Fatalf("healthy broker book = %v; a peer panic must not touch it", got)
	}

	_, entryOnlyBlocked, reasons := e.t1BrokerReconcile(backgroundWindow())
	if !entryOnlyBlocked["webull"] || reasons["webull"] != "open_orders_unavailable" {
		t.Fatalf("panicking broker preflight = %v/%v; want its own blocked entry", entryOnlyBlocked, reasons)
	}
	if entryOnlyBlocked["robinhood"] {
		t.Fatal("a peer panic must not block the healthy broker's entry")
	}

	// awaitBrokerBooksFlat runs the same read with nothing above it to recover.
	e.awaitBrokerBooksFlat(backgroundWindow(), []string{"webull"})
}
