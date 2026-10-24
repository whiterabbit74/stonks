package live

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/types"
)

type failHistQuotes struct {
	hist int
}

func (f *failHistQuotes) Quote(symbol, provider string) (providers.QuotePayload, error) {
	return providers.QuotePayload{}, fmt.Errorf("down")
}

func (f *failHistQuotes) Historical(symbol, provider string, startTs, endTs int64, adjustment string) (providers.Historical, error) {
	f.hist++
	return providers.Historical{}, fmt.Errorf("down")
}

func TestActualizeFailureRecordsAttemptAndCaps(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, _ := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	q := &failHistQuotes{}
	e.Quotes = q
	st := db.Settings()
	st["enablePostClosePriceActualization"] = true
	_ = db.SaveSettings(st)

	today := "2026-09-01"
	first := e.Actualize(false)
	if first.Count != 0 || first.Reason != "none_updated" {
		t.Fatalf("first failure %+v", first)
	}
	st = db.Settings()
	if fmt.Sprint(st["lastActualizationAttemptDate"]) != today {
		t.Fatalf("failure must set lastActualizationAttemptDate, settings=%v", st)
	}
	if fmt.Sprint(st["lastActualizationDate"]) == today {
		t.Fatal("failure must not set lastActualizationDate")
	}

	for i := 0; i < actualizeMaxAttemptsPerDay-1; i++ {
		r := e.Actualize(false)
		if r.Reason == "attempt_limit" {
			t.Fatalf("attempt %d should still retry, got %+v", i+2, r)
		}
	}
	capped := e.Actualize(false)
	if capped.Reason != "attempt_limit" {
		t.Fatalf("next tick same day must be limited, got %+v", capped)
	}
	if q.hist != actualizeMaxAttemptsPerDay {
		t.Fatalf("provider calls %d, want %d", q.hist, actualizeMaxAttemptsPerDay)
	}
	tg, _ := e.Telegram.(*MemoryTelegram)
	alert := false
	for _, m := range tg.Sent() {
		if strings.Contains(m[1], "Актуализация цен не удалась") {
			alert = true
		}
	}
	if !alert {
		t.Fatalf("repeated failure must alert, messages=%v", tg.Sent())
	}
}

// A day where one ticker updated and another failed must stay open for the
// next tick: the EMA-only ticker had no bars merged, so closing the day would
// leave it stale until a manual "Обновить цены и позиции".
func TestActualizePartialFailureKeepsRetrying(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, _ := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	if _, err := db.UpsertEMAAlert(map[string]any{"symbol": "TQQQ", "emaPeriod": 20}); err != nil {
		t.Fatal(err)
	}
	st := db.Settings()
	st["enablePostClosePriceActualization"] = true
	_ = db.SaveSettings(st)

	first := e.Actualize(false)
	if first.Count != 1 || len(first.Failed) != 1 || first.Failed[0] != "TQQQ" {
		t.Fatalf("want AAPL updated and TQQQ failed, got %+v", first)
	}
	if fmt.Sprint(db.Settings()["lastActualizationDate"]) == "2026-09-01" {
		t.Fatal("partial run must not close the day")
	}
	second := e.Actualize(false)
	if second.Reason == "already_ran_today" {
		t.Fatalf("next tick must retry the failed ticker, got %+v", second)
	}
}

// AUD-174: after the close the provider still answered with history ending
// yesterday. Any non-empty answer counted as updated, the day was closed and
// today's bar never came in.
func TestActualizeWithoutTodaysBarKeepsRetrying(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-08-31", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, _ := testEngine(t, bars) // today is 2026-09-01
	e.Sleep = func(time.Duration) {}
	st := db.Settings()
	st["enablePostClosePriceActualization"] = true
	_ = db.SaveSettings(st)

	res := e.Actualize(false)
	if res.Count != 0 || len(res.Failed) != 1 {
		t.Fatalf("stale answer counted as updated: %+v", res)
	}
	if fmt.Sprint(db.Settings()["lastActualizationDate"]) == "2026-09-01" {
		t.Fatal("day closed without today's bar")
	}
	e.Quotes = &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": {
		{Date: "2026-08-31", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1},
		{Date: "2026-09-01", Open: 9, High: 11, Low: 8, Close: 10, Volume: 1},
	}}}
	if res := e.Actualize(false); res.Count != 1 || len(res.Failed) != 0 {
		t.Fatalf("retry with today's bar: %+v", res)
	}
	if fmt.Sprint(db.Settings()["lastActualizationDate"]) != "2026-09-01" {
		t.Fatal("day with today's bar not closed")
	}
}
