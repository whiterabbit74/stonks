package live

import (
	"fmt"
	"strings"
	"testing"

	"mktorder.com/go/internal/store"
)

// legBroker names the broker behind a row, for tests that used to read the
// `broker` column. A position says it through whichever leg executed; a tracker
// row still carries the column itself.
func legBroker(v any) string {
	switch row := v.(type) {
	case store.Position:
		if row.Robinhood.Executed() {
			return "robinhood"
		}
		if row.Webull.Executed() {
			return "webull"
		}
		return ""
	case *store.Position:
		if row == nil {
			return ""
		}
		return legBroker(*row)
	case map[string]any:
		got := strings.TrimSpace(fmt.Sprint(row["broker"]))
		if got == "<nil>" {
			return ""
		}
		return got
	}
	return ""
}

// pv dereferences an optional price for a test comparison. A nil price is a
// price nobody recorded, and reads as 0 here on purpose.
func pv(v *float64) float64 {
	if v == nil {
		return 0
	}
	return *v
}

// mustInsertBrokerTrade seeds a position executed by one broker. It keeps the
// name the two-table fixtures used, so the AUD scenarios read the same.
func mustInsertBrokerTrade(t *testing.T, e *Engine, id, symbol, broker, entryDate string, qty float64) {
	t.Helper()
	p := store.Position{
		ID: id, Symbol: symbol, Status: "open", EntryDate: entryDate,
		EntryPrice: store.Ptr[float64](10.0), Quantity: qty,
	}
	p.SetLeg(broker, store.BrokerLeg{Qty: qty, EntryPrice: store.Ptr[float64](10.0), EntryOrderID: id})
	if err := e.DB.SavePosition(p); err != nil {
		t.Fatal(err)
	}
}

// tradeIDs collects the ids of whatever position list a snapshot carries.
func tradeIDs(v any) map[string]bool {
	out := map[string]bool{}
	switch rows := v.(type) {
	case []store.Position:
		for _, row := range rows {
			out[row.ID] = true
		}
	case []map[string]any:
		for _, row := range rows {
			out[fmt.Sprint(row["id"])] = true
		}
	}
	return out
}
