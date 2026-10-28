package live

import (
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/types"
)

// AUD-147/205: T-1 used to read every watch with no deadline before the cycle's
// window existed, so a hung provider ate the closing minute, and the report's
// rows came from that read instead of the one the decision was taken on.
func TestT1AggregateReadsQuotesOnlyInsideWindow(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, _ := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	e.Quotes = &slowQuotes{MemoryQuotes: MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}}, delay: 3 * time.Second}
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	// 15:59:00 against a 15:59:55 deadline: the reserve leaves the reads 300ms.
	old := T1PlacementReserve
	T1PlacementReserve = 55*time.Second - 300*time.Millisecond
	defer func() { T1PlacementReserve = old }()

	start := time.Now()
	res, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true, DryRun: true})
	if err != nil {
		t.Fatal(err)
	}
	if took := time.Since(start); took > 2*time.Second {
		t.Fatalf("T-1 took %v: quotes were waited on outside the window", took)
	}
	if !strings.Contains(res.Text, "Котировки: нет данных") {
		t.Fatalf("report must state the cycle's own reading (unavailable), got:\n%s", res.Text)
	}
}
