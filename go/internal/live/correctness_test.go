package live

import (
	"fmt"
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
	return db, e, br
}

func TestRejectedOrderDoesNotOpenTrade(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "entrySizingMode": "quantity", "fixedQuantity": 1})
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
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "entrySizingMode": "quantity", "fixedQuantity": 2})
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
		"provider": "nope", "entrySizingMode": "balance", "orderType": "LIMIT",
		"timeInForce": "GTC", "supportTradingSession": "N", "unknown": "x",
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
	if fmt.Sprint(out["orderType"]) != "LIMIT" || fmt.Sprint(out["timeInForce"]) != "GTC" {
		t.Fatalf("enums %+v", out)
	}
}

func TestOmittedAllowFlagsFilledBySettingsDefaults(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, _ := testEngine(t, bars)
	settings := e.DB.Settings()
	settings["autoTrading"] = map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 0.75}
	_ = e.DB.SaveSettings(settings)
	ev := e.Evaluate()
	if ev.AutoTrading["allowNewEntries"] != true || ev.AutoTrading["allowExits"] != true {
		t.Fatalf("A7 must fill Node defaults true, got %+v", ev.AutoTrading)
	}
	if fmt.Sprint(ev.Decision["action"]) != "entry" {
		t.Fatalf("default allowNewEntries true should enter %+v", ev.Decision)
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
		"onlyFromTelegramWatches": false, "symbols": "MSFT",
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
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 0.75, "allowNewEntries": true, "onlyFromTelegramWatches": true})
	ev := e.Evaluate()
	if fmt.Sprint(ev.Decision["action"]) != "none" {
		t.Fatalf("watch lowIBS 0.02 should block entry at 0.05: %+v", ev.Decision)
	}
}

func TestConfiguredSymbolsIntersection(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	_ = db.UpsertWatch(map[string]any{"symbol": "MSFT"})
	_ = db.UpsertWatch(map[string]any{"symbol": "AMZN"})
	e := New(db, nil)
	got := configuredSymbols(map[string]any{"onlyFromTelegramWatches": true, "symbols": "AAPL"}, e)
	if len(got) != 0 {
		t.Fatalf("intersection empty, got %v", got)
	}
	got = configuredSymbols(map[string]any{"onlyFromTelegramWatches": true, "symbols": "MSFT"}, e)
	if len(got) != 1 || got[0] != "MSFT" {
		t.Fatalf("intersection %v", got)
	}
	got = configuredSymbols(map[string]any{"onlyFromTelegramWatches": false, "symbols": "AAPL"}, e)
	if len(got) != 1 || got[0] != "AAPL" {
		t.Fatalf("explicit only %v", got)
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

func TestPlaceMarketCfgPassedFromExecute(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "entrySizingMode": "quantity", "fixedQuantity": 1,
		"allowFractionalShares": true, "timeInForce": "GTC", "supportTradingSession": "N",
	})
	e.Execute("test")
	if !br.LastCfg.Fractional || br.LastCfg.TimeInForce != "GTC" || br.LastCfg.SupportTradingSession != "N" {
		t.Fatalf("cfg %+v", br.LastCfg)
	}
}

func TestPreviewBeforeSendStillSubmits(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "entrySizingMode": "quantity", "fixedQuantity": 1,
		"previewBeforeSend": true,
	})
	res := e.Execute("test")
	if !res.Executed || len(br.Orders) != 1 {
		t.Fatalf("still send %+v orders %+v", res, br.Orders)
	}
	logs, _ := db.ListAutotradeLogs(50)
	found := false
	for _, row := range logs {
		if strings.Contains(fmt.Sprint(row["message"]), "event=order_preview_skipped") {
			found = true
		}
	}
	if !found {
		t.Fatalf("missing preview log %+v", logs)
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
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "entrySizingMode": "quantity", "fixedQuantity": 1})
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
	ev := e.evalWatch("AAPL", map[string]any{"symbol": "AAPL"}, "finnhub")
	if ev.ok {
		t.Fatalf("missing range must not be ok %+v", ev)
	}
}
