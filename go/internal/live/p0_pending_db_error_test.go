package live

import (
	"fmt"
	"testing"

	"mktorder.com/go/internal/types"
)

func brokerSubmitError(v any) string {
	switch b := v.(type) {
	case OrderResult:
		return b.Error
	case map[string]any:
		if e, ok := b["error"]; ok && e != nil && fmt.Sprint(e) != "" && fmt.Sprint(e) != "<nil>" {
			return fmt.Sprint(e)
		}
		for _, name := range []string{"webull", "robinhood"} {
			if inner, ok := b[name]; ok {
				if s := brokerSubmitError(inner); s != "" && s != "<nil>" {
					return s
				}
			}
		}
		return ""
	default:
		return fmt.Sprint(v)
	}
}

func firstNamedOrderResult(v any) OrderResult {
	if or, ok := v.(OrderResult); ok {
		return or
	}
	m, _ := v.(map[string]any)
	if m == nil {
		return OrderResult{}
	}
	for _, name := range []string{"webull", "robinhood"} {
		if or, ok := m[name].(OrderResult); ok {
			return or
		}
	}
	return OrderResult{}
}

// AU-P0-3: a failed order_trackers read must not be treated as "no pending".
// Dropping the table after a real entry is already in flight is the
// fail-open that used to mint a second market order.
func TestPendingTrackerDBErrorBlocksDuplicateEntry(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})

	res1 := e.Execute("t1")
	if !res1.Executed || len(br.Orders) != 1 {
		t.Fatalf("first entry must place: executed=%v orders=%d broker=%+v", res1.Executed, len(br.Orders), res1.Broker)
	}

	if _, err := db.SQL.Exec(`DROP TABLE order_trackers`); err != nil {
		t.Fatal(err)
	}

	// The cycle's preflight would already hold the entry next to the working
	// order; the submission's own pending check is driven directly here.
	res2 := e.submitOne(backgroundWindow(), e.Evaluate(), "t1", "c", "webull", br, "entry", "AAPL")
	if res2.Submitted || len(br.Orders) != 1 {
		t.Fatalf("DB error at entry pending check must not mint a duplicate: %+v orders=%d", res2, len(br.Orders))
	}
	if res2.Error != "journal_unavailable" {
		t.Fatalf("broker error %q want journal_unavailable", res2.Error)
	}
	if !hasAutotradeLog(t, e, "reason=journal_unavailable") {
		t.Fatal("want journal_unavailable skip, same family as Evaluate")
	}
}

func TestPendingTrackerDBErrorBlocksFirstEntry(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})

	if _, err := db.SQL.Exec(`DROP TABLE order_trackers`); err != nil {
		t.Fatal(err)
	}

	res := e.Execute("t1")
	if res.Executed || len(br.Orders) != 0 {
		t.Fatalf("unread order_trackers must block entry, not fail open: executed=%v orders=%d broker=%+v", res.Executed, len(br.Orders), res.Broker)
	}
	if got := brokerSubmitError(res.Broker); got != "journal_unavailable" {
		t.Fatalf("broker error %q want journal_unavailable; decision=%+v broker=%+v", got, res.Decision, res.Broker)
	}
}
