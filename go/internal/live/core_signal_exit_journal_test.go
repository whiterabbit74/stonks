package live

import (
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

// Журнал — сигнальная сторона сделки: выход, решённый на T-1, попадает в строку
// и тогда, когда заявку никто не отправлял (автоторговля выключена, бумага
// продана руками). Закрывала строку только запись филла, поэтому позиция,
// которой нет ни в одной книге брокера, висела открытой навсегда и блокировала
// все последующие входы (прод 23.10.2026, MSFT).
//
// IBS котировки = (11.5-8)/(12-8) = 0.875 > highIBS 0.75 — сигнал на выход.
func signalExitEngine(t *testing.T) (*store.DB, *Engine, *MemoryBroker) {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 11.5, Volume: 1}}
	_ = db.SaveDataset("MSFT", "MSFT", "", "", bars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "MSFT", "lowIBS": 0.10, "highIBS": 0.75})
	q := providers.QuotePayload{
		Range:   map[string]any{"open": 10.0, "high": 12.0, "low": 8.0},
		Quote:   map[string]any{"open": 10.0, "high": 12.0, "low": 8.0, "current": 11.5},
		DateKey: "2026-09-01",
		AsOf:    nearCloseNow()(),
	}
	br := &MemoryBroker{Name: "webull", Acct: map[string]any{"cash_balance": 10000.0}}
	e := New(db, &MemoryQuotes{Q: map[string]providers.QuotePayload{"MSFT": q}})
	e.AttachBroker("webull", br)
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.Now = nearCloseNow()
	e.Sleep = func(time.Duration) {}
	// Состояние прода: мастер-тумблер выключен, брокер подключён.
	e.PatchAutoConfig(map[string]any{
		"enabled": false, "lowIBS": 0.10, "highIBS": 0.75,
		"allowNewEntries": true, "allowExits": true,
		"brokers": map[string]any{
			"webull": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})
	entry := 10.0
	if err := db.SavePosition(store.Position{
		ID: "p1", Symbol: "MSFT", Status: "open", EntryDate: "2026-08-31",
		EntryPrice: &entry, Quantity: 4, Source: "telegram_t1",
		Webull: store.BrokerLeg{Qty: 4, EntryPrice: &entry, EntryOrderID: "o1"},
	}); err != nil {
		t.Fatal(err)
	}
	return db, e, br
}

func openPositionByID(t *testing.T, db *store.DB, id string) store.Position {
	t.Helper()
	rows, err := db.ListPositions()
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range rows {
		if p.ID == id {
			return p
		}
	}
	t.Fatalf("позиция %s исчезла из журнала", id)
	return store.Position{}
}

func TestUnheldPositionClosesBySignal(t *testing.T) {
	db, e, br := signalExitEngine(t)
	e.Execute("telegram_t1")
	if len(br.Orders) != 0 {
		t.Fatalf("продавать нечего и автоторговля выключена: %+v", br.Orders)
	}
	p := openPositionByID(t, db, "p1")
	if p.Status != "closed" {
		t.Fatalf("строка должна закрыться по сигналу, а не висеть открытой: %+v", p)
	}
	if p.ExitDate != "2026-09-01" {
		t.Fatalf("дата выхода — торговая дата решения: %q", p.ExitDate)
	}
	if p.ExitPrice == nil || *p.ExitPrice != 11.5 {
		t.Fatalf("цена выхода — котировка T-1, на которой принято решение: %v", p.ExitPrice)
	}
	if p.ExitIBS == nil || *p.ExitIBS < 0.87 || *p.ExitIBS > 0.88 {
		t.Fatalf("IBS выхода — то же чтение: %v", p.ExitIBS)
	}
	if p.PnLAbsolute == nil || *p.PnLAbsolute != 6 {
		t.Fatalf("PnL считается от цены решения: %v", p.PnLAbsolute)
	}
	if p.Webull.Holds() {
		t.Fatalf("закрытая позиция не держит акций: %+v", p.Webull)
	}
}

// Брокер бумагу держит — выход принадлежит его филлу, и сигнал не имеет права
// закрыть строку раньше: иначе цена исполнения потеряется, а нога останется с
// акциями при закрытой строке.
func TestHeldPositionIsNotClosedBySignal(t *testing.T) {
	db, e, br := signalExitEngine(t)
	br.Pos = []any{map[string]any{"symbol": "MSFT", "quantity": 4.0}}
	e.Execute("telegram_t1")
	if p := openPositionByID(t, db, "p1"); p.Status != "open" {
		t.Fatalf("позицию, которую держит брокер, закрывает филл, а не сигнал: %+v", p)
	}
}

// Незавершённая заявка по тикеру тоже владеет выходом: её филл ещё придёт.
func TestPendingOrderBlocksSignalClose(t *testing.T) {
	db, e, _ := signalExitEngine(t)
	if err := db.SaveOrderTracker(map[string]any{
		"clientOrderId": "t1", "symbol": "MSFT", "action": "exit", "status": "submitted",
		"quantity": 4.0, "broker": "webull", "dateKey": "2026-09-01",
	}); err != nil {
		t.Fatal(err)
	}
	e.Execute("telegram_t1")
	if p := openPositionByID(t, db, "p1"); p.Status != "open" {
		t.Fatalf("строку закрывает филл висящей заявки, а не сигнал: %+v", p)
	}
}

// Книга брокера не прочиталась — «не держит» из этого не следует.
func TestUnreadableBookBlocksSignalClose(t *testing.T) {
	db, e, br := signalExitEngine(t)
	br.FailPositions = fmt.Errorf("positions down")
	e.Execute("telegram_t1")
	if p := openPositionByID(t, db, "p1"); p.Status != "open" {
		t.Fatalf("закрывать строку по нечитаемой книге нельзя: %+v", p)
	}
}

// IBS ниже порога выхода — позиция держится дальше, как в бэктесте.
func TestSignalCloseWaitsForExitThreshold(t *testing.T) {
	db, e, _ := signalExitEngine(t)
	e.Quotes = &MemoryQuotes{Q: map[string]providers.QuotePayload{"MSFT": {
		Range:   map[string]any{"open": 10.0, "high": 12.0, "low": 8.0},
		Quote:   map[string]any{"open": 10.0, "high": 12.0, "low": 8.0, "current": 9.0},
		DateKey: "2026-09-01",
		AsOf:    nearCloseNow()(),
	}}}
	e.Execute("telegram_t1")
	if p := openPositionByID(t, db, "p1"); p.Status != "open" {
		t.Fatalf("IBS .25 ниже порога .75 — выхода нет: %+v", p)
	}
}

// Цена и IBS сигнала, который не исполнился, должны остаться в решении: по
// «reason=position_not_held_here» без них не видно, по чему мы должны были
// выйти.
func TestSkippedExitKeepsSignalReading(t *testing.T) {
	open := &store.Position{Status: "open", Symbol: "MSFT"}
	quotes := []LiveQuote{{
		Symbol: "MSFT", OK: true, IBS: 0.784, CurrentPrice: 524.7,
		Thresholds: QuoteThresholds{LowIBS: 0.1, HighIBS: 0.75},
	}}
	d := decideLiveAction(quotes, []string{"MSFT"}, map[string]float64{}, nil, open, true, true)
	if d["action"] != "none" || d["reason"] != "position_not_held_here" {
		t.Fatalf("продавать у этого брокера нечего: %+v", d)
	}
	if d["signal"] != "ibs_exit" {
		t.Fatalf("сработавший сигнал должен быть назван: %+v", d)
	}
	cand, ok := d["candidate"].(*LiveQuote)
	if !ok || cand == nil || cand.CurrentPrice != 524.7 || candidateIBS(d) != 0.784 {
		t.Fatalf("цена и IBS решения потерялись: %+v", d)
	}
}
