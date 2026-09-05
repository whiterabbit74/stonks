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
