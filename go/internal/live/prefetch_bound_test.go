package live

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/types"
)

type concQuotes struct {
	MemoryQuotes
	mu       sync.Mutex
	cur, max int
}

func (c *concQuotes) Quote(symbol, provider string) (providers.QuotePayload, error) {
	c.mu.Lock()
	c.cur++
	if c.cur > c.max {
		c.max = c.cur
	}
	c.mu.Unlock()
	time.Sleep(25 * time.Millisecond)
	c.mu.Lock()
	c.cur--
	c.mu.Unlock()
	return c.MemoryQuotes.Quote(symbol, provider)
}

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

func TestPrefetchQuotesCapsConcurrentHTTP(t *testing.T) {
	q := &concQuotes{MemoryQuotes: MemoryQuotes{Bars: map[string][]types.OHLC{}}}
	syms := make([]string, 16)
	bar := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	for i := range syms {
		s := fmt.Sprintf("T%02d", i)
		syms[i] = s
		q.Bars[s] = bar
	}
	e := &Engine{Quotes: q}
	e.prefetchQuotes(syms, []string{"finnhub"})
	if q.max > 8 {
		t.Fatalf("prefetch concurrency %d, cap 8", q.max)
	}
	if q.max < 2 {
		t.Fatalf("prefetch must run in parallel, max=%d", q.max)
	}
}
