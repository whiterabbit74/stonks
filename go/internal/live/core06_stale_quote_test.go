package live

import (
	"path/filepath"
	"testing"
	"time"

	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

// CORE-06: свежесть ответа провайдера — не свежесть котировки. Зависший
// снимок с правильными числами не должен становиться сегодняшним сигналом.
func staleQuoteEngine(t *testing.T, asOf time.Time) (*Engine, *MemoryBroker) {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.1, Volume: 1}}
	_ = db.SaveDataset("MSFT", "MSFT", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "MSFT", "lowIBS": 0.10, "highIBS": 0.75})
	q := providers.QuotePayload{
		Range:   map[string]any{"open": 10.0, "high": 12.0, "low": 8.0},
		Quote:   map[string]any{"open": 10.0, "high": 12.0, "low": 8.0, "current": 8.1},
		DateKey: "2026-09-01",
		AsOf:    asOf,
	}
	br := &MemoryBroker{Name: "webull", Acct: map[string]any{"cash_balance": 10000.0}}
	e := New(db, &MemoryQuotes{Q: map[string]providers.QuotePayload{"MSFT": q}})
	e.AttachBroker("webull", br)
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.Now = nearCloseNow()
	e.Sleep = func(time.Duration) {}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.10, "highIBS": 0.75, "entryCapitalMode": "cash_100",
		"allowNewEntries": true, "allowExits": true,
		"brokers": map[string]any{
			"webull": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})
	return e, br
}

func TestQuoteFromAnotherSessionDoesNotTrade(t *testing.T) {
	e, br := staleQuoteEngine(t, time.Date(2020, 1, 2, 20, 0, 0, 0, time.UTC))
	e.Execute("telegram_t1")
	if len(br.Orders) != 0 {
		t.Fatalf("a 2020 quote must not open a 2026 position: %+v", br.Orders)
	}
}

func TestFrozenQuoteFromTodayDoesNotTrade(t *testing.T) {
	// Сегодняшняя сессия, но котировка застыла час назад.
	e, br := staleQuoteEngine(t, nearCloseNow()().Add(-time.Hour))
	e.Execute("telegram_t1")
	if len(br.Orders) != 0 {
		t.Fatalf("an hour-old quote must not decide the close: %+v", br.Orders)
	}
}

func TestFreshQuoteTrades(t *testing.T) {
	e, br := staleQuoteEngine(t, nearCloseNow()().Add(-2*time.Second))
	e.Execute("telegram_t1")
	if len(br.Orders) != 1 || br.Orders[0].Side != "BUY" {
		t.Fatalf("a fresh quote must trade: %+v", br.Orders)
	}
}

// Провайдер без отметки времени судить нельзя: неверный вердикт о
// несвежести остановил бы торговлю совсем.
func TestQuoteWithoutTimestampStillTrades(t *testing.T) {
	e, br := staleQuoteEngine(t, time.Time{})
	e.Execute("telegram_t1")
	if len(br.Orders) != 1 {
		t.Fatalf("an untimestamped quote must still trade: %+v", br.Orders)
	}
}

// CORE-07: символ, который уже дал первый провайдер, у следующих в цепочке не
// спрашивается — медленный резервный не должен задерживать закрывающую минуту.
type countingBatcher struct {
	MemoryQuotes
	calls map[string]int
}

func (c *countingBatcher) QuoteBatch(symbols []string, provider string) (map[string]providers.QuotePayload, error) {
	if c.calls == nil {
		c.calls = map[string]int{}
	}
	c.calls[provider] += len(symbols)
	out := map[string]providers.QuotePayload{}
	for _, s := range symbols {
		if q, ok := c.Q[s]; ok {
			out[s] = q
		}
	}
	return out, nil
}

func TestPrefetchDoesNotReaskCoveredSymbols(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	fresh := providers.QuotePayload{
		Range: map[string]any{"open": 10.0, "high": 12.0, "low": 8.0},
		Quote: map[string]any{"open": 10.0, "high": 12.0, "low": 8.0, "current": 8.1},
		AsOf:  nearCloseNow()().Add(-time.Second),
	}
	qs := &countingBatcher{MemoryQuotes: MemoryQuotes{Q: map[string]providers.QuotePayload{
		"AAPL": fresh, "MSFT": fresh, "NVDA": fresh,
	}}}
	e := New(db, qs)
	e.Now = nearCloseNow()
	e.prefetchBatch([]string{"AAPL", "MSFT", "NVDA"}, []string{"webull", "finnhub", "robinhood"})
	if qs.calls["webull"] != 3 {
		t.Fatalf("the primary provider must be asked for all three: %v", qs.calls)
	}
	if qs.calls["finnhub"] != 0 || qs.calls["robinhood"] != 0 {
		t.Fatalf("covered symbols must not be re-asked down the chain: %v", qs.calls)
	}
}
