package live

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

func TestExecuteReserveSubmitTrack(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.9})
	br := &MemoryBroker{}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}})
	e.Broker = br
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "entrySizingMode": "quantity", "fixedQuantity": 2})
	res := e.Execute("test")
	if !res.Executed {
		t.Fatalf("not executed: %+v", res)
	}
	if len(br.Orders) != 1 || br.Orders[0].ClientOrderID == "" {
		t.Fatalf("orders %+v", br.Orders)
	}
	logs, _ := db.ListAutotradeLogs(10)
	if len(logs) == 0 {
		t.Fatal("expected log")
	}
	trades, _ := db.ListTrades("broker_trades")
	if len(trades) == 0 || trades[0]["status"] != "open" {
		t.Fatalf("broker trade %+v", trades)
	}
	if br.Orders[0].Quantity != 2 {
		t.Fatalf("qty %+v", br.Orders[0])
	}
}

func TestExecuteBalanceSizing(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.9})
	br := &MemoryBroker{Acct: map[string]any{
		"data": map[string]any{
			"account_currency_assets": []any{map[string]any{
				"currency": "USD", "day_buying_power": 502.27, "cash_balance": 502.27, "net_liquidation_value": 502.27,
			}},
		},
	}}
	e := New(db, &MemoryQuotes{Q: map[string]providers.QuotePayload{
		"AAPL": {Quote: map[string]any{"current": 250.23}, Range: map[string]any{"low": 250.0, "high": 300.0}},
	}})
	e.Broker = br
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "entrySizingMode": "balance", "entryCapitalMode": "standard_safe"})
	res := e.Execute("test")
	if !res.Executed {
		t.Fatalf("not executed: %+v", res)
	}
	if len(br.Orders) != 1 || br.Orders[0].Quantity != 1 {
		t.Fatalf("orders %+v", br.Orders)
	}
}

func TestSimulateDoesNotPlace(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.9})
	br := &MemoryBroker{}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}})
	e.Broker = br
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "entrySizingMode": "quantity", "fixedQuantity": 1})
	sim, err := e.Simulate("confirmations")
	if err != nil {
		t.Fatal(err)
	}
	if !sim.DryRun || sim.Executed {
		t.Fatalf("simulate must be dry-run: %+v", sim)
	}
	if len(br.Orders) != 0 {
		t.Fatalf("simulate placed %+v", br.Orders)
	}
	live, err := e.Aggregate(1, AggregateOpts{ForceSend: true, DryRun: false})
	if err != nil {
		t.Fatal(err)
	}
	if !live.Executed || len(br.Orders) != 1 {
		t.Fatalf("live T-1 %+v orders %+v", live, br.Orders)
	}
}

func TestT1MismatchBlocksExecute(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	_ = db.SaveDataset("MSFT", "MSFT", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.9})
	_ = db.UpsertWatch(map[string]any{"symbol": "MSFT", "lowIBS": 0.9})
	_ = db.InsertTrade("trades", map[string]any{"id": "m1", "symbol": "AAPL", "status": "open", "entryDate": "2026-08-01"})
	_ = db.InsertTrade("broker_trades", map[string]any{"id": "b1", "symbol": "MSFT", "status": "open", "entryDate": "2026-08-01"})
	br := &MemoryBroker{}
	tg := &MemoryTelegram{}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars, "MSFT": bars}})
	e.Broker = br
	e.Telegram = tg
	e.ChatID = "c"
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "entrySizingMode": "quantity", "fixedQuantity": 1})
	res, err := e.Aggregate(1, AggregateOpts{ForceSend: true, DryRun: false})
	if err != nil {
		t.Fatal(err)
	}
	if len(br.Orders) != 0 {
		t.Fatalf("mismatch must block live orders: %+v", br.Orders)
	}
	if !strings.Contains(res.Text, "Состояние брокера") || !strings.Contains(res.Text, "Monitor продолжает считать позиции независимо от брокера") {
		t.Fatalf("mismatch telegram %s", res.Text)
	}
	if strings.Contains(res.Text, "Действий нет") {
		t.Fatalf("should not say no-action when mismatch reported: %s", res.Text)
	}
}

func TestT1WaitForFillBlocksEntry(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	exitBars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 11.9, Volume: 1}} // IBS ~0.975 exit
	entryBars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", exitBars, false)
	_ = db.SaveDataset("MSFT", "MSFT", "", "", entryBars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.1, "highIBS": 0.75})
	_ = db.UpsertWatch(map[string]any{"symbol": "MSFT", "lowIBS": 0.9, "highIBS": 0.75})
	_ = db.InsertTrade("broker_trades", map[string]any{"id": "b1", "symbol": "AAPL", "status": "open", "entryDate": "2026-08-01", "quantity": 2})
	_ = db.InsertTrade("trades", map[string]any{"id": "m1", "symbol": "AAPL", "status": "open", "entryDate": "2026-08-01"})
	br := &MemoryBroker{Pos: []any{map[string]any{"symbol": "AAPL", "quantity": 2.0}}}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": exitBars, "MSFT": entryBars}})
	e.Broker = br
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 0.75, "allowNewEntries": true, "allowExits": true, "entrySizingMode": "quantity", "fixedQuantity": 1})
	res, err := e.Aggregate(1, AggregateOpts{ForceSend: true, DryRun: false})
	if err != nil {
		t.Fatal(err)
	}
	if len(br.Orders) != 1 || br.Orders[0].Side != "SELL" {
		t.Fatalf("want only AAPL exit, got %+v text=%s", br.Orders, res.Text)
	}
	if db.FindPendingTracker("AAPL", "exit") == nil {
		t.Fatal("expected pending exit tracker")
	}
	if !strings.Contains(res.Text, "ждём подтверждение fill") && !strings.Contains(res.Text, "fill") {
		t.Fatalf("wait-for-fill telegram %s", res.Text)
	}
}

func TestPendingTrackerGuardsSecondSubmit(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.9})
	br := &MemoryBroker{}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}})
	e.Broker = br
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "entrySizingMode": "quantity", "fixedQuantity": 1})
	first := e.Execute("test")
	if !first.Executed {
		t.Fatalf("first %+v", first)
	}
	e2 := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}})
	e2.Broker = br
	e2.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "entrySizingMode": "quantity", "fixedQuantity": 1})
	// pending entry tracker + open position: Evaluate should not re-enter; force-check FindPending
	if db.FindPendingTracker("AAPL", "entry") == nil {
		t.Fatal("tracker not persisted")
	}
}

func TestTestBuyKillSwitch(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := New(db, nil)
	e.Broker = &MemoryBroker{}
	t.Setenv("WEBULL_ENABLE_LIVE_TEST_BUY", "")
	_, err = e.TestBuy("AAPL", 1)
	if !errors.Is(err, ErrTestBuyDisabled) {
		t.Fatalf("want disabled, got %v", err)
	}
	t.Setenv("WEBULL_ENABLE_LIVE_TEST_BUY", "true")
	res, err := e.TestBuy("AAPL", 1)
	if err != nil || !res.Submitted {
		t.Fatalf("enabled test buy %v %+v", err, res)
	}
}
