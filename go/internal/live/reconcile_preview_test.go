package live

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/types"
)

func TestReconcilePreviewDoesNotDoubleFetchBooks(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	before := br.PosCalls
	_ = e.Consistency()
	one := br.PosCalls - before
	if one < 1 {
		t.Fatal("Consistency must read broker positions")
	}
	mid := br.PosCalls
	_ = e.Reconcile(false)
	got := br.PosCalls - mid
	if got != one {
		t.Fatalf("preview Reconcile fetched books %d times, want %d (one Consistency)", got, one)
	}
}

func TestConsistencyUsesEngineClock(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, _ := testEngine(t, bars)
	frozen := time.Date(2020, 1, 2, 3, 4, 5, 0, time.UTC)
	e.Now = func() time.Time { return frozen }
	snap := e.Consistency()
	got := fmt.Sprint(snap["fetchedAt"])
	if !strings.HasPrefix(got, "2020-01-02T03:04:05") {
		t.Fatalf("fetchedAt %q must come from e.now()", got)
	}
}
