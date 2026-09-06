package live

import (
	"context"
	"sync"
	"testing"
	"time"

	"mktorder.com/go/internal/types"
)

// AUD-005 (docs/audits/REGISTRY.md): the three T-1 runtime scenarios the
// existing scheduler tests do not reach — a broker slow enough to eat the
// close-of-session budget, a lease write that fails, and the process being
// stopped mid-cycle. Delayed ticks, restarts, Telegram failures and short
// trading days are already covered (TestTickMissedT11AtT8Alerts,
// TestTickT1SecondTickDoesNotPlace, TestT1ExecutionFinishedRetriesReportOnly,
// TestShortSessionClose).

// slowBroker advances the engine's clock by Cost on every placement and fails
// the placement, modelling a broker that answers too late to be worth asking
// again before the close.
type slowBroker struct {
	*MemoryBroker
	mu    sync.Mutex
	clock *time.Time
	cost  time.Duration
	calls int
}

func (b *slowBroker) PlaceMarketCfg(symbol, side string, qty float64, cfg PlaceMarketCfg) (OrderResult, error) {
	b.mu.Lock()
	b.calls++
	*b.clock = b.clock.Add(b.cost)
	b.mu.Unlock()
	return b.MemoryBroker.PlaceMarketCfg(symbol, side, qty, cfg)
}

func (b *slowBroker) placeCalls() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.calls
}

// TestAUD005SlowBrokerStopsAtDeadline: the first attempt burns most of the
// budget, so a second one cannot finish before the close. placeMarket must
// stop, say so, and not leave an order going out after the session ended.
func TestAUD005SlowBrokerStopsAtDeadline(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, mem := testEngine(t, bars)
	ny, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Fatal(err)
	}
	clock := time.Date(2026, 9, 1, 15, 59, 0, 0, ny)
	e.Now = func() time.Time { return clock }
	e.Sleep = func(time.Duration) {}
	// The placement fails without reaching the broker, and the lookup says the
	// id is unknown — the "safe to retry" case, so only the deadline can stop
	// the loop.
	mem.SetFailPlace("broker timeout", 0, false)
	br := &slowBroker{MemoryBroker: mem, clock: &clock, cost: 40 * time.Second}

	// Close is 16:00 ET, safety margin 5s: the budget is 55s and one 40s
	// attempt leaves 15s — less than the attempt just took.
	w := e.t1Window(context.Background())
	res, err := e.placeMarket(w, "AAPL", "BUY", 1, PlaceMarketCfg{}, br)

	if br.placeCalls() != 1 {
		t.Fatalf("want exactly one attempt inside the budget, got %d", br.placeCalls())
	}
	if res.Submitted {
		t.Fatal("a deadline abort must not report the order as submitted")
	}
	if err != ErrExecutionDeadlineExceeded {
		t.Fatalf("err=%v want %v", err, ErrExecutionDeadlineExceeded)
	}
	if res.Ambiguous {
		t.Fatal("nothing was sent on the aborted attempt, so it is not ambiguous")
	}
	if !hasAutotradeLog(t, e, "execution_deadline_exceeded") {
		t.Fatal("the operator is not told why the order stopped")
	}
	tg, ok := e.Telegram.(*MemoryTelegram)
	if !ok {
		t.Fatal("want MemoryTelegram")
	}
	if len(tg.Sent()) == 0 {
		t.Fatal("deadline abort must notify Telegram")
	}
}

// TestAUD005LeaseWriteFailureIsFailClosed: if the T-1 lease cannot be taken
// because the write itself fails, the cycle must abort. Executing without a
// lease is what lets a second process place the same order.
func TestAUD005LeaseWriteFailureIsFailClosed(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	// Make every lease read/write fail the way a broken or read-only database
	// would, without touching any other table.
	if _, err := db.SQL.Exec(`DROP TABLE aggregate_send_state`); err != nil {
		t.Fatal(err)
	}

	_, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true})
	if err == nil {
		t.Fatal("a failed lease write must surface as an error, not a silent success")
	}
	if len(br.Orders) != 0 {
		t.Fatalf("orders placed without a lease: %d", len(br.Orders))
	}
	pending, perr := db.ListPendingTrackers()
	if perr != nil {
		t.Fatal(perr)
	}
	if len(pending) != 0 {
		t.Fatalf("tracker created without a lease: %+v", pending)
	}
}

// ctxBroker honours cfg.Ctx the way LiveBroker and RobinhoodBroker do: a
// cancelled context means the HTTP call never reaches the broker.
type ctxBroker struct{ *MemoryBroker }

func (b *ctxBroker) PlaceMarketCfg(symbol, side string, qty float64, cfg PlaceMarketCfg) (OrderResult, error) {
	if err := cfg.ctx().Err(); err != nil {
		return OrderResult{Error: err.Error(), Symbol: symbol, Side: side, Quantity: qty}, err
	}
	return b.MemoryBroker.PlaceMarketCfg(symbol, side, qty, cfg)
}

// OrderDetailCtx is the lookup placeMarket uses to ask "did this order land
// anyway". A real broker's lookup fails on a cancelled context too.
func (b *ctxBroker) OrderDetailCtx(ctx context.Context, clientOrderID string) (map[string]any, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return b.MemoryBroker.OrderDetail(clientOrderID)
}

// TestAUD005StopDuringT1LeavesNoOrder: the process is stopped (context
// cancelled) while the T-1 cycle runs. No order may go out, nothing may be
// journaled, and no tracker may be left behind for an order that was never
// sent.
func TestAUD005StopDuringT1LeavesNoOrder(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, mem := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	br := &ctxBroker{MemoryBroker: mem}
	e.Broker = br
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	ctx, cancel := context.WithCancel(context.Background())
	// Stopped before the cycle reaches the broker.
	cancel()

	_, _ = e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true, Ctx: ctx})
	e.StopTrackers()

	if len(mem.Orders) != 0 {
		t.Fatalf("cancelled T-1 still placed %d order(s): %v", len(mem.Orders), sides(mem.Orders))
	}
	pending, err := db.ListPendingTrackers()
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 0 {
		t.Fatalf("cancelled T-1 left a tracker behind: %+v", pending)
	}
	trades, err := db.ListTrades("broker_trades")
	if err != nil {
		t.Fatal(err)
	}
	if len(trades) != 0 {
		t.Fatalf("cancelled T-1 wrote a journal row: %+v", trades)
	}
	// A shutdown is not an ambiguous submission: nothing was sent, so the day
	// must not be left in execution_unknown, which blocks the next entry until
	// an operator resolves it by hand (AUD-013).
	if hasAutotradeLog(t, e, "order_submit_status_unknown") {
		t.Fatal("a cancelled shutdown reported the order as possibly submitted")
	}
}
