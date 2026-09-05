package live

import (
	"fmt"
	"testing"

	"mktorder.com/go/internal/providers"
)

func TestQuoteCacheIsBounded(t *testing.T) {
	e := &Engine{}
	for i := 0; i < 400; i++ {
		e.putProviderQuote(fmt.Sprintf("T%d", i), "finnhub", providers.QuotePayload{})
	}
	e.mu.Lock()
	n := len(e.quoteCache)
	e.mu.Unlock()
	if n > 256 {
		t.Fatalf("quoteCache grew to %d, cap 256", n)
	}
}

func TestOrderMetaIsBounded(t *testing.T) {
	e := &Engine{}
	for i := 0; i < 400; i++ {
		e.rememberOrder(fmt.Sprintf("id-%d", i), orderMeta{Symbol: "AAPL"})
	}
	e.mu.Lock()
	n := len(e.orderMeta)
	e.mu.Unlock()
	if n > 256 {
		t.Fatalf("orderMeta grew to %d, cap 256", n)
	}
}
