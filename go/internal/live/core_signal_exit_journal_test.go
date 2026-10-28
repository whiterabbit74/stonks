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
	// Автоторговля выключена, никто не продавал: нога честно показывает
	// бумаги у брокера (инвариант K.5).
	if p.Webull.Qty != 4 {
		t.Fatalf("нога пишется только исполнением: %+v", p.Webull)
	}
}

// Мониторинг закрывает свою позицию по своему сигналу, что бы ни творилось у
// брокеров: бумага в книге, висящая заявка, нечитаемая книга — всё это дело
// автоторговли, а она выключена (CORE §3.1).
func TestMonitorExitIgnoresBrokerState(t *testing.T) {
	cases := map[string]func(db *store.DB, br *MemoryBroker){
		"бумага в книге": func(_ *store.DB, br *MemoryBroker) {
			br.Pos = []any{map[string]any{"symbol": "MSFT", "quantity": 4.0}}
		},
		"висящая заявка": func(db *store.DB, _ *MemoryBroker) {
			if err := db.SaveOrderTracker(store.Tracker{
				ClientOrderID: "t1", Symbol: "MSFT", Action: "exit", Status: "submitted",
				Quantity: 4.0, Broker: "webull", DateKey: "2026-09-01",
			}); err != nil {
				t.Fatal(err)
			}
		},
		"книга не читается": func(_ *store.DB, br *MemoryBroker) {
			br.FailPositions = fmt.Errorf("positions down")
		},
	}
	for name, setup := range cases {
		t.Run(name, func(t *testing.T) {
			db, e, br := signalExitEngine(t)
			setup(db, br)
			e.Execute("telegram_t1")
			if p := openPositionByID(t, db, "p1"); p.Status != "closed" || p.ExitPrice == nil || *p.ExitPrice != 11.5 {
				t.Fatalf("мониторинг выходит по сигналу независимо от брокера: %+v", p)
			}
			if len(br.Orders) != 0 {
				t.Fatalf("автоторговля выключена — заявок нет: %+v", br.Orders)
			}
		})
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
