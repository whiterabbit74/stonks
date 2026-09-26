package live

import (
	"errors"
	"testing"
	"time"

	"mktorder.com/go/internal/types"
)

// AUD-126: a submission whose status came back unknown kept its decision
// IBS out of the order meta, and recordFill then journaled a later exit
// fill with exit_ibs = 0 — the opposite of the reading that triggered it.
func TestAUD126AmbiguousOrderKeepsDecisionIBS(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true,
	})
	br.SetFailPlace("i/o timeout", 1, false)
	br.FailDetail = errors.New("dial tcp timeout")
	res := e.Execute("test")
	id := firstNamedOrderResult(res.Broker).ClientOrderID
	if id == "" {
		t.Fatalf("want an ambiguous result carrying the id, got %+v", res.Broker)
	}
	e.mu.Lock()
	got := e.orderMeta[id].IBS
	e.mu.Unlock()
	if want := 0.05; got < want-1e-9 || got > want+1e-9 {
		t.Fatalf("ambiguous order meta IBS = %v, want the decision reading %v", got, want)
	}
}

// AUD-126: an entry taken at IBS exactly 0 (the close at the day's low) is
// the strongest signal there is, and it was journaled as entry_ibs NULL.
func TestAUD126EntryAtZeroIBSIsJournaled(t *testing.T) {
	db, e, _ := testEngine(t, nil)
	id := "zero-ibs"
	seedOrderMeta(e, id, orderMeta{
		CorrelationID: "c1", IBS: 0, Action: "entry", Symbol: "AAPL",
		Quantity: 1, Broker: "webull", DateKey: "2026-09-01",
	})
	e.recordFill(map[string]any{
		"clientOrderId": id, "symbol": "AAPL", "action": "entry",
		"quantity": 1.0, "dateKey": "2026-09-01", "broker": "webull",
	}, map[string]any{"status": "filled", "filled_qty": 1.0, "avg_price": 8}, "filled")
	p, err := db.OpenPositionBySymbol("AAPL")
	if err != nil || p == nil {
		t.Fatalf("open position: %+v %v", p, err)
	}
	if p.EntryIBS == nil || *p.EntryIBS != 0 {
		t.Fatalf("entry_ibs = %v, want 0", p.EntryIBS)
	}
}
