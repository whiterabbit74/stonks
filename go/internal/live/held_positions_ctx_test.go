package live

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

// hangPositionsBroker never answers on its own: Positions waits on the attempt
// context, so the read only ends when the engine's budget cancels it.
type hangPositionsBroker struct {
	MemoryBroker
}

func (h *hangPositionsBroker) Positions(ctx context.Context) ([]any, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func TestHeldSymbolsOnCancelsPositionsReadViaContext(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	e.Sleep = func(time.Duration) {}
	br := &hangPositionsBroker{}
	ctx, cancel := context.WithTimeout(context.Background(), 80*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, err := e.heldSymbolsOn(br, windowFromCtx(ctx))
	elapsed := time.Since(start)
	if elapsed > time.Second {
		t.Fatalf("positions read took %s; must follow the attempt context, not the un-cancellable Positions()", elapsed)
	}
	if err == nil {
		t.Fatal("cancelled positions read must return an error")
	}
}

func TestAggregateT1HonoursCallerContextOnPositionsRead(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	e.Sleep = func(time.Duration) {}
	e.Broker = &hangPositionsBroker{}
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	start := time.Now()
	_, _ = e.Aggregate(1, AggregateOpts{ForceSend: true, Ctx: ctx})
	elapsed := time.Since(start)
	if elapsed > time.Second {
		t.Fatalf("Aggregate T-1 took %s; must honour the caller context, not hang on positions", elapsed)
	}
}

func TestExecuteWindowCancelsEvaluatePositionsRead(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	e.Sleep = func(time.Duration) {}
	e.Broker = &hangPositionsBroker{}
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	w := execWindow{ctx: context.Background(), deadline: e.now().Add(-time.Second)}
	start := time.Now()
	_ = e.executeWindow(w, "telegram_t1")
	elapsed := time.Since(start)
	if elapsed > time.Second {
		t.Fatalf("executeWindow took %s; Evaluate must use the execution window, not hang on positions", elapsed)
	}
}

func TestSizeOrderCancelsPositionsReadViaContext(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	e.Sleep = func(time.Duration) {}
	br := &hangPositionsBroker{}
	ctx, cancel := context.WithTimeout(context.Background(), 80*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, err := e.sizeOrder("exit", "AAPL", e.AutoConfig(), 10, br, windowFromCtx(ctx))
	elapsed := time.Since(start)
	if elapsed > time.Second {
		t.Fatalf("sizeOrder took %s; must follow the execution window, not the un-cancellable Positions()", elapsed)
	}
	if err == nil {
		t.Fatal("cancelled sizing positions read must return an error")
	}
}

// hangAccountBroker never answers on its own: Account waits on the attempt
// context, so the read only ends when the engine's budget cancels it.
type hangAccountBroker struct {
	MemoryBroker
}

func (h *hangAccountBroker) Account(ctx context.Context) (map[string]any, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func TestSizeOrderCancelsAccountReadViaContext(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	e.Sleep = func(time.Duration) {}
	br := &hangAccountBroker{}
	ctx, cancel := context.WithTimeout(context.Background(), 80*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, err := e.sizeOrder("entry", "AAPL", e.AutoConfig(), 10, br, windowFromCtx(ctx))
	elapsed := time.Since(start)
	if elapsed > time.Second {
		t.Fatalf("sizeOrder took %s; must follow the execution window, not the un-cancellable Account()", elapsed)
	}
	if err == nil {
		t.Fatal("cancelled sizing account read must return an error")
	}
}

func TestSizeOrderCancelsRobinhoodAccountRead(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	e.Sleep = func(time.Duration) {}
	b := &RobinhoodBroker{
		account: "RH1",
		CallCtx: func(ctx context.Context, name string, args map[string]any) (json.RawMessage, error) {
			if name == "get_portfolio" {
				<-ctx.Done()
				return nil, ctx.Err()
			}
			return json.Marshal(map[string]any{})
		},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 80*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, err := e.sizeOrder("entry", "AAPL", e.AutoConfig(), 10, b, windowFromCtx(ctx))
	elapsed := time.Since(start)
	if elapsed > time.Second {
		t.Fatalf("sizeOrder took %s; Robinhood AccountCtx must follow the attempt context", elapsed)
	}
	if err == nil {
		t.Fatal("cancelled Robinhood account read must return an error")
	}
}
