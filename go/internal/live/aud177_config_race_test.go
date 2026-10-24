package live

import (
	"path/filepath"
	"sync"
	"testing"

	"mktorder.com/go/internal/store"
)

// AUD-177: a threshold edit read autoTrading before the operator switched
// trading off and wrote the whole object back, enabled=true included.
func TestThresholdEditDoesNotReenableTrading(t *testing.T) {
	for round := 0; round < 20; round++ {
		db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
		if err != nil {
			t.Fatal(err)
		}
		e := New(db, &MemoryQuotes{})
		if _, err := e.PatchAutoConfigChecked(map[string]any{"enabled": true}); err != nil {
			t.Fatal(err)
		}
		var wg sync.WaitGroup
		for i := 0; i < 8; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				if _, err := e.PatchAutoConfigChecked(map[string]any{"lowIBS": 0.05 + float64(i)/100}); err != nil {
					t.Error(err)
				}
			}(i)
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := e.PatchAutoConfigChecked(map[string]any{"enabled": false}); err != nil {
				t.Error(err)
			}
		}()
		wg.Wait()
		if on, _ := e.AutoConfig()["enabled"].(bool); on {
			t.Fatalf("round %d: trading switched back on by a concurrent threshold edit", round)
		}
		db.Close()
	}
}

// The same lost update on the per-broker persist blocks: a block set for one
// broker while another's was cleared must survive.
func TestPersistBlockSurvivesConcurrentClear(t *testing.T) {
	for round := 0; round < 20; round++ {
		db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
		if err != nil {
			t.Fatal(err)
		}
		e := New(db, &MemoryQuotes{})
		if err := e.persistTrackerBlock("robinhood"); err != nil {
			t.Fatal(err)
		}
		var wg sync.WaitGroup
		wg.Add(2)
		go func() { defer wg.Done(); _ = e.persistTrackerBlock("webull") }()
		go func() { defer wg.Done(); _ = e.ClearTrackerPersistBlock("robinhood", "checked") }()
		wg.Wait()
		e.mu.Lock()
		e.trackerPersistFail = nil // read the stored state only
		e.mu.Unlock()
		if !e.trackerPersistBlocked("webull") {
			t.Fatalf("round %d: webull block lost to the concurrent robinhood clear", round)
		}
		if e.trackerPersistBlocked("robinhood") {
			t.Fatalf("round %d: robinhood block restored after its clear", round)
		}
		db.Close()
	}
}
