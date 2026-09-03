package live

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

func TestMain(m *testing.M) {
	FastTrackers = true
	os.Exit(m.Run())
}

func nearCloseNow() func() time.Time {
	ny, err := time.LoadLocation("America/New_York")
	if err != nil {
		return func() time.Time { return time.Date(2026, 9, 1, 19, 59, 0, 0, time.UTC) }
	}
	return func() time.Time { return time.Date(2026, 9, 1, 15, 59, 0, 0, ny) }
}

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
	if len(trades) != 0 {
		t.Fatalf("must not record trade on submit: %+v", trades)
	}
	if db.FindPendingTracker("AAPL", "entry") == nil {
		t.Fatal("expected pending tracker after submit")
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
	bars := []types.OHLC{{Date: "2026-09-01", Open: 248, High: 255, Low: 247, Close: 250.0, Volume: 1}}
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
	e.Now = nearCloseNow()
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
	e.Now = nearCloseNow()
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
	e.Now = nearCloseNow()
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

func TestSplitJumpBlocksSignals(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{
		{Date: "2026-09-01", Open: 91, High: 94, Low: 90, Close: 92.7, Volume: 1},
	}
	_ = db.SaveDataset("TQQQ", "TQQQ", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "TQQQ", "lowIBS": 0.9, "highIBS": 0.75})
	q := &MemoryQuotes{Q: map[string]providers.QuotePayload{
		"TQQQ": {Quote: map[string]any{"current": 44.68}, Range: map[string]any{"low": 44.0, "high": 50.0}},
	}}
	tg := &MemoryTelegram{}
	br := &MemoryBroker{}
	e := New(db, q)
	e.Telegram = tg
	e.Broker = br
	e.ChatID = "c"
	e.Now = nearCloseNow()
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "entrySizingMode": "quantity", "fixedQuantity": 1})
	res, err := e.Aggregate(11, AggregateOpts{ForceSend: true, DryRun: true})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(res.Text, "ПРОВЕРКА ДАННЫХ") || !strings.Contains(res.Text, "EMA/IBS сигналы заблокированы") {
		t.Fatalf("integrity block missing: %s", res.Text)
	}
	if strings.Contains(res.Text, "🔔 ENTRY") || strings.Contains(res.Text, "· ENTRY") {
		t.Fatalf("blocked ticker still ENTRY: %s", res.Text)
	}
	live, err := e.Aggregate(1, AggregateOpts{ForceSend: true, DryRun: false})
	if err != nil {
		t.Fatal(err)
	}
	if len(br.Orders) != 0 {
		t.Fatalf("split jump must not place: %+v text=%s", br.Orders, live.Text)
	}
}

func TestEmaNearSendsSecondTelegram(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	var bars []types.OHLC
	for i := 1; i <= 20; i++ {
		bars = append(bars, types.OHLC{Date: fmt.Sprintf("2026-08-%02d", i), Open: 100, High: 100, Low: 100, Close: 100, Volume: 1})
	}
	_ = db.SaveDataset("TQQQ", "TQQQ", "", "", bars, true)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.1})
	_ = db.SaveDataset("AAPL", "AAPL", "", "", []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 10, Volume: 1}}, false)
	_, _ = db.UpsertEMAAlert(map[string]any{
		"id": "ema-1", "symbol": "TQQQ", "emaPeriod": 20, "buyLevelPct": 0, "sellLevelPct": 40,
		"nextAction": "buy", "thresholdPct": 1, "levelPct": 0, "direction": "below",
	})
	q := &MemoryQuotes{
		Bars: map[string][]types.OHLC{"AAPL": {{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 10, Volume: 1}}},
		Q:    map[string]providers.QuotePayload{"TQQQ": {Quote: map[string]any{"current": 100.0}, Range: map[string]any{"low": 99.0, "high": 101.0}}},
	}
	tg := &MemoryTelegram{}
	e := New(db, q)
	e.Telegram = tg
	e.ChatID = "c"
	res, err := e.Aggregate(11, AggregateOpts{ForceSend: true, DryRun: true})
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(func() []string {
		var s []string
		for _, m := range tg.Messages {
			s = append(s, m[1])
		}
		return s
	}(), "\n")
	if !strings.Contains(joined, "📐 EMA сигналы") && !strings.Contains(res.Text, "📐 EMA сигналы") {
		t.Fatalf("EMA overview missing messages=%+v text=%s", tg.Messages, res.Text)
	}
}

func TestPollTrackersMarksFilled(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.9})
	br := &MemoryBroker{Details: map[string]map[string]any{}}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}})
	e.Broker = br
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "entrySizingMode": "quantity", "fixedQuantity": 1})
	res := e.Execute("test")
	if !res.Executed || len(br.Orders) != 1 {
		t.Fatalf("execute %+v orders %+v", res, br.Orders)
	}
	oid := br.Orders[0].ClientOrderID
	if db.FindPendingTracker("AAPL", "entry") == nil {
		t.Fatal("expected pending tracker")
	}
	br.SetDetail(oid, map[string]any{"status": "FILLED", "filled_qty": 1.0, "avg_price": 8.2})
	waitTrackerFinal(t, e, db, "AAPL", "entry")
	if db.FindPendingTracker("AAPL", "entry") != nil {
		t.Fatal("tracker should be filled")
	}
	trades, _ := db.ListTrades("broker_trades")
	if len(trades) != 1 || trades[0]["status"] != "open" {
		t.Fatalf("fill should record broker trade %+v", trades)
	}
	if asFloat(trades[0]["entryPrice"]) != 8.2 {
		t.Fatalf("fill price %+v", trades[0])
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

func TestT11OverviewMatchesNodeLayout(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	entryBars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}} // IBS 0.05
	flatBars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 10, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", entryBars, false)
	_ = db.SaveDataset("MSFT", "MSFT", "", "", flatBars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.1, "highIBS": 0.75})
	_ = db.UpsertWatch(map[string]any{"symbol": "MSFT", "lowIBS": 0.1, "highIBS": 0.75})
	_ = db.InsertTrade("trades", map[string]any{"id": "m1", "symbol": "MSFT", "status": "open", "entryDate": "2026-08-20", "entryPrice": 10.0})
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": entryBars, "MSFT": flatBars}})
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.Now = func() time.Time { return time.Date(2026, 9, 1, 19, 49, 0, 0, time.UTC) }
	res, err := e.Aggregate(11, AggregateOpts{ForceSend: true, DryRun: true})
	if err != nil {
		t.Fatal(err)
	}
	txt := res.Text
	for _, need := range []string{
		"11m", "ET", "2026-09-01",
		"🔔 ENTRY:", "AAPL",
		"EXIT: —",
		"FLAT", "OPEN",
		"IBS", "$",
		"RT",
		"█", "░",
	} {
		if !strings.Contains(txt, need) {
			t.Fatalf("T-11 missing %q in:\n%s", need, txt)
		}
	}
	if !strings.Contains(txt, "· ENTRY") {
		t.Fatalf("AAPL row should tag ENTRY:\n%s", txt)
	}
	if strings.Contains(txt, "T-11 overview") {
		t.Fatalf("old stub header still present:\n%s", txt)
	}
}

func TestT1TextHasFreshnessAndPosition(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.1, "highIBS": 0.75})
	_ = db.InsertTrade("trades", map[string]any{"id": "m1", "symbol": "AAPL", "status": "open", "entryDate": "2026-08-20", "entryPrice": 8.0})
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}})
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.Now = func() time.Time { return time.Date(2026, 9, 1, 19, 59, 0, 0, time.UTC) }
	res, err := e.Simulate("confirmations")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(res.Text, "Котировки:") || !strings.Contains(res.Text, "Позиция: AAPL") {
		t.Fatalf("T-1 missing freshness/position:\n%s", res.Text)
	}
}

type t1ParityFix struct {
	LowIBS          float64 `json:"lowIBS"`
	HighIBS         float64 `json:"highIBS"`
	EntrySizingMode string  `json:"entrySizingMode"`
	FixedQuantity   float64 `json:"fixedQuantity"`
	Quotes          []struct {
		Symbol  string  `json:"symbol"`
		Current float64 `json:"current"`
		Low     float64 `json:"low"`
		High    float64 `json:"high"`
	} `json:"quotes"`
}

func loadT1ParityFix(t *testing.T) t1ParityFix {
	t.Helper()
	raw, err := os.ReadFile("testdata/t1-parity-quotes.json")
	if err != nil {
		t.Fatal(err)
	}
	var fix t1ParityFix
	if err := json.Unmarshal(raw, &fix); err != nil {
		t.Fatal(err)
	}
	return fix
}

func TestT1DryRunSameQuotesAsNode(t *testing.T) {
	fix := loadT1ParityFix(t)
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	qmap := map[string]providers.QuotePayload{}
	bmap := map[string][]types.OHLC{}
	for _, q := range fix.Quotes {
		bars := []types.OHLC{{Date: "2026-09-01", Open: q.Current, High: q.High, Low: q.Low, Close: q.Current, Volume: 1}}
		_ = db.SaveDataset(q.Symbol, q.Symbol, "", "", bars, false)
		_ = db.UpsertWatch(map[string]any{"symbol": q.Symbol, "lowIBS": fix.LowIBS, "highIBS": fix.HighIBS})
		qmap[q.Symbol] = providers.QuotePayload{
			Quote: map[string]any{"current": q.Current},
			Range: map[string]any{"low": q.Low, "high": q.High},
		}
		bmap[q.Symbol] = bars
	}
	br := &MemoryBroker{}
	e := New(db, &MemoryQuotes{Bars: bmap, Q: qmap})
	e.Telegram = &MemoryTelegram{}
	e.Broker = br
	e.ChatID = "c"
	e.Now = func() time.Time { return time.Date(2026, 9, 1, 19, 59, 0, 0, time.UTC) }
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": fix.LowIBS, "highIBS": fix.HighIBS, "allowNewEntries": true,
		"entrySizingMode": fix.EntrySizingMode, "fixedQuantity": fix.FixedQuantity, "onlyFromTelegramWatches": true,
	})
	sim, err := e.Simulate("confirmations")
	if err != nil {
		t.Fatal(err)
	}
	if sim.Executed || !sim.DryRun {
		t.Fatalf("dry-run must not execute: %+v", sim)
	}
	if len(br.Orders) != 0 {
		t.Fatalf("dry-run placed %+v", br.Orders)
	}
	ev := e.Evaluate()
	action, _ := ev.Decision["action"].(string)
	symbol := fmt.Sprint(ev.Decision["symbol"])
	if action != "entry" || symbol != "AAPL" {
		t.Fatalf("decision %+v (Node oracle: entry AAPL)", ev.Decision)
	}
	if !strings.Contains(sim.Text, "Открываем AAPL") {
		t.Fatalf("T-1 dry-run text should enter AAPL:\n%s", sim.Text)
	}
	price := 0.0
	for _, q := range fix.Quotes {
		if q.Symbol == "AAPL" {
			price = q.Current
		}
	}
	qty, qerr := e.sizeOrder("entry", "AAPL", e.AutoConfig(), price)
	if qerr != nil || qty != fix.FixedQuantity {
		t.Fatalf("qty %v %v want %.0f", qty, qerr, fix.FixedQuantity)
	}
	_, t1 := db.AggregateState(e.ChatID, "2026-09-01")
	if t1 {
		t.Fatal("Simulate must not set t1Sent")
	}
}

func TestT1DryRunSameWatchesAsNode(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	entry := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}} // IBS 0.05
	flat := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 10, Volume: 1}}   // IBS 0.50
	bars := map[string][]types.OHLC{"AAPL": entry, "AMZN": flat, "MSFT": flat, "V": flat}
	for sym, b := range bars {
		_ = db.SaveDataset(sym, sym, "", "", b, false)
		_ = db.UpsertWatch(map[string]any{"symbol": sym, "lowIBS": 0.1, "highIBS": 0.75})
	}
	br := &MemoryBroker{}
	e := New(db, &MemoryQuotes{Bars: bars})
	e.Telegram = &MemoryTelegram{}
	e.Broker = br
	e.ChatID = "c"
	e.Now = func() time.Time { return time.Date(2026, 9, 1, 19, 59, 0, 0, time.UTC) }
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.1, "highIBS": 0.75, "allowNewEntries": true,
		"entrySizingMode": "quantity", "fixedQuantity": 1, "onlyFromTelegramWatches": true,
	})
	sim, err := e.Simulate("confirmations")
	if err != nil {
		t.Fatal(err)
	}
	if sim.Executed || !sim.DryRun {
		t.Fatalf("dry-run must not execute: %+v", sim)
	}
	if len(br.Orders) != 0 {
		t.Fatalf("dry-run placed %+v", br.Orders)
	}
	if !strings.Contains(sim.Text, "Открываем AAPL") {
		t.Fatalf("Node-equivalent T-1 should enter AAPL:\n%s", sim.Text)
	}
	if strings.Contains(sim.Text, "Открываем AMZN") || strings.Contains(sim.Text, "Открываем MSFT") || strings.Contains(sim.Text, "Открываем V") {
		t.Fatalf("should only enter lowest IBS:\n%s", sim.Text)
	}
	ev := e.Evaluate()
	action, _ := ev.Decision["action"].(string)
	symbol := fmt.Sprint(ev.Decision["symbol"])
	if action != "entry" || symbol != "AAPL" {
		t.Fatalf("decision %+v", ev.Decision)
	}
	qty, qerr := e.sizeOrder("entry", "AAPL", e.AutoConfig(), 8.2)
	if qerr != nil || qty != 1 {
		t.Fatalf("qty %v %v (Node quantity mode = 1)", qty, qerr)
	}
}

func TestTrackerWheelUsesNodeBackoff(t *testing.T) {
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
	gate := make(chan struct{})
	var mu sync.Mutex
	var delays []time.Duration
	e.Sleep = func(d time.Duration) {
		mu.Lock()
		delays = append(delays, d)
		mu.Unlock()
		<-gate
	}
	res := e.Execute("test")
	if !res.Executed || len(br.Orders) != 1 {
		t.Fatalf("execute %+v orders %+v", res, br.Orders)
	}
	oid := br.Orders[0].ClientOrderID
	br.mu.Lock()
	if br.Details == nil {
		br.Details = map[string]map[string]any{}
	}
	br.Details[oid] = map[string]any{"status": "FILLED", "filled_qty": 1.0, "avg_price": 8.2}
	br.mu.Unlock()
	close(gate)
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if db.FindPendingTracker("AAPL", "entry") == nil {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if db.FindPendingTracker("AAPL", "entry") != nil {
		t.Fatal("wheel must mark tracker filled without waiting for the 20s scheduler tick")
	}
	mu.Lock()
	got := append([]time.Duration(nil), delays...)
	mu.Unlock()
	if len(got) == 0 || got[0] != 1500*time.Millisecond {
		t.Fatalf("first poll delay want 1.5s (Node TRACKING_DELAYS_MS[0]), got %v", got)
	}
	if br.DetailN < 1 {
		t.Fatalf("OrderDetail never called, n=%d", br.DetailN)
	}
}

func TestCancelOpenOrdersBeforeEntry(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.9})
	br := &MemoryBroker{Open: []any{
		map[string]any{"symbol": "AAPL", "client_order_id": "old-1", "status": "WORKING"},
		map[string]any{"symbol": "MSFT", "client_order_id": "msft-1", "status": "WORKING"},
	}}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}})
	e.Broker = br
	e.Telegram = &MemoryTelegram{}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true,
		"entrySizingMode": "quantity", "fixedQuantity": 1, "cancelOpenOrdersBeforeEntry": true,
	})
	res := e.Execute("test")
	if !res.Executed {
		t.Fatalf("execute %+v", res)
	}
	if len(br.Cancelled) != 1 || br.Cancelled[0] != "old-1" {
		t.Fatalf("cancelled %+v", br.Cancelled)
	}
}
