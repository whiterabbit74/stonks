package live

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/store"
)

// AUD-017 (docs/audits/REGISTRY.md): runT1Orders keyed the post-exit
// orchestration off ev.Decision — the showcase evaluation EvaluateWindow makes
// on the webull book. With the position on Robinhood the showcase says "none",
// so the exit that really went out was never waited on and the re-entry rule
// "hold until fully closed" was decided on the wrong broker's book.
func TestT1WaitsForTheExitOfTheBrokerThatActuallyExited(t *testing.T) {
	e, webull, rh := dualBrokerEngine(t, exitBars)
	e.Sleep = func(time.Duration) {}
	holdAAPL(rh, 3)
	journalAAPL(t, e, "trade-rh", "robinhood", 3)

	exitRes, _, waitFill := e.runT1Orders(backgroundWindow(), "2026-09-01")

	if got := fmt.Sprint(exitRes.BrokerDecisions["robinhood"]["action"]); got != "exit" {
		t.Fatalf("robinhood must decide exit: %+v", exitRes.BrokerDecisions)
	}
	if len(rh.Orders) != 1 || rh.Orders[0].Side != "SELL" {
		t.Fatalf("robinhood exit not submitted: %+v", rh.Orders)
	}
	if len(webull.Orders) != 0 {
		t.Fatalf("webull holds nothing and must stay out: %+v", webull.Orders)
	}
	if !waitFill {
		t.Fatalf("the unfilled exit must block the re-entry; showcase decision was %+v", exitRes.Decision)
	}
}

// The same showcase decision fed the T-1 report: an exit executed on Robinhood
// while the webull book was flat printed no order line at all.
func TestT1TextReportsTheBrokerDecisionNotTheShowcase(t *testing.T) {
	db, err := store.Open(t.TempDir() + "/t.db")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := New(db, &MemoryQuotes{})
	res := EvalResult{
		Decision: map[string]any{"action": "none", "reason": "no_signal"},
		Quotes:   []map[string]any{{"symbol": "AAPL", "currentPrice": 11.9}},
		Broker:   map[string]any{"robinhood": map[string]any{"submitted": true, "quantity": 3.0}},
		BrokerDecisions: map[string]map[string]any{
			"webull":    {"action": "none", "reason": "no_signal"},
			"robinhood": {"action": "exit", "symbol": "AAPL", "candidate": map[string]any{"ibs": 0.97}},
		},
	}
	text := e.buildT1Text(1, nil, nil, false, false, res, EvalResult{}, nil)
	if !strings.Contains(text, "Закрываем AAPL") {
		t.Fatalf("the executed exit must be in the report:\n%s", text)
	}
	if !strings.Contains(text, "SELL MARKET отправлен") {
		t.Fatalf("want the submission line:\n%s", text)
	}
}
