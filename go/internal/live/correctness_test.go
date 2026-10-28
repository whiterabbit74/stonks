package live

import (
	"fmt"
	"math"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/ibs"
	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

func waitTrackerFinal(t *testing.T, e *Engine, db *store.DB, symbol, action string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		e.PollTrackers()
		row, err := db.FindPendingTracker(symbol, action)
		if err != nil {
			t.Fatal(err)
		}
		if row == nil {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("tracker still pending")
}

func testEngine(t *testing.T, bars []types.OHLC) (*store.DB, *Engine, *MemoryBroker) {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.9, "highIBS": 0.75})
	br := &MemoryBroker{}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}})
	e.Broker = br
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	ny, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Fatal(err)
	}
	e.Now = func() time.Time { return time.Date(2026, 9, 1, 15, 59, 0, 0, ny) }
	return db, e, br
}

func TestTelegramT1IgnoresExecutionWindow(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true,
		"executionWindowSeconds": 15,
	})
	// 15:59 ET is 60s to close, outside a 15s window. T-1 still sends the order.
	res := e.Execute("telegram_t1")
	if !res.Executed || len(br.Orders) != 1 {
		t.Fatalf("telegram_t1 must not use executionWindowSeconds: executed=%v orders=%d %+v", res.Executed, len(br.Orders), res.Broker)
	}
}

func TestRejectedOrderDoesNotOpenTrade(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	res := e.Execute("test")
	if !res.Executed {
		t.Fatalf("submit %+v", res)
	}
	oid := br.Orders[0].ClientOrderID
	br.SetDetail(oid, map[string]any{"status": "REJECTED"})
	waitTrackerFinal(t, e, db, "AAPL", "entry")
	// The monitoring's position stands; the rejected order adds no leg.
	trades, _ := db.ListPositions()
	if len(trades) != 1 || trades[0].Webull.Executed() {
		t.Fatalf("rejected must not create a leg %+v", trades)
	}
	row, err := db.FindPendingTracker("AAPL", "entry")
	if err != nil {
		t.Fatal(err)
	}
	if row != nil {
		t.Fatal("rejected tracker must be final")
	}
	// The failed buy is not caught up: the monitoring holds, autotrade waits
	// for its next entry (CORE §3.2).
	if ev := e.Evaluate(); fmt.Sprint(ev.Decision["action"]) == "entry" {
		t.Fatalf("a held position is no new entry: %+v", ev.Decision)
	}
}

func TestFillRecordsBrokerPriceAndQty(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	res := e.Execute("test")
	oid := br.Orders[0].ClientOrderID
	br.SetDetail(oid, map[string]any{
		"status": "FILLED", "avg_price": 8.41, "filled_qty": 1.5,
	})
	waitTrackerFinal(t, e, db, "AAPL", "entry")
	// One row: the monitoring's signal price, and the fill on the leg that
	// executed it.
	bt, _ := db.ListPositions()
	if len(bt) != 1 || pv(bt[0].EntryPrice) != 8.2 || bt[0].Quantity != 1.5 {
		t.Fatalf("fill %+v", bt)
	}
	if pv(bt[0].Webull.EntryPrice) != 8.41 || bt[0].Webull.Qty != 1.5 {
		t.Fatalf("webull leg %+v", bt[0].Webull)
	}
	_ = res
}

func TestExitFillWritesPnLBySymbol(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 11.9, Volume: 1}}
	db, e, br := testEngine(t, bars)
	_ = db.SavePosition(store.Position{ID: "b-aapl", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-20", EntryPrice: store.Ptr[float64](10.0), Quantity: 2, Webull: store.BrokerLeg{Qty: 2, EntryPrice: store.Ptr[float64](10.0)}})
	_ = db.SavePosition(store.Position{ID: "b-msft", Symbol: "MSFT", Status: "open", EntryDate: "2026-08-01", EntryPrice: store.Ptr[float64](50.0), Quantity: 1, Webull: store.BrokerLeg{Qty: 1, EntryPrice: store.Ptr[float64](50.0)}})
	br.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 2.0}}
	e.PatchAutoConfig(map[string]any{"enabled": true, "highIBS": 0.75, "allowExits": true, "allowNewEntries": false})
	res := e.Execute("test")
	if fmt.Sprint(res.Decision["action"]) != "exit" {
		t.Fatalf("want exit %+v", res.Decision)
	}
	oid := br.Orders[0].ClientOrderID
	br.SetDetail(oid, map[string]any{"status": "FILLED", "deal_price": 12.0, "filled_quantity": 2})
	waitTrackerFinal(t, e, db, "AAPL", "exit")
	byID := map[string]store.Position{}
	rows, _ := db.ListPositions()
	for _, p := range rows {
		byID[p.ID] = p
	}
	aapl, aok := byID["b-aapl"]
	msft, mok := byID["b-msft"]
	if !aok || aapl.Status != "closed" {
		t.Fatalf("aapl %+v", aapl)
	}
	if !mok || msft.Status != "open" {
		t.Fatalf("must not close other symbol %+v", msft)
	}
	// The row closes at the signal's T-1 price; the fill goes to the leg.
	if pv(aapl.ExitPrice) != 11.9 || pv(aapl.Webull.ExitPrice) != 12 {
		t.Fatalf("exitPrice %+v / leg %+v", aapl, aapl.Webull)
	}
	if got := pv(aapl.PnLPercent); got < 18.99 || got > 19.01 {
		t.Fatalf("pnlPercent %+v", aapl)
	}
	// 2 shares x $1.90 = $3.80 (AUD-041): P&L is money, on the one row there is.
	if got := pv(aapl.PnLAbsolute); got < 3.79 || got > 3.81 {
		t.Fatalf("pnlAbsolute %+v", aapl)
	}
}

func TestCapitalModeInfosIsWhatSanitizeUses(t *testing.T) {
	infos := CapitalModeInfos()
	if len(infos) == 0 {
		t.Fatal("empty capital mode list")
	}
	if infos[0].Value != "standard_safe" {
		t.Fatalf("standard_safe must lead the list (unknown modes fall back to it), got %s", infos[0].Value)
	}
	seen := map[string]struct{}{}
	for _, m := range infos {
		if m.Value == "" {
			t.Fatal("empty capital mode value")
		}
		if _, dup := seen[m.Value]; dup {
			t.Fatalf("duplicate capital mode %s", m.Value)
		}
		seen[m.Value] = struct{}{}
		if !validEntryCapitalMode(m.Value) {
			t.Fatalf("sanitize helper rejected exported mode %s", m.Value)
		}
		out := mustSanitize(t, map[string]any{"entryCapitalMode": m.Value}, map[string]any{})
		if fmt.Sprint(out["entryCapitalMode"]) != m.Value {
			t.Fatalf("sanitize dropped %s: %+v", m.Value, out)
		}
	}
	out := mustSanitize(t,
		map[string]any{"entryCapitalMode": "not_a_mode"},
		map[string]any{"entryCapitalMode": "cash_100"},
	)
	if fmt.Sprint(out["entryCapitalMode"]) != "cash_100" {
		t.Fatalf("unknown mode must not replace current: %+v", out)
	}
	if validEntryCapitalMode("not_a_mode") {
		t.Fatal("validEntryCapitalMode accepted a value not on CapitalModeInfos")
	}
}

func TestSanitizeAutoTradingConfig(t *testing.T) {
	_, err := sanitizeAutoTradingConfig(map[string]any{
		"enabled": true, "lowIBS": 5.0, "highIBS": -1.0, "dryRun": true,
		"executionWindowSeconds": 3, "maxSlippageBps": 5000,
		"provider": "nope", "unknown": "x",
	}, map[string]any{"provider": "finnhub", "lowIBS": 0.1}, time.Now())
	if err == nil {
		t.Fatal("out-of-range autotrading input must error, not clamp")
	}
	out := mustSanitize(t, map[string]any{
		"enabled": true, "dryRun": true, "unknown": "x",
	}, map[string]any{"provider": "finnhub", "lowIBS": 0.1, "highIBS": 0.75})
	if _, ok := out["dryRun"]; ok {
		t.Fatal("dryRun must be deleted")
	}
	if _, ok := out["unknown"]; ok {
		t.Fatal("unknown key leaked")
	}
	if fmt.Sprint(out["provider"]) != "finnhub" {
		t.Fatalf("bad provider kept %+v", out["provider"])
	}
	// Keys that described a different strategy are dropped, not stored: the
	// engine always sends MARKET/DAY/CORE sized from the whole account.
	for _, gone := range autoTradingRemovedFields {
		if _, ok := out[gone]; ok {
			t.Fatalf("%s must not survive a save: %+v", gone, out)
		}
	}
}

// The allow flags gate autotrade's orders, never the monitoring's decision.
func TestOmittedAllowFlagsAreFailClosed(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	settings := e.DB.Settings()
	settings["autoTrading"] = map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 0.75}
	_ = e.DB.SaveSettings(settings)
	ev := e.Execute("telegram_t1")
	if asBool(ev.AutoTrading["allowNewEntries"]) || asBool(ev.AutoTrading["allowExits"]) {
		t.Fatalf("missing allow flags must be false, got %+v", ev.AutoTrading)
	}
	if ev.Monitor.Opened == nil || len(br.Orders) != 0 || ev.Runs["webull"].Reason != "entries_disabled" {
		t.Fatalf("the monitoring enters, missing allowNewEntries sends nothing: %+v %+v", ev.Runs["webull"], br.Orders)
	}
}

func TestExplicitAllowNewEntriesFalseBlocksEntry(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	settings := e.DB.Settings()
	settings["autoTrading"] = map[string]any{
		"enabled": true, "lowIBS": 0.9, "highIBS": 0.75,
		"allowNewEntries": false, "allowExits": false,
	}
	_ = e.DB.SaveSettings(settings)
	if ev := e.Execute("telegram_t1"); len(br.Orders) != 0 || ev.Runs["webull"].Reason != "entries_disabled" {
		t.Fatalf("explicit allowNewEntries=false must send no entry: %+v %+v", ev.Runs["webull"], br.Orders)
	}
}

func TestHighIBSZeroDoesNotLiquidate(t *testing.T) {
	// IBS .5: an exit only if a zero highIBS were taken literally.
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 10, Volume: 1}}
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	_ = db.SaveDataset("MSFT", "MSFT", "", "", bars, false)
	_ = db.SavePosition(store.Position{ID: "b1", Symbol: "MSFT", Status: "open", EntryDate: "2026-08-01", EntryPrice: store.Ptr[float64](10.0), Webull: store.BrokerLeg{Qty: 1, EntryPrice: store.Ptr[float64](10.0)}})
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"MSFT": bars}})
	settings := e.DB.Settings()
	settings["autoTrading"] = map[string]any{
		"enabled": true, "allowExits": true, "highIBS": 0.0, "lowIBS": 0.1,
		"symbols": "MSFT",
	}
	_ = e.DB.SaveSettings(settings)
	ev := e.Evaluate()
	if fmt.Sprint(ev.Decision["action"]) == "exit" {
		t.Fatalf("highIBS=0 must not liquidate %+v", ev.Decision)
	}
}

func TestPerTickerThresholds(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}} // IBS 0.05
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.02, "highIBS": 0.75})
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}})
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	ev := e.Evaluate()
	if fmt.Sprint(ev.Decision["action"]) != "none" {
		t.Fatalf("watch lowIBS 0.02 should block entry at 0.05: %+v", ev.Decision)
	}
}

// The tradeable universe is the monitoring list, full stop. A second list in
// the autotrade config used to narrow it, so a ticker could be monitored,
// signal an entry and be skipped without saying why.
func TestUniverseIsTheMonitoringList(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	_ = db.UpsertWatch(map[string]any{"symbol": "MSFT"})
	_ = db.UpsertWatch(map[string]any{"symbol": "AMZN"})
	watches, err := db.ListWatches()
	if err != nil {
		t.Fatal(err)
	}
	got := configuredSymbols(watches)
	if len(got) != 2 || got[0] != "AMZN" || got[1] != "MSFT" {
		t.Fatalf("universe %v", got)
	}
}

func TestStaleBarIsNotOk(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.9})
	q := &MemoryQuotes{
		Bars:     map[string][]types.OHLC{"AAPL": bars},
		QuoteErr: map[string]error{"AAPL": fmt.Errorf("quote down")},
	}
	e := New(db, q)
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	ev := e.Evaluate()
	if len(ev.Quotes) != 1 || ev.Quotes[0].OK {
		t.Fatalf("stale bar must not be ok %+v", ev.Quotes)
	}
	if fmt.Sprint(ev.Decision["action"]) != "none" {
		t.Fatalf("must not trade on stale bar %+v", ev.Decision)
	}
}

func TestReconcileApplyFalseWhenNothing(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, _ := testEngine(t, bars)
	snap := e.Reconcile(true)
	if snap["applied"] != false {
		t.Fatalf("applied %+v", snap)
	}
}

// Reconcile's only repair left: a position the broker demonstrably holds but
// whose leg the journal never got. Closing a monitor row from a broker row is
// gone with the second table.
func TestReconcileFillsMissingLegFromBrokerBook(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	br.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 3.0}}
	_ = db.SavePosition(store.Position{ID: "m1", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-01", EntryPrice: store.Ptr[float64](10.0)})

	snap := e.Reconcile(true)
	if snap["applied"] != true {
		t.Fatalf("should apply %+v", snap)
	}
	got, _ := db.GetPosition("m1")
	if got == nil || got.Webull.Qty != 3 {
		t.Fatalf("webull leg not filled from the book: %+v", got)
	}
	// The price is left unknown rather than guessed: nobody observed a fill.
	if got.Webull.EntryPrice != nil {
		t.Fatalf("invented a fill price: %v", *got.Webull.EntryPrice)
	}
}

func TestMissingThresholdsUseDefaults(t *testing.T) {
	if ParseTradingConfig(map[string]any{}).LowIBS != ibs.DefaultLowIBS {
		t.Fatal("low default")
	}
	if h := ParseTradingConfig(map[string]any{}).HighIBS; h != ibs.DefaultHighIBS {
		t.Fatalf("high default %v", h)
	}
	if h := ParseTradingConfig(map[string]any{"highIBS": 0.0}).HighIBS; h != 0 {
		t.Fatalf("explicit highIBS 0 must be kept, got %v", h)
	}
	if ParseTradingConfig(map[string]any{"lowIBS": 0.0}).LowIBS != 0 {
		t.Fatal("explicit lowIBS 0 is never-enter")
	}
}

func TestEvalWatchMatchesWatchThresholds(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	// IBS = (8.6-8)/(12-8) = 0.15, between DefaultLowIBS (0.10) and cfg 0.20.
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.6, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}})
	var watch *store.Watch // a held ticker off the watchlist
	cfg := ParseTradingConfig(map[string]any{"lowIBS": 0.20, "highIBS": 0.80})

	low, high := watchThresholds(watch, cfg)
	ev := e.evalWatch("AAPL", watch, cfg, []string{"finnhub"})
	if !ev.ok {
		t.Fatalf("quote should be ok %+v", ev)
	}
	if ev.low != low || ev.high != high {
		t.Fatalf("evalWatch %v/%v watchThresholds %v/%v", ev.low, ev.high, low, high)
	}
	if low != 0.20 || high != 0.80 {
		t.Fatalf("watch-less fallback must use cfg, got %v %v", low, high)
	}
	if ev.entry != ibs.IsEntrySignal(ev.ibs, low) {
		t.Fatalf("entry %v ibs %v low %v", ev.entry, ev.ibs, low)
	}

	quotes := []LiveQuote{{
		Symbol:     "AAPL",
		OK:         ev.ok,
		IBS:        ev.ibs,
		Thresholds: QuoteThresholds{LowIBS: low, HighIBS: high},
	}}
	d := decideMonitor(quotes, []string{"AAPL"}, "")
	want := "none"
	if ev.entry {
		want = "entry"
	}
	if fmt.Sprint(d["action"]) != want {
		t.Fatalf("decideMonitor %+v want %s (entry=%v ibs=%v low=%v)", d, want, ev.entry, ev.ibs, low)
	}

	cfg0 := ParseTradingConfig(map[string]any{"lowIBS": 0.0, "highIBS": 0.80})
	low0, _ := watchThresholds(watch, cfg0)
	if low0 != 0 {
		t.Fatalf("cfg lowIBS 0 kept as %v", low0)
	}
	ev0 := e.evalWatch("AAPL", watch, cfg0, []string{"finnhub"})
	if ev0.low != low0 {
		t.Fatalf("evalWatch low %v watchThresholds %v", ev0.low, low0)
	}
	watch0 := &store.Watch{Symbol: "AAPL", LowIBS: 0, HighIBS: 0.80}
	lowW, _ := watchThresholds(watch0, cfg)
	if lowW != 0 {
		t.Fatalf("watch lowIBS 0 must stay 0, got %v", lowW)
	}
	if e.evalWatch("AAPL", watch0, cfg, []string{"finnhub"}).low != lowW {
		t.Fatal("evalWatch must follow watchThresholds for watch lowIBS 0")
	}
}

func TestEvaluateWindowUsesCfgLowIBSWhenWatchIsZero(t *testing.T) {
	// IBS = 0.15: watch lowIBS 0 is never-enter even if cfg is 0.20.
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.6, Volume: 1}}
	db, e, _ := testEngine(t, bars)
	if err := db.PatchWatch("AAPL", map[string]any{"lowIBS": 0.0}); err != nil {
		t.Fatal(err)
	}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.20, "highIBS": 0.75, "allowNewEntries": true,
	})
	ev := e.Evaluate()
	if fmt.Sprint(ev.Decision["action"]) != "none" {
		t.Fatalf("watch lowIBS 0 must not enter at IBS 0.15, got %+v", ev.Decision)
	}
}

func TestEvaluateTreatsCfgLowIBSZeroAsNeverEnter(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, _ := testEngine(t, bars)
	if err := db.PatchWatch("AAPL", map[string]any{"lowIBS": 0.0}); err != nil {
		t.Fatal(err)
	}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.0, "highIBS": 0.75, "allowNewEntries": true,
	})
	ev := e.Evaluate()
	if fmt.Sprint(ev.Decision["action"]) != "none" {
		t.Fatalf("lowIBS 0 is never-enter (IBS 0.05), got %+v cfg=%+v", ev.Decision, e.AutoConfig())
	}
}

func TestSanitizeKeepsZeroLowIBS(t *testing.T) {
	out := mustSanitize(t, map[string]any{"lowIBS": 0.0, "highIBS": 0.75}, map[string]any{})
	if asFloat(out["lowIBS"]) != 0 {
		t.Fatalf("lowIBS 0 must be kept, got %v", out["lowIBS"])
	}
	_, err := sanitizeAutoTradingConfig(map[string]any{"highIBS": 0.0}, map[string]any{"lowIBS": 0.1, "highIBS": 0.75}, time.Now())
	if err == nil {
		t.Fatal("highIBS 0 is an inverted pair")
	}
}

func TestLogsSplitByPrefix(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, _ := testEngine(t, bars)
	e.logAuto("order_submit_ok", "abc", map[string]any{"symbol": "AAPL"})
	e.logMonitor("t1_execution_started", "abc", nil)
	e.logBrokerRaw("order_track", "abc", map[string]any{"clientOrderId": "x"})
	out, err := e.Logs(20)
	if err != nil {
		t.Fatal(err)
	}
	at, _ := out["autotrade"].([]map[string]any)
	mo, _ := out["monitor"].([]map[string]any)
	br, _ := out["brokerRaw"].([]map[string]any)
	if len(at) == 0 || len(mo) == 0 || len(br) == 0 {
		t.Fatalf("split %+v", out)
	}
}

// Entries are always whole shares: no setting can make the engine send a
// fractional buy.
func TestEntryQuantityIsAlwaysWhole(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true, "allowFractionalShares": true})
	if _, ok := e.AutoConfig()["allowFractionalShares"]; ok {
		t.Fatal("allowFractionalShares must not be storable any more")
	}
	e.Execute("test")
	if len(br.Orders) != 1 {
		t.Fatalf("orders %+v", br.Orders)
	}
	if q := br.Orders[0].Quantity; q != math.Trunc(q) {
		t.Fatalf("fractional entry quantity %v", q)
	}
}
func TestStaleTrackerExpires(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, _ := testEngine(t, bars)
	e.Now = func() time.Time { return time.Date(2026, 9, 3, 20, 0, 0, 0, time.UTC) }
	_ = db.SaveOrderTracker(store.Tracker{
		ClientOrderID: "old-1", Symbol: "AAPL", Action: "entry",
		Status: "submitted", DateKey: "2026-09-01",
	})
	e.expireStaleTrackers()
	row, err := db.FindPendingTracker("AAPL", "entry")
	if err != nil {
		t.Fatal(err)
	}
	if row != nil {
		t.Fatal("stale tracker must expire")
	}
}

func TestActualizeUsesLastBarWindow(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL"})
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}})
	start, end := e.historicalWindow("AAPL")
	wantStart := unixMidnightUTC("2026-08-25")
	if start != wantStart {
		t.Fatalf("start %d want %d end %d", start, wantStart, end)
	}
	span := end - start
	if span > 40*365*24*60*60 {
		t.Fatalf("must not fetch 40 years, span=%d", span)
	}
}

func TestInFlightPreventsDoubleRecord(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	res := e.Execute("test")
	oid := br.Orders[0].ClientOrderID
	br.SetDetail(oid, map[string]any{"status": "FILLED", "avg_price": 8.2, "filled_qty": 1})
	e.mu.Lock()
	e.inFlight = map[string]bool{oid: true}
	e.mu.Unlock()
	if e.pollOneTracker(store.Tracker{ClientOrderID: oid, Symbol: "AAPL", Action: "entry", Quantity: 1.0, DateKey: "2026-09-01"}) {
		t.Fatal("inFlight should skip")
	}
	// The monitoring's row is there since the signal; the fill is not yet.
	trades, _ := db.ListPositions()
	if len(trades) != 1 || trades[0].Webull.Executed() {
		t.Fatalf("double record %+v", trades)
	}
	e.mu.Lock()
	delete(e.inFlight, oid)
	e.mu.Unlock()
	waitTrackerFinal(t, e, db, "AAPL", "entry")
	trades, _ = db.ListPositions()
	if len(trades) != 1 || trades[0].Webull.Qty != 1 {
		t.Fatalf("after release %+v", trades)
	}
	_ = res
}

func TestQuoteRangeMissingIsNotOk(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.9})
	q := &MemoryQuotes{
		Bars: map[string][]types.OHLC{"AAPL": bars},
		Q:    map[string]providers.QuotePayload{"AAPL": {Quote: map[string]any{"current": 8.2}}},
	}
	e := New(db, q)
	ev := e.evalWatch("AAPL", nil, TradingConfig{}, []string{"finnhub"})
	if ev.ok {
		t.Fatalf("missing range must not be ok %+v", ev)
	}
}

// Node clamps live IBS to [0,1] (autotrade.js:575); an extended-hours quote
// outside the session range must not produce an out-of-range IBS.
func TestIBSFromQuoteClampsToUnitRange(t *testing.T) {
	mk := func(low, high, cur float64) providers.QuotePayload {
		return providers.QuotePayload{
			Range: map[string]any{"low": low, "high": high},
			Quote: map[string]any{"current": cur, "low": low, "high": high},
		}
	}
	if v, ok := ibsFromQuote(mk(90, 100, 85)); !ok || v != 0 {
		t.Fatalf("below-range quote: got %v ok=%v, want 0", v, ok)
	}
	if v, ok := ibsFromQuote(mk(90, 100, 110)); !ok || v != 1 {
		t.Fatalf("above-range quote: got %v ok=%v, want 1", v, ok)
	}
	if v, ok := ibsFromQuote(mk(90, 100, 95)); !ok || v != 0.5 {
		t.Fatalf("in-range quote: got %v ok=%v, want 0.5", v, ok)
	}
}

// Node derives the execution window from the trading calendar
// (autotrade.js:2140-2146), so a short day closes at 13:00 ET.
func TestExecutionWindowFollowsShortDayClose(t *testing.T) {
	db, e, _ := testEngine(t, []types.OHLC{{Date: "2024-11-29", Open: 10, High: 12, Low: 8, Close: 9, Volume: 1}})
	if err := db.SaveCalendar([]byte(`{"holidays":{},"shortDays":{"2024":{"11-29":{"name":"Day After Thanksgiving","type":"short"}}},"tradingHours":{"normal":{"start":"09:30","end":"16:00"},"short":{"start":"09:30","end":"13:00"}}}`)); err != nil {
		t.Fatal(err)
	}
	ny, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skip("no tzdata")
	}
	cfg := ParseTradingConfig(map[string]any{"executionWindowSeconds": 90.0})

	at := func(hh, mm int) {
		e.Now = func() time.Time { return time.Date(2024, 11, 29, hh, mm, 0, 0, ny) }
	}
	at(12, 59)
	if e.outsideExecutionWindow(cfg) {
		t.Error("12:59 on a 13:00 close must be inside the window")
	}
	at(15, 59)
	if !e.outsideExecutionWindow(cfg) {
		t.Error("15:59 is two hours after a short-day close; must be outside")
	}
}

// Node runs sell-then-buy inside one T-1 (telegramAggregation.js: waitingForExitFill
// is hardcoded false). Go must do the same, but only once the exit actually filled.
func TestT1SellsThenBuysInTheSameCycle(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	held := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 11.9, Volume: 1}}  // ibs 0.975 -> exit
	target := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.1, Volume: 1}} // ibs 0.025 -> entry
	_ = db.SaveDataset("HELD", "HELD", "", "", held, false)
	_ = db.SaveDataset("BUYME", "BUYME", "", "", target, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "HELD", "lowIBS": 0.1, "highIBS": 0.75})
	_ = db.UpsertWatch(map[string]any{"symbol": "BUYME", "lowIBS": 0.1, "highIBS": 0.75})
	_ = db.SavePosition(store.Position{ID: "held-1", Symbol: "HELD", Status: "open", EntryDate: "2026-09-01", EntryPrice: store.Ptr[float64](9.0), Quantity: 1, Webull: store.BrokerLeg{Qty: 1, EntryPrice: store.Ptr[float64](9.0)}})

	br := &MemoryBroker{
		Pos: []any{map[string]any{"symbol": "HELD", "quantity": 1.0}},
	}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"HELD": held, "BUYME": target}})
	e.Broker = br
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.Sleep = func(time.Duration) {}
	e.Now = func() time.Time {
		ny, _ := time.LoadLocation("America/New_York")
		return time.Date(2026, 9, 1, 15, 59, 0, 0, ny)
	}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "allowExits": true, "allowNewEntries": true,
		"lowIBS": 0.1, "highIBS": 0.75,
	})
	// Every order the memory broker takes reports as filled on the first poll.
	br.FillStatus = "FILLED"
	br.FillQty = 1
	br.FillPrice = 11.9
	// The broker's book catches up with the sell.
	br.OnPositions = func() []any {
		br.mu.Lock()
		defer br.mu.Unlock()
		if len(br.Orders) > 0 {
			return []any{}
		}
		return []any{map[string]any{"symbol": "HELD", "quantity": 1.0}}
	}

	if _, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true}); err != nil {
		t.Fatal(err)
	}
	// settleSells polls the exit tracker; the detail map answers FILLED for any
	// id, so the sell settles, the book is empty and the entry is free to run.
	var sold, bought bool
	for _, o := range br.Orders {
		if o.Symbol == "HELD" && o.Side == "SELL" {
			sold = true
		}
		if o.Symbol == "BUYME" && o.Side == "BUY" {
			bought = true
		}
	}
	if !sold {
		t.Fatalf("no exit order placed: %+v", br.Orders)
	}
	if !bought {
		t.Fatalf("exit filled but no re-entry in the same T-1: %+v", br.Orders)
	}
}

// A transient failure before the order reaches the broker must not cost the
// day: the submission is retried inside the same run, not on the next tick.
func TestSubmitRetriesAfterTransientFailure(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true,
	})
	br.SetFailPlace("connection reset", 2, false)

	res := e.Execute("test")
	if !res.Executed {
		t.Fatalf("third attempt should have submitted: %+v", res.Broker)
	}
	if len(br.Orders) != 1 {
		t.Fatalf("want exactly one order on the books, got %+v", br.Orders)
	}
}

// The dangerous case: the order reached the broker but the reply was lost.
// Resending would open a second position, so the retry must first ask the
// broker whether that client order id landed.
func TestSubmitDoesNotDuplicateWhenTheReplyIsLost(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true,
	})
	br.SetFailPlace("i/o timeout", 1, true)

	res := e.Execute("test")
	if len(br.Orders) != 1 {
		t.Fatalf("resent an order that had already landed: %+v", br.Orders)
	}
	if !res.Executed {
		t.Fatalf("the landed order should be reported as submitted: %+v", res.Broker)
	}
}

// Every attempt genuinely failing must leave nothing behind.
func TestSubmitGivesUpWithoutPlacingAnything(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true,
	})
	br.SetFailPlace("service unavailable", 0, false)

	res := e.Execute("test")
	if res.Executed {
		t.Fatal("nothing was placed; must not report an execution")
	}
	if len(br.Orders) != 0 {
		t.Fatalf("no order should exist: %+v", br.Orders)
	}
}

// A single provider outage must not cancel the day: the chain falls through to
// the next real-time source, and the eval records who actually answered.
func TestQuoteFallsBackToTheNextProvider(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)

	q := &ProviderAwareQuotes{
		Fail: map[string]error{"finnhub": fmt.Errorf("503 service unavailable")},
		Bars: bars,
	}
	e := New(db, q)
	e.Telegram = &MemoryTelegram{}
	e.Sleep = func(time.Duration) {}

	got, used, err := e.liveQuote("AAPL", []string{"finnhub", "webull"})
	if err != nil {
		t.Fatalf("chain should have recovered: %v", err)
	}
	if used != "webull" {
		t.Fatalf("served by %q, want webull", used)
	}
	if asFloat(got.Quote["current"]) != 8.2 {
		t.Fatalf("unexpected quote %+v", got.Quote)
	}
	// Node retries the primary before falling through (1 try + 2 retries).
	if q.Calls["finnhub"] != quoteAttempts {
		t.Fatalf("primary tried %d times, want %d", q.Calls["finnhub"], quoteAttempts)
	}
}

// Providers whose quote is synthesised from daily history must never serve a
// live decision — they would answer with yesterday's bar.
func TestChainOnlyContainsRealtimeProviders(t *testing.T) {
	chain := quoteProviderChain(ParseTradingConfig(map[string]any{
		"provider": "alpha_vantage",
	}))
	if chain[0] != realtimeQuoteProviders[0] {
		t.Fatalf("a non-real-time primary must fall back to the default, got %v", chain)
	}
	for _, p := range chain {
		if !isRealtimeQuoteProvider(p) {
			t.Fatalf("%q is not a real-time provider: %v", p, chain)
		}
	}
}

// Should not happen on a market order in a liquid name, but if it ever does the
// journal must follow the executed quantity and the operator must be told.
func TestPartialFillIsRecordedAndWarned(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	tg := &MemoryTelegram{}
	e.Telegram = tg
	e.Sleep = func(time.Duration) {}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true,
	})
	res := e.Execute("test")
	if !res.Executed {
		t.Fatalf("submit %+v", res.Broker)
	}
	oid := br.Orders[0].ClientOrderID
	br.SetDetail(oid, map[string]any{
		"status": "CANCELLED", "filled_qty": 4.0, "filled_price": 8.25,
		"client_order_id": oid,
	})
	waitTrackerFinal(t, e, db, "AAPL", "entry")

	trades, _ := db.ListPositions()
	if len(trades) != 1 {
		t.Fatalf("the executed 4 shares must be journalled, got %+v", trades)
	}
	if q := asFloat(trades[0].Quantity); q != 4 {
		t.Fatalf("journalled quantity %v, want the executed 4", q)
	}
	var warned bool
	for _, m := range tg.Sent() {
		if strings.Contains(m[1], "частичное исполнение") {
			warned = true
		}
	}
	if !warned {
		t.Fatalf("no partial-fill warning sent: %+v", tg.Sent())
	}
}

// A fill reported under a status word we do not know must still be recorded.
func TestFullFillUnderUnknownStatusIsRecorded(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true,
	})
	if res := e.Execute("test"); !res.Executed {
		t.Fatalf("submit %+v", res.Broker)
	}
	oid := br.Orders[0].ClientOrderID
	br.SetDetail(oid, map[string]any{
		"status": "TRADE_COMPLETE_NEW_WORD", "filled_qty": br.Orders[0].Quantity, "filled_price": 8.25,
		"client_order_id": oid,
	})
	waitTrackerFinal(t, e, db, "AAPL", "entry")

	trades, _ := db.ListPositions()
	if len(trades) != 1 {
		t.Fatalf("a fully executed order must be journalled whatever it is called, got %+v", trades)
	}
}

// An empty monitoring list must not lock an already-open position in place:
// the exit is decided from the open broker trade, not from the watchlist.
// See P0-5 in AUTOTRADE_ROADMAP.md.
func TestEmptyWatchlistStillExitsOpenPosition(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 11.9, Volume: 1}} // IBS 0.975
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	_ = db.SavePosition(store.Position{ID: "b-aapl", Symbol: "AAPL", Status: "open", EntryDate: "2026-08-20", EntryPrice: store.Ptr[float64](10.0), Quantity: 2, Webull: store.BrokerLeg{Qty: 2, EntryPrice: store.Ptr[float64](10.0)}})
	br := &MemoryBroker{}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}})
	e.Broker = br
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	ny, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Fatal(err)
	}
	e.Now = func() time.Time { return time.Date(2026, 9, 1, 15, 59, 0, 0, ny) }
	br.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 2.0}}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "highIBS": 0.75, "lowIBS": 0.1, "allowExits": true, "allowNewEntries": false,
	})

	if watches, _ := db.ListWatches(); len(watches) != 0 {
		t.Fatalf("test setup must leave the watchlist empty, got %v", watches)
	}

	ev := e.Evaluate()
	if fmt.Sprint(ev.Decision["action"]) != "exit" {
		t.Fatalf("want exit decision with an empty watchlist: %+v", ev.Decision)
	}

	res := e.Execute("test")
	if fmt.Sprint(res.Decision["action"]) != "exit" {
		t.Fatalf("want exit %+v", res.Decision)
	}
	if len(br.Orders) != 1 || br.Orders[0].Side != "SELL" {
		t.Fatalf("want a single SELL order submitted, got %+v", br.Orders)
	}
}

// Решение мониторинга не спрашивает брокера ни о чём (CORE §3.1). Цикл с
// входом читает книгу ровно один раз на брокера: Webull лимитирует
// /account/positions примерно одним запросом в две секунды.
func TestEvaluateReadsNoBrokerAndEntryReadsOnce(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	e.Evaluate()
	if br.PosCalls != 0 {
		t.Fatalf("the monitoring's evaluation read the broker's positions %d times", br.PosCalls)
	}
	if res := e.Execute("telegram_t1"); !res.Executed || br.PosCalls != 1 {
		t.Fatalf("PosCalls = %d, want 1 for the entry: %+v", br.PosCalls, res.Runs)
	}
}

// A highIBS of 0 makes every reading an exit. The pair is resolved as a pair,
// so a stored row with an invalid half sends both values back to the
// documented defaults.
func TestWatchThresholdsRejectUnreadableHighIBS(t *testing.T) {
	cfg := ParseTradingConfig(map[string]any{"lowIBS": 0.20, "highIBS": 0.80})
	low, high := watchThresholds(&store.Watch{Symbol: "AAPL", LowIBS: 0.1, HighIBS: 0}, cfg)
	if low != ibs.DefaultLowIBS || high != ibs.DefaultHighIBS {
		t.Fatalf("highIBS 0: got %v/%v want defaults %v/%v", low, high, ibs.DefaultLowIBS, ibs.DefaultHighIBS)
	}
	low, high = watchThresholds(nil, ParseTradingConfig(map[string]any{"lowIBS": 0.20, "highIBS": "не число"}))
	if low != ibs.DefaultLowIBS || high != ibs.DefaultHighIBS {
		t.Fatalf("cfg highIBS unreadable: got %v/%v", low, high)
	}
}

// The decision re-checks the pair it was handed: a quote row carrying a zero
// highIBS must not close an open position on any reading above zero.
func TestDecideMonitorIgnoresZeroHighIBS(t *testing.T) {
	quotes := []LiveQuote{{
		Symbol:     "AAPL",
		OK:         true,
		IBS:        0.5,
		Thresholds: QuoteThresholds{LowIBS: 0.1, HighIBS: 0},
	}}
	d := decideMonitor(quotes, []string{"AAPL"}, "AAPL")
	if fmt.Sprint(d["action"]) != "none" || fmt.Sprint(d["reason"]) != "exit_threshold_not_reached" {
		t.Fatalf("IBS 0.5 with a zero highIBS must not exit: %+v", d)
	}
}
