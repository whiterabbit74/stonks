package scheduler

import (
	"path/filepath"
	"testing"

	"mktorder.com/go/internal/live"
	"mktorder.com/go/internal/store"
)

// AUD-110: кэш открытых позиций на строке наблюдения пересчитывался только по
// кнопке оператора. Задание после закрытия обязано синхронизировать его.
func TestPriceActualizationSyncsWatchOpenFlag(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.UpsertWatch(map[string]any{"symbol": "MSFT", "lowIBS": 0.10, "highIBS": 0.75}); err != nil {
		t.Fatal(err)
	}
	if err := db.SavePosition(store.Position{
		ID: "p", Symbol: "MSFT", Status: "open", EntryDate: "2026-09-01",
		EntryPrice: store.Ptr(400.0), Quantity: 3,
		Webull: store.BrokerLeg{Qty: 3, EntryPrice: store.Ptr(400.0)},
	}); err != nil {
		t.Fatal(err)
	}

	RunPriceActualization(db, Deps{Live: live.New(db, nil)})

	watches, err := db.ListWatches()
	if err != nil {
		t.Fatal(err)
	}
	for _, w := range watches {
		if store.SafeTicker(w["symbol"].(string)) != "MSFT" {
			continue
		}
		if open, _ := w["isOpenPosition"].(bool); !open {
			t.Fatalf("после закрытия наблюдение должно знать об открытой позиции: %+v", w)
		}
		return
	}
	t.Fatal("watch MSFT не найден")
}
