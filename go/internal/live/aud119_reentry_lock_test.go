package live

import (
	"os"
	"strings"
	"testing"
)

// AUD-119: the re-entry order used to be sent inside mu.Lock(), so the broker
// that settled first held the lock through its own reads, retries and
// timeouts while the second, already flat, waited — the shared barrier on
// order submission CORE forbids. In the cycle every broker's orders are sent
// from followAt, and follow may take the shared lock only to store a result,
// never around followAt. The guard is textual: the race needs timings to
// reproduce, the construction is visible statically.
func TestBrokerOrdersLeaveTheSharedLock(t *testing.T) {
	raw, err := os.ReadFile("execute_all.go")
	if err != nil {
		t.Fatal(err)
	}
	src := string(raw)
	start := strings.Index(src, "func (e *Engine) follow(")
	if start < 0 {
		t.Fatal("follow not found")
	}
	fn := src[start:]
	if i := strings.Index(fn[10:], "\nfunc "); i > 0 {
		fn = fn[:10+i]
	}
	send := strings.Index(fn, "e.followAt(")
	if send < 0 {
		t.Fatal("follow no longer runs the brokers through followAt")
	}
	if held := strings.LastIndex(fn[:send], "mu.Lock()"); held >= 0 && !strings.Contains(fn[held:send], "mu.Unlock()") {
		t.Fatal("a broker's orders are sent while holding the shared lock")
	}
}
