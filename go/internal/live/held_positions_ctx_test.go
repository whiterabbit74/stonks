package live

import (
	"context"
	"errors"
	"testing"
	"time"
)

// hangPositionsBroker implements ctxPositioner. Positions() sleeps (the
// pre-fix heldSymbolsOn path); PositionsCtx waits on the attempt context
// (the post-fix path).
type hangPositionsBroker struct {
	MemoryBroker
}

func (h *hangPositionsBroker) Positions() ([]any, error) {
	time.Sleep(3 * time.Second)
	return nil, errors.New("positions hung until sleep ended")
}

func (h *hangPositionsBroker) PositionsCtx(ctx context.Context) ([]any, error) {
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
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	start := time.Now()
	_, _ = e.Aggregate(1, AggregateOpts{ForceSend: true, Ctx: ctx})
	elapsed := time.Since(start)
	if elapsed > time.Second {
		t.Fatalf("Aggregate T-1 took %s; must honour the caller context, not hang on positions", elapsed)
	}
}
