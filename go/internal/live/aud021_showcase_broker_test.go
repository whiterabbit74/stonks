package live

import (
	"fmt"
	"testing"
)

// AUD-021 (docs/audits/REGISTRY.md): the showcase Decision Evaluate() shows in
// the UI was computed on the webull book no matter which brokers were
// attached. With Robinhood the only broker, its open position was invisible
// and the tile said "no signal" while the position was there.
func TestShowcaseDecisionFollowsTheOnlyAttachedBroker(t *testing.T) {
	e, _, rh := dualBrokerEngine(t, exitBars)
	e.DetachBroker("webull")
	holdAAPL(rh, 3)
	journalAAPL(t, e, "trade-rh", "robinhood", 3)

	ev := e.Evaluate()

	if ev.DecisionBroker != "robinhood" {
		t.Fatalf("the showcase decision must name the broker it was computed on, got %q", ev.DecisionBroker)
	}
	if ev.OpenTrade == nil || fmt.Sprint(ev.OpenTrade["symbol"]) != "AAPL" {
		t.Fatalf("the Robinhood position must be the showcase open trade: %+v", ev.OpenTrade)
	}
	if got := fmt.Sprint(ev.Decision["action"]); got != "exit" {
		t.Fatalf("want exit on the held Robinhood position, got %+v", ev.Decision)
	}
}

// With both brokers enabled the showcase stays webull — the label just makes
// that explicit for the UI.
func TestShowcaseDecisionStaysWebullWhenBothAreEnabled(t *testing.T) {
	e, webull, _ := dualBrokerEngine(t, exitBars)
	holdAAPL(webull, 3)
	journalAAPL(t, e, "trade-w", "webull", 3)

	ev := e.Evaluate()

	if ev.DecisionBroker != "webull" {
		t.Fatalf("webull is first in snapshot order, got %q", ev.DecisionBroker)
	}
	if got := fmt.Sprint(ev.Decision["action"]); got != "exit" {
		t.Fatalf("want exit on the held webull position, got %+v", ev.Decision)
	}
}
