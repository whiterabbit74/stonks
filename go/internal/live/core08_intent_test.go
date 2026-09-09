package live

import (
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

// CORE-08: заявка принята брокером, процесс упал до startTracking. Намерение
// сохранено до сети, поэтому после перезапуска ResumeTrackers доводит её до
// журнала, а не теряет позицию без следа.
func TestOrderIntentSurvivesCrashBeforeTracking(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", bars, false)
	br := &MemoryBroker{Name: "webull", FillStatus: "FILLED", FillPrice: 8.2, FillQty: 5}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}})
	e.AttachBroker("webull", br)
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.Now = nearCloseNow()
	e.Sleep = func(time.Duration) {}

	meta := orderMeta{Symbol: "AAPL", Action: "entry", Quantity: 5, Broker: "webull",
		Source: "telegram_t1", DateKey: "2026-09-01"}
	res, err := e.placeMarket(backgroundWindow(), "AAPL", "BUY", 5, PlaceMarketCfg{}, br, meta)
	if err != nil || !res.Submitted {
		t.Fatalf("placement must succeed: %+v %v", res, err)
	}
	// Процесс упал ровно здесь: startTracking не вызван.
	tr := db.GetOrderTracker(res.ClientOrderID)
	if tr == nil {
		t.Fatal("the intent must be on disk before the order goes out")
	}
	pending, err := db.ListPendingTrackers()
	if err != nil || len(pending) != 1 {
		t.Fatalf("the intent must count as in flight: %+v %v", pending, err)
	}

	e2 := New(db, e.Quotes)
	e2.AttachBroker("webull", br)
	e2.Telegram = &MemoryTelegram{}
	e2.ChatID = "c"
	e2.Now = e.Now
	e2.Sleep = func(time.Duration) {}
	e2.ResumeTrackers()

	rows, err := db.ListPositions()
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || fmt.Sprint(rows[0].Symbol) != "AAPL" || fmt.Sprint(rows[0].Status) != "open" {
		t.Fatalf("the recovered order must be journaled: %+v", rows)
	}
}

// Заявка, которую брокер так и не получил, не должна оставаться висящим
// намерением и блокировать следующий вход.
func TestFailedPlacementLeavesNoPendingIntent(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	br := &MemoryBroker{Name: "webull"}
	br.SetFailPlace("webull: 500", 0, false)
	e := New(db, &MemoryQuotes{})
	e.AttachBroker("webull", br)
	e.Telegram = &MemoryTelegram{}
	e.ChatID = "c"
	e.Now = nearCloseNow()
	e.Sleep = func(time.Duration) {}

	meta := orderMeta{Symbol: "AAPL", Action: "entry", Quantity: 5, Broker: "webull", DateKey: "2026-09-01"}
	res, _ := e.placeMarket(backgroundWindow(), "AAPL", "BUY", 5, PlaceMarketCfg{}, br, meta)
	if res.Submitted {
		t.Fatalf("placement must fail here: %+v", res)
	}
	pending, err := db.ListPendingTrackers()
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 0 {
		t.Fatalf("an order the broker never took must not stay pending: %+v", pending)
	}
}
