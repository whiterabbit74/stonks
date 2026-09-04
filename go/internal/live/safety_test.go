package live

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

func TestIncompleteQuoteIsNotAnEntrySignal(t *testing.T) {
	q := providers.QuotePayload{
		Quote: map[string]any{"current": 10.0, "prevClose": 12.0},
	}
	if v, ok := ibsFromQuote(q); ok {
		t.Fatalf("fabricated range must not be ok, ibs=%v", v)
	}
	if v, ok := ibsFromQuote(providers.QuotePayload{
		Range: map[string]any{"low": 90.0, "high": 90.0},
		Quote: map[string]any{"current": 90.0, "low": 90.0, "high": 90.0},
	}); ok {
		t.Fatalf("high<=low must not be ok, ibs=%v", v)
	}
	if v, ok := ibsFromQuote(providers.QuotePayload{
		Range: map[string]any{"low": 90.0, "high": 100.0},
		Quote: map[string]any{"current": 0.0, "low": 90.0, "high": 100.0},
	}); ok {
		t.Fatalf("current<=0 must not be ok, ibs=%v", v)
	}
}

func TestLiveQuoteSkipsProviderWithNoRange(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, _ := testEngine(t, bars)
	e.Quotes = &MemoryQuotes{Q: map[string]providers.QuotePayload{
		"AAPL": {Quote: map[string]any{"current": 8.2, "prevClose": 10.0}},
	}}
	ev := e.evalWatch("AAPL", map[string]any{"symbol": "AAPL", "lowIBS": 0.9}, []string{"finnhub"})
	if ev.ok {
		t.Fatalf("incomplete quote must not be ok: %+v", ev)
	}
}

func TestBrokerPositionBlocksEntry(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	br.Pos = []any{map[string]any{"symbol": "MSFT", "quantity": 2.0}}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "allowExits": true,
	})
	ev := e.Evaluate()
	if fmt.Sprint(ev.Decision["action"]) == "entry" {
		t.Fatalf("must not enter over a live broker position: %+v", ev.Decision)
	}
}

func TestBrokerPositionLookupErrorBlocksEntry(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	br.FailPositions = errors.New("timeout")
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true,
	})
	ev := e.Evaluate()
	if fmt.Sprint(ev.Decision["action"]) != "none" || fmt.Sprint(ev.Decision["reason"]) != "broker_positions_unavailable" {
		t.Fatalf("lookup failure must fail closed: %+v", ev.Decision)
	}
}

func TestPendingEntryBlocksOtherSymbol(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, _ := testEngine(t, bars)
	_ = db.SaveDataset("MSFT", "MSFT", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "MSFT", "lowIBS": 0.9, "highIBS": 0.75})
	_ = db.SaveOrderTracker(map[string]any{
		"clientOrderId": "pend-aapl", "symbol": "AAPL", "action": "entry",
		"status": "submitted", "quantity": 1, "dateKey": "2026-09-01",
	})
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true,
		"symbols": "MSFT",
	})
	res := e.Execute("test")
	if res.Executed {
		t.Fatal("must not enter MSFT while an AAPL entry tracker is pending")
	}
}

func TestLookupErrorDoesNotResend(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true,
	})
	br.SetFailPlace("i/o timeout", 1, false)
	br.FailDetail = errors.New("dial tcp timeout")
	res := e.Execute("test")
	if len(br.Orders) != 0 {
		t.Fatalf("must not send a second order: %+v", br.Orders)
	}
	if res.Executed {
		t.Fatalf("an unknown submission must not be reported as executed: %+v", res.Broker)
	}
	br2, _ := res.Broker.(OrderResult)
	if !br2.Ambiguous || br2.ClientOrderID == "" {
		t.Fatalf("want an ambiguous result carrying the id, got %+v", res.Broker)
	}
	// The order may still exist at the broker, so it has to be tracked.
	if pending := e.DB.FindPendingTracker("AAPL", "entry"); pending == nil {
		t.Fatal("an unknown submission must still be tracked")
	}
	var warned bool
	for _, m := range e.Telegram.(*MemoryTelegram).Sent() {
		if strings.Contains(m[1], "статус отправки неизвестен") {
			warned = true
		}
	}
	if !warned {
		t.Fatal("operator must be told the submission status is unknown")
	}
}

func TestClosePositionStartsTracker(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	br.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 2.0}}
	res, err := e.ClosePosition("AAPL")
	if err != nil || !res.Submitted {
		t.Fatalf("close %+v %v", res, err)
	}
	if db.FindPendingTracker("AAPL", "exit") == nil && db.AnyPendingTracker() == nil {
		t.Fatal("manual close must start a tracker")
	}
}

func TestResumePollsBeforeExpiringYesterday(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{{Date: "2026-09-02", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	_ = db.SaveOrderTracker(map[string]any{
		"clientOrderId": "old-fill", "symbol": "AAPL", "action": "entry",
		"status": "submitted", "quantity": 1, "dateKey": "2026-09-01",
	})
	br := &MemoryBroker{FillStatus: "FILLED", FillQty: 1, FillPrice: 8.2}
	br.Orders = []OrderResult{{ClientOrderID: "old-fill", Symbol: "AAPL", Side: "BUY", Quantity: 1, Submitted: true}}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}})
	e.Broker = br
	e.Telegram = &MemoryTelegram{}
	e.Now = func() time.Time { return time.Date(2026, 9, 2, 16, 0, 0, 0, time.UTC) }
	e.ResumeTrackers()
	if db.FindPendingTracker("AAPL", "entry") != nil {
		t.Fatal("filled yesterday must not stay pending")
	}
	trades, _ := db.ListTrades("broker_trades")
	if len(trades) != 1 || fmt.Sprint(trades[0]["status"]) != "open" {
		t.Fatalf("fill must be journalled, got %+v", trades)
	}
}

func TestPartialExitKeepsRemainderOpen(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 11.9, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	_ = db.InsertTrade("broker_trades", map[string]any{
		"id": "b1", "symbol": "AAPL", "status": "open",
		"entryDate": "2026-09-01", "entryPrice": 10.0, "quantity": 5,
	})
	br.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 5.0}}
	e.PatchAutoConfig(map[string]any{"enabled": true, "highIBS": 0.5, "allowExits": true})
	res := e.Execute("test")
	if !res.Executed {
		t.Fatalf("exit submit %+v", res)
	}
	oid := br.Orders[0].ClientOrderID
	br.SetDetail(oid, map[string]any{
		"status": "FILLED", "filled_qty": 2.0, "filled_price": 11.5, "client_order_id": oid,
	})
	waitTrackerFinal(t, e, db, "AAPL", "exit")
	trades, _ := db.ListTrades("broker_trades")
	if len(trades) != 1 || fmt.Sprint(trades[0]["status"]) != "open" {
		t.Fatalf("remainder must stay open: %+v", trades)
	}
	if asFloat(trades[0]["quantity"]) != 3 {
		t.Fatalf("remaining qty %+v", trades[0]["quantity"])
	}
}

func TestLowHighThresholdsRejected(t *testing.T) {
	out := sanitizeAutoTradingConfig(map[string]any{"lowIBS": 0.9, "highIBS": 0.1}, map[string]any{"lowIBS": 0.1, "highIBS": 0.75}, time.Now())
	if asFloat(out["lowIBS"]) != 0.1 || asFloat(out["highIBS"]) != 0.75 {
		t.Fatalf("inverted thresholds must not stick: %+v", out)
	}
}

func TestProviderAbbrevWebull(t *testing.T) {
	if providerAbbrev("webull") != "WB" {
		t.Fatalf("webull abbrev %q", providerAbbrev("webull"))
	}
	if providerAbbrev("finnhub+webull") != "FH+WB" {
		t.Fatalf("chain abbrev %q", providerAbbrev("finnhub+webull"))
	}
}

func TestBrokerOnlyPositionIsNeverSold(t *testing.T) {
	// IBS 1.0 is far above highIBS, so an exit would fire if the engine
	// considered this position its own.
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 12, Volume: 1}}
	_, e, br := testEngine(t, bars)
	br.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 500.0}}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "highIBS": 0.75, "allowExits": true, "allowNewEntries": true,
		"symbols": "AAPL",
	})
	ev := e.Evaluate()
	if got := fmt.Sprint(ev.Decision["action"]); got != "none" {
		t.Fatalf("must not act on a position it never opened, got %q", got)
	}
	if got := fmt.Sprint(ev.Decision["reason"]); got != "broker_position_not_in_journal" {
		t.Fatalf("reason = %q", got)
	}
	res := e.Execute("manual_execute")
	if res.Executed || len(br.Orders) != 0 {
		t.Fatalf("manual execute must not liquidate it: %+v", br.Orders)
	}
}

func TestFailedT1SubmitDoesNotResendTheMessage(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.9, "highIBS": 0.75})
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true,
	})
	br.SetFailPlace("rejected by broker", 0, false)
	opts := AggregateOpts{ForceSend: true, UpdateState: true}
	if _, err := e.Aggregate(1, opts); err != nil {
		t.Fatal(err)
	}
	res, err := e.Aggregate(1, opts)
	if err != nil {
		t.Fatal(err)
	}
	if res.Reason != "already_sent" {
		t.Fatalf("a failed submission must not re-open the day: reason=%q sent=%v", res.Reason, res.Sent)
	}
}

func TestTokenStatusReportsTheSourceRequestsUse(t *testing.T) {
	db, eng, _ := testEngine(t, nil)
	t.Setenv("WEBULL_ACCESS_TOKEN", "env-token")

	if err := db.SaveWebullToken("pending-token", "", "PENDING"); err != nil {
		t.Fatal(err)
	}
	// The stored token is not usable until a check confirms it, so requests go
	// out with the environment one — the page must say so.
	if src := eng.TokenStatus()["source"]; src != "env" {
		t.Fatalf("source = %v, want env", src)
	}

	if err := db.SaveWebullToken("live-token", "", "NORMAL"); err != nil {
		t.Fatal(err)
	}
	if src := eng.TokenStatus()["source"]; src != "db" {
		t.Fatalf("source = %v, want db", src)
	}
}

func TestForeignOpenOrderIsNotCancelled(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	// An order on the traded symbol that this engine never placed: the user's
	// own, sitting in the same account. Cancelling it would be interference.
	br.Open = []any{map[string]any{"symbol": "AAPL", "client_order_id": "human-1", "status": "WORKING"}}
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})

	if res := e.Execute("test"); !res.Executed {
		t.Fatalf("execute %+v", res)
	}
	if len(br.Cancelled) != 0 {
		t.Fatalf("a foreign order was cancelled: %+v", br.Cancelled)
	}
	logs, _ := db.ListAutotradeLogs(50)
	found := false
	for _, row := range logs {
		if strings.Contains(fmt.Sprint(row["message"]), "event=foreign_order_left_open") {
			found = true
		}
	}
	if !found {
		t.Fatalf("leaving a foreign order alone must be logged: %+v", logs)
	}
}
