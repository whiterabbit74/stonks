package live

import (
	"os"
	"strings"
	"testing"
)

func TestCloseCountdownUsesOneNowSnapshot(t *testing.T) {
	for _, name := range []string{"deadline.go", "autotrade.go"} {
		b, err := os.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		s := string(b)
		var fn string
		if name == "deadline.go" {
			fn = sliceFn(s, "func (e *Engine) t1Deadline(")
		} else {
			fn = sliceFn(s, "func (e *Engine) outsideExecutionWindow(")
		}
		if n := strings.Count(fn, "e.now()"); n != 1 {
			t.Errorf("%s close-countdown uses e.now() %d times, want 1", name, n)
		}
	}
}

func sliceFn(src, start string) string {
	i := strings.Index(src, start)
	if i < 0 {
		return ""
	}
	rest := src[i:]
	next := strings.Index(rest[len(start):], "\nfunc ")
	if next < 0 {
		return rest
	}
	return rest[:len(start)+next]
}
