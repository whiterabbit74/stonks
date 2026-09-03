package backtest

import (
	"testing"

	"mktorder.com/go/internal/goldens"
	"mktorder.com/go/internal/types"
)

func emaBar(date string, close float64) types.OHLC {
	return types.OHLC{Date: date, Open: close, High: close, Low: close, Close: close, Volume: 1000}
}

func TestEmaSellZoneClosesEarlierLotByID(t *testing.T) {
	got := RunEmaZone([]TickerIndexed{{Ticker: "TQQQ", Data: []types.OHLC{
		emaBar("2024-01-01", 100),
		emaBar("2024-01-02", 100),
		emaBar("2024-01-03", 100),
		emaBar("2024-01-04", 80),
		emaBar("2024-01-05", 130),
	}}}, EmaParams{
		InitialCapital: 10000, Leverage: 1, EmaPeriod: 3,
		BuyZones: []EmaZone{
			{ID: "buy-5", LevelPct: -5, Enabled: true},
			{ID: "buy-10", LevelPct: -10, Enabled: true},
		},
		SellZones:    []EmaZone{{ID: "sell-15", LevelPct: 15, Enabled: true}},
		SignalSource: "close", EmaStartMode: "full_history",
	})
	if len(got.Trades) != 2 {
		t.Fatalf("trades %d want 2 (stale sell-zone index?): %+v", len(got.Trades), got.Trades)
	}
	ids := map[string]bool{}
	for i, tr := range got.Trades {
		if tr.ExitReason != "ema_sell_15" {
			t.Errorf("trade[%d] reason %s want ema_sell_15", i, tr.ExitReason)
		}
		if tr.EntryDate != "2024-01-04" || tr.ExitDate != "2024-01-05" {
			t.Errorf("trade[%d] dates %s->%s", i, tr.EntryDate, tr.ExitDate)
		}
		if !goldens.MustAlmost(tr.Quantity, 62.5, 1e-12) {
			t.Errorf("trade[%d] qty %v want 62.5", i, tr.Quantity)
		}
		if tr.Context == nil || tr.Context.Ticker != "TQQQ" {
			t.Errorf("trade[%d] missing ticker context", i)
		}
		ids[tr.ID] = true
	}
	if len(ids) != 2 {
		t.Fatalf("expected two distinct trade ids, got %v", ids)
	}
	if !goldens.MustAlmost(got.FinalValue, 16250, 1e-9) {
		t.Fatalf("finalValue %v want 16250", got.FinalValue)
	}
	for _, tr := range got.Trades {
		if tr.ExitReason == "end_of_data" {
			t.Fatal("later lot was left open after sell-zone splice")
		}
	}
}
