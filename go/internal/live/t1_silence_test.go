package live

import (
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

// 2026-09-04 incident: T-11 announced ENTRY MSFT, T-1 answered "Действий нет".
// The engine had in fact decided broker_positions_unavailable — a single Webull
// positions read that failed inside Evaluate seconds after the same call had
// succeeded twice in t1BrokerReconcile. Two defects: the read was the only
// broker read on the T-1 path without a retry, and the decision reason never
// reached the message.

func TestHeldSymbolsRetriesTransientPositionsFailure(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_ = db.SaveDataset("MSFT", "MSFT", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "MSFT", "lowIBS": 0.9})
	br := &MemoryBroker{FailPositions: fmt.Errorf("webull: 502"), FailPositionsN: 2}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"MSFT": bars}})
	e.Broker = br
	e.Now = nearCloseNow()
	e.Sleep = func(time.Duration) {}
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})

	if res := e.Execute("telegram_t1"); !res.Executed || len(br.Orders) != 1 {
		t.Fatalf("a transient positions read must not cost the entry: %+v %+v", res.Runs, br.Orders)
	}
}

// T-11 lists what the brokers hold as plain information — not a warning and
// not "the journal does not know it": a leftover is not the monitoring's.
func TestT11ListsBrokerHoldingsAsInformation(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := New(db, &MemoryQuotes{})
	e.Broker = &MemoryBroker{Pos: []any{map[string]any{"symbol": "AAL", "quantity": 1.0}}}
	line := e.brokerHoldingsLine()
	if !strings.Contains(line, "Webull — AAL 1") || strings.Contains(line, "⚠️") || strings.Contains(line, "журнал") {
		t.Fatalf("want a neutral holdings line: %s", line)
	}
}

// Every broker can be skipped (no token, disabled, unreadable journal) while
// the monitoring entered. The report names each broker's reason; a real
// submission still reads as sent.
func TestT1TextSaysWhenNothingWasSubmitted(t *testing.T) {
	res := EvalResult{
		AutoTrading: map[string]any{"enabled": true},
		Monitor:     &MonitorStep{Entry: &LiveQuote{Symbol: "AAPL", IBS: 0.05, CurrentPrice: 8.2}},
		Runs:        map[string]*BrokerRun{"webull": {Reason: HealthMissing}},
	}
	if text := t1AutoText(res, false); !strings.Contains(text, "Webull: у брокера нет токена") {
		t.Fatalf("want the per-broker reason:\n%s", text)
	}
	res.Runs["webull"] = &BrokerRun{Buy: &OrderResult{Submitted: true, Quantity: 3, Symbol: "AAPL", Side: "BUY"}}
	if text := t1AutoText(res, false); !strings.Contains(text, "BUY AAPL MARKET отправлен (3 шт.)") {
		t.Fatalf("a real submission must report as sent:\n%s", text)
	}
}

// T-11 used to tag ENTRY on an IBS merely within 0.02 of the threshold. T-1
// then, correctly, did not trade it — which reads as a bot that changed its
// mind. The overview now shows the pick the engine would actually make.
func TestT11AnnouncesOnlyTheStrictSignal(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := New(db, &MemoryQuotes{})
	rows := []t1Watch{
		{sym: "NEAR", eval: watchEval{ok: true, ibs: 0.11, low: 0.10, price: 10}},
		{sym: "PICK", eval: watchEval{ok: true, entry: true, ibs: 0.04, low: 0.10, price: 10}},
		{sym: "ALSO", eval: watchEval{ok: true, entry: true, ibs: 0.09, low: 0.10, price: 10}},
	}
	text := e.buildT11Text(11, "2026-09-01", "finnhub", rows, nil, nil)
	if !strings.Contains(text, "🔔 ENTRY: <b>PICK</b>") {
		t.Fatalf("the lowest IBS below the threshold is the pick:\n%s", text)
	}
	if strings.Contains(text, "NEAR</b> · IBS") {
		t.Fatalf("a near miss is not an entry signal:\n%s", text)
	}
}
