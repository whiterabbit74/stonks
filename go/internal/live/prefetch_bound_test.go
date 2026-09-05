package live

import (
	"os"
	"strings"
	"testing"
)

func TestPrefetchQuotesCapsConcurrency(t *testing.T) {
	raw, err := os.ReadFile("telegram.go")
	if err != nil {
		t.Fatal(err)
	}
	src := string(raw)
	start := strings.Index(src, "func (e *Engine) prefetchQuotes(")
	if start < 0 {
		t.Fatal("prefetchQuotes not found")
	}
	fn := src[start:]
	if i := strings.Index(fn[10:], "\nfunc "); i > 0 {
		fn = fn[:10+i]
	}
	if !strings.Contains(fn, "make(chan struct{}") {
		t.Fatal("prefetchQuotes must bound parallel quote fetches")
	}
	if strings.Contains(fn, "_ = recover()") {
		t.Fatal("prefetchQuotes must log a recovered panic")
	}
}
