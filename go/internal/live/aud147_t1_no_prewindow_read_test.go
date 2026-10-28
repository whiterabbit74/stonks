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
	old, oldAttempt := T1PlacementReserve, T1ReadAttemptTimeout
	T1PlacementReserve = 55*time.Second - 300*time.Millisecond
	T1ReadAttemptTimeout = 100 * time.Millisecond
	defer func() { T1PlacementReserve, T1ReadAttemptTimeout = old, oldAttempt }()

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

// Review of AUD-147: with the read moved inside the window, a tick that starts
// after deadline − T1PlacementReserve had no read budget at all, and the
// monitoring decided with every quote "unavailable" from a provider answering
// in milliseconds.
func TestLateT1TickStillReadsQuotes(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, _ := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	e.Quotes = &slowQuotes{MemoryQuotes: MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}}, delay: 30 * time.Millisecond}
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	ny, _ := time.LoadLocation("America/New_York")
	e.Now = func() time.Time { return time.Date(2026, 9, 1, 15, 59, 48, 0, ny) }

	res, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true, DryRun: true})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(res.Text, "Котировки: получены") {
		t.Fatalf("a late T-1 must still read its quotes, got:\n%s", res.Text)
	}
}

// Review of AUD-147: EMA alerts are read after the cycle; a failed read must
// neither block T-1 nor vanish from the report.
func TestT1ReportsUnreadableEMAAlerts(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, _ := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	if _, err := db.SQL.Exec(`DROP TABLE telegram_ema_alerts`); err != nil {
		t.Fatal(err)
	}
	res, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true, DryRun: true})
	if err != nil {
		t.Fatal(err)
	}
	if !res.Sent || !strings.Contains(res.Text, "EMA-алерты не читаются") {
		t.Fatalf("sent=%v, report:\n%s", res.Sent, res.Text)
	}
}
