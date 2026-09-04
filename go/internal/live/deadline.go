package live

import (
	"context"
	"fmt"
	"time"

	"mktorder.com/go/internal/tradingdate"
)

// T1DeadlineSafetyMargin is subtracted from today's close time to get the
// hard deadline by which a T-1 order must have been decided one way or
// another. It lives here as a package var (like T1LeaseTTL) rather than in
// the operator-facing autoTrading config, so it stays outside the sanitizer
// P1-6 already owns and tests can still tune it freely. See P1-1 in
// AUTOTRADE_ROADMAP.md.
var T1DeadlineSafetyMargin = 5 * time.Second

// execWindow carries the budget an in-flight execution has left. ctx is
// handed down to the actual broker HTTP/MCP call so a slow one gets
// cancelled instead of eating the whole minute. deadline is compared against
// e.now() (which tests can pin to a fixed instant) to decide whether another
// retry is even worth starting — a real context's timer runs on the real
// wall clock and would not reflect a test's simulated elapsed time.
//
// A zero execWindow (deadline.IsZero()) means "no deadline": the paths that
// are not the T-1 close-of-session order (manual execute, TestBuy,
// ClosePosition) keep behaving exactly as before this change.
type execWindow struct {
	ctx      context.Context
	deadline time.Time
}

// backgroundWindow is the no-deadline execWindow used by callers outside the
// T-1 close-of-session path.
func backgroundWindow() execWindow {
	return execWindow{ctx: context.Background()}
}

// windowFromCtx wraps an externally supplied context (e.g. an HTTP request's)
// with no deadline of its own — used by manual/API-triggered executions that
// are not racing the session close.
func windowFromCtx(ctx context.Context) execWindow {
	if ctx == nil {
		ctx = context.Background()
	}
	return execWindow{ctx: ctx}
}

func (w execWindow) parentCtx() context.Context {
	if w.ctx != nil {
		return w.ctx
	}
	return context.Background()
}

// t1Deadline computes the wall-clock instant, in the engine's own clock
// domain (e.now(), which tests pin), beyond which an order for today's close
// is no longer worth attempting — it would risk arriving after the session
// actually closed. closeTime comes from e.sessionCloseMin(), the same close
// the T-11/T-1 messages already use.
func (e *Engine) t1Deadline(safetyMargin time.Duration) time.Time {
	closeMin, _ := e.sessionCloseMin()
	p := tradingdate.CurrentTimeNYSE(e.now())
	nowSec := p.Hour*3600 + p.Minute*60 + e.now().Second()
	secondsUntilClose := closeMin*60 - nowSec
	return e.now().Add(time.Duration(secondsUntilClose)*time.Second - safetyMargin)
}

// t1Window builds the execWindow for a T-1 close-of-session execution: ctx
// wraps parent for real cancellation, deadline stays in the engine's clock
// domain for the retry-budget checks in placeMarket / retryBrokerReadWindow.
func (e *Engine) t1Window(parent context.Context) execWindow {
	if parent == nil {
		parent = context.Background()
	}
	return execWindow{ctx: parent, deadline: e.t1Deadline(T1DeadlineSafetyMargin)}
}

// timeLeft reports how much budget remains until w.deadline, on the engine's
// own clock. A zero execWindow has no deadline and reports a generous
// duration so unlimited-retry callers are unaffected.
func (e *Engine) timeLeft(w execWindow) time.Duration {
	if w.deadline.IsZero() {
		return time.Hour
	}
	return w.deadline.Sub(e.now())
}

// deadlineExceeded reports whether another attempt is not worth starting:
// either the deadline has already passed, or less time remains than the
// previous attempt took (lastDur). lastDur == 0 (the first attempt) never
// trips the second condition — the first attempt always goes out, even with
// little time left, since skipping it outright would guarantee no order at
// all.
func (e *Engine) deadlineExceeded(w execWindow, lastDur time.Duration) bool {
	if w.deadline.IsZero() {
		return false
	}
	left := e.timeLeft(w)
	if left <= 0 {
		return true
	}
	return lastDur > 0 && left < lastDur
}

// attemptContext derives a per-attempt context: cancelled at the remaining
// T-1 budget (computed on the engine's own clock), layered on top of
// whatever the caller's parent context already carries. Callers must call
// the returned cancel func once the attempt finishes.
func (e *Engine) attemptContext(w execWindow) (context.Context, context.CancelFunc) {
	parent := w.parentCtx()
	if w.deadline.IsZero() {
		return context.WithCancel(parent)
	}
	remaining := e.timeLeft(w)
	if remaining < 0 {
		remaining = 0
	}
	return context.WithTimeout(parent, remaining)
}

// notifyDeadlineExceeded tells the operator an order/read was abandoned
// because the T-1 close-of-session deadline ran out — silence here would
// look like a normal skip rather than a budget failure.
func (e *Engine) notifyDeadlineExceeded(what, symbol, side string, qty float64) {
	qtyS := ""
	if qty > 0 {
		qtyS = fmt.Sprintf(" • %v шт.", qty)
	}
	_ = e.Send(e.chat(), fmt.Sprintf(
		"<b>Дедлайн T-1 истёк</b>\n%s • %s • %s%s\nБольше попыток не будет — до закрытия не хватило времени.",
		what, symbol, side, qtyS))
}
