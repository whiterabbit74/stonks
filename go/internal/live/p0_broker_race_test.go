package live

import (
	"fmt"
	"sync"
	"testing"

	"mktorder.com/go/internal/types"
)

func TestBrokerAttachDetachRaceWithPollAndExecute(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	rh := &MemoryBroker{}
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "allowExits": true,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})
	e.AttachBroker("webull", br)
	e.AttachBroker("robinhood", rh)

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		for i := 0; i < 1000; i++ {
			e.AttachBroker("robinhood", rh)
			e.DetachBroker("robinhood")
			e.AttachBroker("robinhood", rh)
			_ = e.BrokerNamed("webull")
			_ = e.BrokerNamed("robinhood")
		}
	}()
	go func() {
		defer wg.Done()
		for i := 0; i < 1000; i++ {
			e.PollTrackers()
			_ = e.Execute("t1")
		}
	}()
	wg.Wait()
}

func TestExecuteAllKeepsEvaluateOnFixedBroker(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, webull := testEngine(t, bars)
	webull.Name = "webull"
	rh := &MemoryBroker{Name: "robinhood"}
	rh.Pos = []any{map[string]any{"symbol": "MSFT", "quantity": 3.0, "market_value": 300.0}}
	e.AttachBroker("webull", webull)
	e.AttachBroker("robinhood", rh)
	e.Broker = webull
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "allowExits": true,
		"brokers": map[string]any{
			"webull":    map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
			"robinhood": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})

	var mu sync.Mutex
	var evalReasons []string
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 200; i++ {
			ev := e.Evaluate()
			mu.Lock()
			evalReasons = append(evalReasons, fmt.Sprint(ev.Decision["reason"]))
			mu.Unlock()
		}
	}()
	for i := 0; i < 50; i++ {
		_ = e.Execute("t1")
	}
	wg.Wait()

	for _, o := range webull.Orders {
		if o.Symbol != "AAPL" && o.Symbol != "" {
			t.Fatalf("webull placed unexpected %+v", o)
		}
	}
	for _, o := range rh.Orders {
		if o.Symbol != "AAPL" && o.Symbol != "" {
			t.Fatalf("robinhood placed unexpected %+v", o)
		}
	}
	for _, r := range evalReasons {
		if r == "broker_position_exists" {
			t.Fatalf("Evaluate observed robinhood books via swapped e.Broker: %v", evalReasons)
		}
	}
	if e.Broker != webull {
		t.Fatal("executeAll must not leave e.Broker pointing at another broker")
	}
}
