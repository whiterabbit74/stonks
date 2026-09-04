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
		if db.FindPendingTracker(symbol, action) == nil {
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
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true,
		"executionWindowSeconds": 15,
	})
	// 15:59 ET is 60s to close, outside a 15s window. Node T-1 still sends the order.
	manual := e.Execute("manual_execute")
	if manual.Executed {
		t.Fatal("manual_execute must still honor the window")
	}
	res := e.Execute("telegram_t1")
	if !res.Executed || len(br.Orders) != 1 {
		t.Fatalf("telegram_t1 must not use executionWindowSeconds: executed=%v orders=%d %+v", res.Executed, len(br.Orders), res.Broker)
	}
}

func TestRejectedOrderDoesNotOpenTrade(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})
	res := e.Execute("test")
	if !res.Executed {
		t.Fatalf("submit %+v", res)
	}
	oid := br.Orders[0].ClientOrderID
	br.SetDetail(oid, map[string]any{"status": "REJECTED"})
	waitTrackerFinal(t, e, db, "AAPL", "entry")
	trades, _ := db.ListTrades("broker_trades")
	if len(trades) != 0 {
		t.Fatalf("rejected must not create trade %+v", trades)
	}
	if db.FindPendingTracker("AAPL", "entry") != nil {
		t.Fatal("rejected tracker must be final")
	}
	// Evaluate can still enter: no phantom open.
	ev := e.Evaluate()
	if fmt.Sprint(ev.Decision["action"]) != "entry" {
		t.Fatalf("phantom freeze: %+v", ev.Decision)
	}
}

func TestFillRecordsBrokerPriceAndQty(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})
	res := e.Execute("test")
	oid := br.Orders[0].ClientOrderID
	br.SetDetail(oid, map[string]any{
		"status": "FILLED", "avg_price": 8.41, "filled_qty": 1.5,
	})
	waitTrackerFinal(t, e, db, "AAPL", "entry")
	bt, _ := db.ListTrades("broker_trades")
	if len(bt) != 1 || asFloat(bt[0]["entryPrice"]) != 8.41 || asFloat(bt[0]["quantity"]) != 1.5 {
		t.Fatalf("broker fill %+v", bt)
	}
	mt, _ := db.ListTrades("trades")
	if len(mt) != 1 || asFloat(mt[0]["entryPrice"]) != 8.41 {
		t.Fatalf("monitor fill %+v", mt)
	}
	_ = res
}

func TestExitFillWritesPnLBySymbol(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 11.9, Volume: 1}}
	db, e, br := testEngine(t, bars)
	_ = db.InsertTrade("broker_trades", map[string]any{
		"id": "b-aapl", "symbol": "AAPL", "status": "open", "entryDate": "2026-08-20", "entryPrice": 10.0, "quantity": 2,
	})
	_ = db.InsertTrade("broker_trades", map[string]any{
		"id": "b-msft", "symbol": "MSFT", "status": "open", "entryDate": "2026-08-01", "entryPrice": 50.0, "quantity": 1,
	})
	_ = db.InsertTrade("trades", map[string]any{
		"id": "m-aapl", "symbol": "AAPL", "status": "open", "entryDate": "2026-08-20", "entryPrice": 10.0, "quantity": 2,
	})
	_ = db.InsertTrade("trades", map[string]any{
		"id": "m-msft", "symbol": "MSFT", "status": "open", "entryDate": "2026-08-01", "entryPrice": 50.0, "quantity": 1,
	})
	br.Pos = []any{map[string]any{"symbol": "AAPL", "quantity": 2.0}}
	e.PatchAutoConfig(map[string]any{"enabled": true, "highIBS": 0.75, "allowExits": true, "allowNewEntries": false})
	res := e.Execute("test")
	if fmt.Sprint(res.Decision["action"]) != "exit" {
		t.Fatalf("want exit %+v", res.Decision)
	}
	oid := br.Orders[0].ClientOrderID
	br.SetDetail(oid, map[string]any{"status": "FILLED", "deal_price": 12.0, "filled_quantity": 2})
	waitTrackerFinal(t, e, db, "AAPL", "exit")
	byID := map[string]map[string]any{}
	rows, _ := db.ListTrades("broker_trades")
	for _, t := range rows {
		byID[fmt.Sprint(t["id"])] = t
	}
	aapl, msft := byID["b-aapl"], byID["b-msft"]
	if aapl == nil || fmt.Sprint(aapl["status"]) != "closed" {
		t.Fatalf("aapl %+v", aapl)
	}
	if msft == nil || fmt.Sprint(msft["status"]) != "open" {
		t.Fatalf("must not close other symbol %+v", msft)
	}
	if asFloat(aapl["exitPrice"]) != 12 {
		t.Fatalf("exitPrice %+v", aapl)
	}
	if asFloat(aapl["pnlPercent"]) != 20 {
		t.Fatalf("pnlPercent %+v", aapl)
	}
	mon := db.GetTrade("trades", "m-aapl")
	if mon == nil || fmt.Sprint(mon["status"]) != "closed" || asFloat(mon["pnlAbsolute"]) != 2 {
		t.Fatalf("monitor pnl %+v", mon)
	}
}

func TestSanitizeAutoTradingConfig(t *testing.T) {
	out := sanitizeAutoTradingConfig(map[string]any{
		"enabled": true, "lowIBS": 5.0, "highIBS": -1.0, "dryRun": true,
		"executionWindowSeconds": 3, "maxSlippageBps": 5000,
		"provider": "nope", "unknown": "x",
	}, map[string]any{"provider": "finnhub", "lowIBS": 0.1})
	if asFloat(out["lowIBS"]) != 1 || asFloat(out["highIBS"]) != 0 {
		t.Fatalf("clamp %+v", out)
	}
	if asFloat(out["executionWindowSeconds"]) < 15 {
		t.Fatalf("window %+v", out)
	}
	if asFloat(out["maxSlippageBps"]) != 1000 {
		t.Fatalf("slippage %+v", out)
	}
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

func TestOmittedAllowFlagsAreFailClosed(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, _ := testEngine(t, bars)
	settings := e.DB.Settings()
	settings["autoTrading"] = map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 0.75}
	_ = e.DB.SaveSettings(settings)
	ev := e.Evaluate()
	if asBool(ev.AutoTrading["allowNewEntries"]) || asBool(ev.AutoTrading["allowExits"]) {
		t.Fatalf("missing allow flags must be false, got %+v", ev.AutoTrading)
	}
	if fmt.Sprint(ev.Decision["action"]) != "none" {
		t.Fatalf("missing allowNewEntries must not enter %+v", ev.Decision)
	}
}

func TestExplicitAllowNewEntriesFalseBlocksEntry(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, _ := testEngine(t, bars)
	settings := e.DB.Settings()
	settings["autoTrading"] = map[string]any{
		"enabled": true, "lowIBS": 0.9, "highIBS": 0.75,
		"allowNewEntries": false, "allowExits": false,
	}
	_ = e.DB.SaveSettings(settings)
	ev := e.Evaluate()
	if fmt.Sprint(ev.Decision["action"]) != "none" {
		t.Fatalf("explicit allowNewEntries=false must not enter %+v", ev.Decision)
	}
}

func TestHighIBSZeroDoesNotLiquidate(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 11.9, Volume: 1}}
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	_ = db.SaveDataset("MSFT", "MSFT", "", "", bars, false)
	_ = db.InsertTrade("broker_trades", map[string]any{
		"id": "b1", "symbol": "MSFT", "status": "open", "entryDate": "2026-08-01", "entryPrice": 10.0,
	})
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
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 0.75, "allowNewEntries": true})
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
	e := New(db, nil)
	got := configuredSymbols(map[string]any{"symbols": "AAPL"}, e)
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
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})
	ev := e.Evaluate()
	if len(ev.Quotes) != 1 || ev.Quotes[0]["ok"] == true {
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

func TestReconcileClosesMonitorFromBroker(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, _ := testEngine(t, bars)
	_ = db.InsertTrade("broker_trades", map[string]any{
		"id": "b1", "symbol": "AAPL", "status": "closed", "entryDate": "2026-08-01",
		"entryPrice": 10.0,
	})
	_ = db.PatchTrade("broker_trades", "b1", map[string]any{
		"status": "closed", "exitDate": "2026-09-01", "exitPrice": 11.0,
	})
	_ = db.InsertTrade("trades", map[string]any{
		"id": "m1", "symbol": "AAPL", "status": "open", "entryDate": "2026-08-01", "entryPrice": 10.0,
	})
	snap := e.Reconcile(true)
	if snap["applied"] != true {
		t.Fatalf("should apply %+v", snap)
	}
	mon := db.GetTrade("trades", "m1")
	if fmt.Sprint(mon["status"]) != "closed" || asFloat(mon["exitPrice"]) != 11 {
		t.Fatalf("monitor %+v", mon)
	}
}

func TestMissingThresholdsUseDefaults(t *testing.T) {
	if liveLowIBS(map[string]any{}) != ibs.DefaultLowIBS {
		t.Fatal("low default")
	}
	h, inv := liveHighIBS(map[string]any{})
	if h != ibs.DefaultHighIBS || inv {
		t.Fatalf("high default %v %v", h, inv)
	}
	_, inv = liveHighIBS(map[string]any{"highIBS": 0.0})
	if !inv {
		t.Fatal("explicit 0 is invalid")
	}
}

func TestLogsSplitByPrefix(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, _ := testEngine(t, bars)
	e.logAuto("order_submit_ok", "abc", map[string]any{"symbol": "AAPL"})
	e.logMonitor("t1_execution_started", "abc", nil)
	e.logBrokerRaw("order_track", "abc", map[string]any{"clientOrderId": "x"})
	out := e.Logs(20)
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
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "allowFractionalShares": true})
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
	_ = db.SaveOrderTracker(map[string]any{
		"clientOrderId": "old-1", "symbol": "AAPL", "action": "entry",
		"status": "submitted", "dateKey": "2026-09-01",
	})
	e.expireStaleTrackers()
	if db.FindPendingTracker("AAPL", "entry") != nil {
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
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})
	res := e.Execute("test")
	oid := br.Orders[0].ClientOrderID
	br.SetDetail(oid, map[string]any{"status": "FILLED", "avg_price": 8.2, "filled_qty": 1})
	e.mu.Lock()
	e.inFlight = map[string]bool{oid: true}
	e.mu.Unlock()
	if e.pollOneTracker(map[string]any{"clientOrderId": oid, "symbol": "AAPL", "action": "entry", "quantity": 1.0, "dateKey": "2026-09-01"}) {
		t.Fatal("inFlight should skip")
	}
	trades, _ := db.ListTrades("broker_trades")
	if len(trades) != 0 {
		t.Fatalf("double record %+v", trades)
	}
	e.mu.Lock()
	delete(e.inFlight, oid)
	e.mu.Unlock()
	waitTrackerFinal(t, e, db, "AAPL", "entry")
	trades, _ = db.ListTrades("broker_trades")
	if len(trades) != 1 {
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
	ev := e.evalWatch("AAPL", map[string]any{"symbol": "AAPL"}, []string{"finnhub"})
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
	cfg := map[string]any{"executionWindowSeconds": 90.0}

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
	_ = db.InsertTrade("broker_trades", map[string]any{
		"id": "held-1", "symbol": "HELD", "status": "open",
		"entryDate": "2026-09-01", "entryPrice": 9.0, "quantity": 1,
	})

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

	if _, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true}); err != nil {
		t.Fatal(err)
	}
	// awaitFlatAfterExit polls the exit tracker; the detail map answers FILLED
	// for any id, so the exit closes and the entry is free to run.
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
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true,
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
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true,
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
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true,
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
	chain := quoteProviderChain(map[string]any{
		"provider": "alpha_vantage",
	})
	if chain[0] != "finnhub" {
		t.Fatalf("a non-real-time primary must fall back to finnhub, got %v", chain)
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
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true,
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

	trades, _ := db.ListTrades("broker_trades")
	if len(trades) != 1 {
		t.Fatalf("the executed 4 shares must be journalled, got %+v", trades)
	}
	if q := asFloat(trades[0]["quantity"]); q != 4 {
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
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true,
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

	trades, _ := db.ListTrades("broker_trades")
	if len(trades) != 1 {
		t.Fatalf("a fully executed order must be journalled whatever it is called, got %+v", trades)
	}
}
