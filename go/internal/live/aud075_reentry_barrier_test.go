package live

import (
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

// AUD-075 / CORE-01: ожидания выходов шли параллельно, но вход выполнялся
// только после того, как дождались все брокеры. Плоский Robinhood обязан
// отправить свою покупку, пока заявка Webull ещё висит в работе, а не после.
func TestReentryDoesNotWaitForPeerExitWait(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	exitBars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 11.9, Volume: 1}}
	entryBars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.1, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", exitBars, false)
	_ = db.SaveDataset("MSFT", "MSFT", "", "", entryBars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.10, "highIBS": 0.75})
	_ = db.UpsertWatch(map[string]any{"symbol": "MSFT", "lowIBS": 0.10, "highIBS": 0.75})
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": exitBars, "MSFT": entryBars}})
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.Now = nearCloseNow()
	wb := &MemoryBroker{Name: "webull", FillStatus: "WORKING", Acct: map[string]any{"cash_balance": 10000.0}}
	rh := &MemoryBroker{Name: "robinhood", FillStatus: "FILLED", FillPrice: 11.9, FillQty: 42,
		Acct: map[string]any{"cash_balance": 10000.0}}
	e.AttachBroker("webull", wb)
	e.AttachBroker("robinhood", rh)
	wb.SetPos([]any{map[string]any{"symbol": "AAPL", "quantity": 7.0}})
	rh.SetPos([]any{map[string]any{"symbol": "AAPL", "quantity": 42.0}})
	mustInsertBrokerTrade(t, e, "wb-aapl", "AAPL", "webull", "2026-08-20", 7)
	mustInsertBrokerTrade(t, e, "rh-aapl", "AAPL", "robinhood", "2026-08-20", 42)
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.10, "highIBS": 0.75, "entryCapitalMode": "cash_100",
		"allowNewEntries": true, "allowExits": true,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})

	rhBought := func() bool {
		rh.mu.Lock()
		defer rh.mu.Unlock()
		_, buy, _ := sidesOf(rh)
		return buy > 0
	}
	rhFlat := func() bool {
		rows, err := db.OpenPositions()
		if err != nil {
			return false
		}
		for _, p := range rows {
			if p.Robinhood.Holds() {
				return false
			}
		}
		return true
	}
	// Заявку Webull опрашивает только его собственное ожидание выхода, и
	// доходит оно туда уже после того, как Robinhood разнёс свой. Держим это
	// ожидание, пока Robinhood не купит: с общим барьером он не купит, пока
	// ожидание не кончится, и проверка истечёт по таймауту.
	var inRun, blocked, boughtWhileWaiting atomic.Bool
	wb.BeforeDetail = func() {
		if !inRun.Load() || !rhFlat() || !blocked.CompareAndSwap(false, true) {
			return
		}
		deadline := time.Now().Add(3 * time.Second)
		for time.Now().Before(deadline) {
			if rhBought() {
				boughtWhileWaiting.Store(inRun.Load())
				return
			}
			time.Sleep(2 * time.Millisecond)
		}
	}
	// Ожидание Webull должно занимать настоящее время: иначе его десять
	// попыток проскакивают раньше, чем Robinhood разнесёт свой выход, и опрос
	// заявки ни разу не приходится на проверяемый момент.
	e.Sleep = func(time.Duration) { time.Sleep(20 * time.Millisecond) }

	inRun.Store(true)
	_, err = e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true})
	inRun.Store(false)
	if err != nil {
		t.Fatal(err)
	}
	if !boughtWhileWaiting.Load() {
		t.Fatal("вход Robinhood ждал, пока закончится ожидание выхода Webull")
	}
	if _, buy, sym := sidesOf(rh); buy != 1 || sym != "MSFT" {
		t.Fatalf("Robinhood должен войти ровно один раз: %+v", rh.Orders)
	}
	if _, wbBuy, _ := sidesOf(wb); wbBuy != 0 {
		t.Fatalf("выход Webull ещё в работе, входить ему нельзя: %+v", wb.Orders)
	}
}
