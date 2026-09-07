package backtest

import (
	"testing"

	"mktorder.com/go/internal/types"
)

// AUD-047: цена маржин-колла считалась без свободных денег, поэтому позиция с
// небольшим плечом ликвидировалась при кратном запасе капитала.
func TestSimulateMarginCountsFreeCashAgainstMaintenance(t *testing.T) {
	bars := []types.OHLC{
		{Date: "2026-01-01", Open: 100, High: 101, Low: 99, Close: 100},
		{Date: "2026-01-02", Open: 100, High: 100, Low: 60, Close: 70},
		{Date: "2026-01-03", Open: 70, High: 75, Low: 69, Close: 75},
	}
	usage := 10.0
	res := SimulateMargin(MarginParams{
		Market: bars, InitialCapital: 10000, Leverage: 2, CapitalUsagePct: &usage,
		Trades: []types.Trade{{ID: "t1", EntryDate: "2026-01-01", EntryPrice: 100, ExitDate: "2026-01-03", ExitPrice: 75}},
	})
	if len(res.MaintenanceLiquidationEvents) != 0 {
		t.Fatalf("free cash covers maintenance, got liquidation: %+v", res.MaintenanceLiquidationEvents)
	}
}
