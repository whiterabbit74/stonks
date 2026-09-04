package live

import (
	"fmt"
	"path/filepath"
	"sync"
	"testing"

	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

// batchQuotes counts what the engine asks for: one batch call for the whole
// watch list, and a per-symbol call only for what the batch did not answer.
type batchQuotes struct {
	mu sync.Mutex
	MemoryQuotes
	batches [][]string
	singles []string
	answer  map[string]providers.QuotePayload
	batchOK bool
	// batchOnly, when set, is the only provider with a batch endpoint — the
	// others opt out the way providers.Client does.
	batchOnly string
}

func (b *batchQuotes) QuoteBatch(symbols []string, provider string) (map[string]providers.QuotePayload, error) {
	if b.batchOnly != "" && provider != b.batchOnly {
		return nil, nil
	}
	b.mu.Lock()
	b.batches = append(b.batches, append([]string{}, symbols...))
	b.mu.Unlock()
	if !b.batchOK {
		return nil, fmt.Errorf("webull: 502")
	}
	out := map[string]providers.QuotePayload{}
	for _, s := range symbols {
		if q, ok := b.answer[s]; ok {
			out[s] = q
		}
	}
	return out, nil
}

func (b *batchQuotes) Quote(symbol, provider string) (providers.QuotePayload, error) {
	b.mu.Lock()
	b.singles = append(b.singles, symbol)
	b.mu.Unlock()
	return b.MemoryQuotes.Quote(symbol, provider)
}

func batchEngine(t *testing.T, qs QuoteSource) *Engine {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := New(db, qs)
	e.Now = nearCloseNow()
	return e
}

func batchPayloads(symbols ...string) (map[string]providers.QuotePayload, map[string][]types.OHLC) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	q, _ := providers.BuildQuoteFromRows(bars)
	payloads := map[string]providers.QuotePayload{}
	byBar := map[string][]types.OHLC{}
	for _, s := range symbols {
		payloads[s] = q
		byBar[s] = bars
	}
	return payloads, byBar
}

func TestPrefetchUsesOneBatchCall(t *testing.T) {
	payloads, bars := batchPayloads("MSFT", "AAPL", "V")
	qs := &batchQuotes{MemoryQuotes: MemoryQuotes{Bars: bars}, answer: payloads, batchOK: true}
	e := batchEngine(t, qs)

	e.prefetchQuotes([]string{"MSFT", "AAPL", "V"}, []string{"webull"})

	if len(qs.batches) != 1 || len(qs.batches[0]) != 3 {
		t.Fatalf("want one batch for the whole list: %+v", qs.batches)
	}
	if len(qs.singles) != 0 {
		t.Fatalf("a served batch leaves nothing to ask per symbol: %v", qs.singles)
	}
	// The cached batch payloads are what the decision then reads.
	if q, _, err := e.liveQuote("MSFT", []string{"webull"}); err != nil || q.Quote["current"] == nil {
		t.Fatalf("batch payload must land in the quote cache: %+v %v", q, err)
	}
	if len(qs.singles) != 0 {
		t.Fatalf("liveQuote refetched a batched symbol: %v", qs.singles)
	}
}

func TestPrefetchFallsBackWhenBatchFails(t *testing.T) {
	_, bars := batchPayloads("MSFT", "AAPL")
	qs := &batchQuotes{MemoryQuotes: MemoryQuotes{Bars: bars}}
	e := batchEngine(t, qs)

	e.prefetchQuotes([]string{"MSFT", "AAPL"}, []string{"webull"})

	if len(qs.batches) != 1 {
		t.Fatalf("want the batch attempted once: %+v", qs.batches)
	}
	if len(qs.singles) != 2 {
		t.Fatalf("a failed batch must not cost the quotes: %v", qs.singles)
	}
}

// Prod's chain is finnhub first, and finnhub has been answering with errors:
// every ticker then fell through to a Webull call of its own. The fallback
// provider gets batched too, without changing which provider is preferred.
func TestPrefetchBatchesTheFallbackProvider(t *testing.T) {
	payloads, bars := batchPayloads("MSFT", "AAPL", "V")
	qs := &batchQuotes{MemoryQuotes: MemoryQuotes{QuoteErr: map[string]error{
		"MSFT": fmt.Errorf("finnhub: 429"), "AAPL": fmt.Errorf("finnhub: 429"), "V": fmt.Errorf("finnhub: 429"),
	}, Bars: bars}, answer: payloads, batchOK: true}
	qs.batchOnly = "webull"
	e := batchEngine(t, qs)
	chain := []string{"finnhub", "webull"}

	e.prefetchQuotes([]string{"MSFT", "AAPL", "V"}, chain)

	if len(qs.batches) != 1 {
		t.Fatalf("want exactly one batch, for webull: %+v", qs.batches)
	}
	for _, sym := range []string{"MSFT", "AAPL", "V"} {
		q, used, err := e.liveQuote(sym, chain)
		if err != nil || used != "webull" {
			t.Fatalf("%s must come from the batched fallback: %v %v", sym, used, err)
		}
		if q.Quote["current"] == nil {
			t.Fatalf("%s payload empty", sym)
		}
	}
	// finnhub is still asked first, per symbol, exactly as before.
	for _, s := range qs.singles {
		if s == "" {
			t.Fatal("empty symbol asked")
		}
	}
	if len(qs.singles) == 0 {
		t.Fatal("the preferred provider must still be tried")
	}
}

func TestPrefetchAsksPerSymbolForWhatTheBatchMissed(t *testing.T) {
	payloads, bars := batchPayloads("MSFT", "AAPL")
	delete(payloads, "AAPL")
	qs := &batchQuotes{MemoryQuotes: MemoryQuotes{Bars: bars}, answer: payloads, batchOK: true}
	e := batchEngine(t, qs)

	e.prefetchQuotes([]string{"MSFT", "AAPL"}, []string{"webull"})

	if len(qs.singles) != 1 || qs.singles[0] != "AAPL" {
		t.Fatalf("only the unanswered symbol needs a call of its own: %v", qs.singles)
	}
}
