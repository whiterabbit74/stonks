package live

import (
	"testing"
	"time"
)

// AUD-017: the exit was keyed off one broker's book, so a position held only
// at Robinhood was decided on the empty Webull book. Now the monitoring
// decides on its own position, and each broker clears what is in its own book:
// Robinhood sells, Webull — holding nothing — sends nothing.
func TestMonitorExitClearsOnlyTheBrokerThatHolds(t *testing.T) {
	e, webull, rh := dualBrokerEngine(t, exitBars)
	e.Sleep = func(time.Duration) {}
	holdAAPL(rh, 3)
	journalAAPL(t, e, "trade-rh", "robinhood", 3)

	res := e.Execute("telegram_t1")

	if res.Monitor.Exit == nil || res.Monitor.Exit.Symbol != "AAPL" {
		t.Fatalf("the monitoring must exit AAPL: %+v", res.Monitor)
	}
	if len(rh.Orders) != 1 || rh.Orders[0].Side != "SELL" || rh.Orders[0].Quantity != 3 {
		t.Fatalf("robinhood must sell what it holds: %+v", rh.Orders)
	}
	if len(webull.Orders) != 0 {
		t.Fatalf("webull holds nothing and must stay out: %+v", webull.Orders)
	}
}
