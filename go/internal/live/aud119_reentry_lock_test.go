package live

import (
	"os"
	"strings"
	"testing"
)

// AUD-119: settleAndReenter used to send the re-entry order inside mu.Lock(),
// so the broker whose exit settled first held the lock through its own reads,
// retries and timeouts while the second, already flat, waited — the shared
// barrier on order submission §16 of CORE forbids. The guard is textual: the
// race needs timings to reproduce, the construction is visible statically.
func TestReentryOrderLeavesTheLock(t *testing.T) {
	raw, err := os.ReadFile("telegram.go")
	if err != nil {
		t.Fatal(err)
	}
	src := string(raw)
	start := strings.Index(src, "func (e *Engine) settleAndReenter(")
	if start < 0 {
		t.Fatal("settleAndReenter not found")
	}
	fn := src[start:]
	if i := strings.Index(fn[10:], "\nfunc "); i > 0 {
		fn = fn[:10+i]
	}
	send := strings.Index(fn, "e.executeWindowFor(")
	if send < 0 {
		t.Fatal("settleAndReenter no longer submits the re-entry")
	}
	if held := strings.LastIndex(fn[:send], "mu.Lock()"); held >= 0 {
		seg := fn[held:send]
		if strings.Contains(seg, "defer mu.Unlock()") || !strings.Contains(seg, "mu.Unlock()") {
			t.Fatal("the re-entry order is submitted while holding the shared lock")
		}
	}
}
