package live

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

// The two layers of CORE §3: the monitoring decides on its own, autotrade
// follows it only when the master switch is on. These are the rows of the
// table the owner signed off (2026-10-26).

// layersEngine: AAPL is on its exit signal (IBS .975), MSFT on its entry
// signal (IBS .025); two brokers with every per-broker flag on — the state of
// production on 2026-10-26.
func layersEngine(t *testing.T, autotrade bool) (*Engine, *MemoryBroker, *MemoryBroker) {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	exitBars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 11.9, Volume: 1}}
	entryBars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.1, Volume: 1}}
	for sym, bars := range map[string][]types.OHLC{"AAPL": exitBars, "MSFT": entryBars} {
		_ = db.SaveDataset(sym, sym, "", "", bars, false)
		_ = db.UpsertWatch(map[string]any{"symbol": sym, "lowIBS": 0.10, "highIBS": 0.75})
	}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": exitBars, "MSFT": entryBars, "TQQQ": exitBars}})
	wb := &MemoryBroker{Name: "webull", Acct: map[string]any{"cash_balance": 10000.0}}
	rh := &MemoryBroker{Name: "robinhood", Acct: map[string]any{"cash_balance": 10000.0}}
	e.AttachBroker("webull", wb)
	e.AttachBroker("robinhood", rh)
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.Now = nearCloseNow()
	e.Sleep = func(time.Duration) {}
	e.PatchAutoConfig(map[string]any{
		"enabled": autotrade, "lowIBS": 0.10, "highIBS": 0.75, "entryCapitalMode": "cash_100",
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})
	return e, wb, rh
}

// emptiesAfterSell makes a broker's book follow its own sells, ticker by
// ticker, as a real feed does a second later.
func emptiesAfterSell(br *MemoryBroker, held ...any) {
	br.OnPositions = func() []any {
		br.mu.Lock()
		defer br.mu.Unlock()
		sold := map[string]bool{}
		for _, o := range br.Orders {
			if o.Side == "SELL" {
				sold[o.Symbol] = true
			}
		}
		var out []any
		for _, h := range held {
			if !sold[h.(map[string]any)["symbol"].(string)] {
				out = append(out, h)
			}
		}
		return out
	}
}

// Autotrade off, per-broker flags on, TQQQ at both brokers: the monitoring
// enters and later exits on its own, no broker is asked anything, nothing is
// sent, and TQQQ is nowhere in its report.
func TestAutotradeOffMonitoringStillTrades(t *testing.T) {
	e, wb, rh := layersEngine(t, false)
	for _, br := range []*MemoryBroker{wb, rh} {
		br.SetPos([]any{map[string]any{"symbol": "TQQQ", "quantity": 10.0}})
	}
	// Only MSFT is on a signal: the monitoring holds nothing and enters it.
	if err := e.DB.DeleteWatch("AAPL"); err != nil {
		t.Fatal(err)
	}
	res, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true})
	if err != nil {
		t.Fatal(err)
	}
	open, _ := e.openPosition()
	if open == nil || open.Symbol != "MSFT" || pv(open.EntryPrice) != 8.1 {
		t.Fatalf("the monitoring enters MSFT at its T-1 price with autotrade off: %+v", open)
	}
	if len(wb.Orders)+len(rh.Orders) != 0 || wb.PosCalls+rh.PosCalls != 0 {
		t.Fatalf("autotrade off asks no broker: orders %v %v, reads %d %d", wb.Orders, rh.Orders, wb.PosCalls, rh.PosCalls)
	}
	if !strings.Contains(res.Text, "Вход MSFT") || !strings.Contains(res.Text, "Автоторговля: выключена") || strings.Contains(res.Text, "TQQQ") {
		t.Fatalf("the report is the monitoring's, autotrade off in one line:\n%s", res.Text)
	}

	// The next session MSFT is on its exit: the monitoring closes on its own.
	e.Quotes = &MemoryQuotes{Bars: map[string][]types.OHLC{"MSFT": {{Date: "2026-09-02", Open: 10, High: 12, Low: 8, Close: 11.9, Volume: 1}}}}
	e.Now = func() time.Time { return nearCloseNow()().AddDate(0, 0, 1) }
	e.quoteCache = map[string]quoteCacheEntry{}
	if res := e.Execute("telegram_t1"); res.Monitor.Closed == nil || pv(res.Monitor.Closed.ExitPrice) != 11.9 {
		t.Fatalf("the monitoring exits on its own signal: %+v", res.Monitor)
	}
	if len(wb.Orders)+len(rh.Orders) != 0 {
		t.Fatalf("autotrade off sells nothing: %v %v", wb.Orders, rh.Orders)
	}
}

// Autotrade switched on while the monitoring already holds a position it took
// with autotrade off: nothing is bought to catch up (CORE §3.2).
func TestAutotradeDoesNotCatchUpAHeldPosition(t *testing.T) {
	e, wb, rh := layersEngine(t, true)
	if _, err := e.DB.OpenMonitorPosition(store.Position{ID: "m1", Symbol: "MSFT", EntryDate: "2026-08-31", EntryPrice: store.Ptr(9.0)}); err != nil {
		t.Fatal(err)
	}
	if res := e.Execute("telegram_t1"); res.Monitor.acted() || len(wb.Orders)+len(rh.Orders) != 0 {
		t.Fatalf("holding MSFT the monitoring does nothing, and autotrade follows nothing: %+v %v %v", res.Monitor, wb.Orders, rh.Orders)
	}
}

// Exit and entry in one cycle, brokers on their own: Webull may not sell, so
// its account is not cleared and its entry is skipped; Robinhood sells
// everything — AAPL and the TQQQ leftover — and then buys MSFT.
func TestExitClearsEachAccountAndEntryNeedsItEmpty(t *testing.T) {
	e, wb, rh := layersEngine(t, true)
	e.PatchAutoConfig(map[string]any{"brokers": map[string]any{
		"webull":    map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": false},
		"robinhood": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
	}})
	if _, err := e.DB.OpenMonitorPosition(store.Position{ID: "m1", Symbol: "AAPL", EntryDate: "2026-08-31", EntryPrice: store.Ptr(10.0)}); err != nil {
		t.Fatal(err)
	}
	wb.SetPos([]any{map[string]any{"symbol": "AAPL", "quantity": 3.0}})
	rh.FillStatus, rh.FillPrice = "FILLED", 11.9
	emptiesAfterSell(rh, map[string]any{"symbol": "AAPL", "quantity": 2.0}, map[string]any{"symbol": "TQQQ", "quantity": 5.0})

	res, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true})
	if err != nil {
		t.Fatal(err)
	}
	if got := sides(rh.Orders); strings.Join(got, " ") != "SELL:AAPL SELL:TQQQ BUY:MSFT" {
		t.Fatalf("Robinhood clears its account, then buys: %v", got)
	}
	if len(wb.Orders) != 0 || res.Executed != true {
		t.Fatalf("Webull may not sell, so it neither sells nor buys: %v", wb.Orders)
	}
	for _, want := range []string{"Выход AAPL", "Вход MSFT", "Webull: выходы выключены", "Robinhood: BUY MSFT MARKET отправлен"} {
		if !strings.Contains(res.Text, want) {
			t.Fatalf("want %q in:\n%s", want, res.Text)
		}
	}
}

// rejectFirstSell is a broker that turns down the cycle's first SELL: after
// accepting it (REJECTED, or CANCELLED with one share filled when partial is
// set), or right at placement, as Robinhood answers.
type rejectFirstSell struct {
	*MemoryBroker
	atPlacement, partial bool
	sellTries            int
	refusedID            string // the order refused at placement, known to the broker as REJECTED
}

func (b *rejectFirstSell) firstSellID() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, o := range b.Orders {
		if o.Side == "SELL" {
			return o.ClientOrderID
		}
	}
	return ""
}

func (b *rejectFirstSell) PlaceMarket(ctx context.Context, symbol, side string, qty float64, cfg PlaceMarketCfg) (OrderResult, error) {
	if side == "SELL" {
		b.sellTries++
		if b.atPlacement && b.sellTries == 1 {
			b.refusedID = cfg.ClientOrderID
			return OrderResult{ClientOrderID: cfg.ClientOrderID, Symbol: symbol, Side: side, Quantity: qty,
				Status: "rejected", Error: "order rejected by Robinhood: rejected"}, nil
		}
	}
	return b.MemoryBroker.PlaceMarket(ctx, symbol, side, qty, cfg)
}

func (b *rejectFirstSell) OrderDetail(ctx context.Context, id string) (map[string]any, error) {
	if id != "" && id == b.refusedID {
		return map[string]any{"status": "REJECTED", "client_order_id": id}, nil
	}
	if !b.atPlacement && id != "" && id == b.firstSellID() {
		if b.partial {
			return map[string]any{"status": "CANCELLED", "filled_qty": 1.0, "client_order_id": id}, nil
		}
		return map[string]any{"status": "REJECTED", "client_order_id": id}, nil
	}
	return b.MemoryBroker.OrderDetail(ctx, id)
}

// rejectedSellEngine: the monitoring exits AAPL and enters MSFT; Robinhood
// holds 2 AAPL, which leave its book only once a SELL of them really went
// through (the second one); Webull is empty.
func rejectedSellEngine(t *testing.T, br *rejectFirstSell) (*Engine, *MemoryBroker) {
	t.Helper()
	e, wb, rh := layersEngine(t, true)
	br.MemoryBroker = rh
	rh.FillStatus, rh.FillPrice = "FILLED", 11.9
	rh.OnPositions = func() []any {
		if br.sellTries >= 2 {
			return []any{}
		}
		return []any{map[string]any{"symbol": "AAPL", "quantity": 2.0}}
	}
	e.AttachBroker("robinhood", br)
	if _, err := e.DB.OpenMonitorPosition(store.Position{ID: "m1", Symbol: "AAPL", EntryDate: "2026-08-31", EntryPrice: store.Ptr(10.0)}); err != nil {
		t.Fatal(err)
	}
	return e, wb
}

// A sell the broker turned down without a fill is sent once more in the same
// minute; once it goes through, the account is empty and the entry follows
// (CORE §3.2).
func TestRejectedSellIsRetriedOnceInTheMinute(t *testing.T) {
	for _, atPlacement := range []bool{false, true} {
		br := &rejectFirstSell{atPlacement: atPlacement}
		e, wb := rejectedSellEngine(t, br)
		res, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true})
		if err != nil {
			t.Fatal(err)
		}
		if br.sellTries != 2 {
			t.Fatalf("atPlacement=%v: one retry of the turned-down sell, got %d sells", atPlacement, br.sellTries)
		}
		if _, buy, sym := sidesOf(br.MemoryBroker); buy != 1 || sym != "MSFT" {
			t.Fatalf("atPlacement=%v: the cleared account takes the entry: %v", atPlacement, sides(br.Orders))
		}
		if got := sides(wb.Orders); strings.Join(got, " ") != "BUY:MSFT" {
			t.Fatalf("Webull is empty and only buys: %v", got)
		}
		for _, want := range []string{"Robinhood: SELL AAPL не прошёл: отклонён брокером (rejected) — повтор", "Robinhood: SELL AAPL MARKET отправлен", "Robinhood: BUY MSFT MARKET отправлен"} {
			if !strings.Contains(res.Text, want) {
				t.Fatalf("atPlacement=%v: want %q in:\n%s", atPlacement, want, res.Text)
			}
		}
		if !hasAutotradeLog(t, e, "event=exit_rejected_retry") {
			t.Fatal("the retry must be logged")
		}
	}
}

// A sell that executed even one share is not retried: the feed may still list
// what it sold, and a second SELL could sell it twice.
func TestPartlyFilledSellIsNotRetried(t *testing.T) {
	br := &rejectFirstSell{partial: true}
	e, _ := rejectedSellEngine(t, br)
	res := e.Execute("telegram_t1")
	if br.sellTries != 1 {
		t.Fatalf("a sell with a fill must not be retried, got %d sells", br.sellTries)
	}
	if run := res.Runs["robinhood"]; run.Buy != nil || run.Reason != "broker_not_flat" {
		t.Fatalf("the account is not empty, so no entry: %+v", run)
	}
}
