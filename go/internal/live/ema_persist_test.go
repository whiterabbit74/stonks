package live

import (
	"fmt"
	"strings"
	"testing"

	"mktorder.com/go/internal/types"
)

func TestPersistEmaAfterSendLogsOnDBFailure(t *testing.T) {
	db, e, _ := testEngine(t, nil)
	id, err := db.UpsertEMAAlert(map[string]any{
		"id": "ema-persist-1", "symbol": "TQQQ", "emaPeriod": 20,
		"buyLevelPct": 15, "sellLevelPct": 40, "nextAction": "buy",
		"thresholdPct": 0.5, "levelPct": 15, "direction": "below",
	})
	if err != nil {
		t.Fatalf("upsert ema alert: %v", err)
	}

	if _, err := db.SQL.Exec(`
            CREATE TRIGGER IF NOT EXISTS telegram_ema_alerts_block_update
            BEFORE UPDATE ON telegram_ema_alerts
            BEGIN
                SELECT RAISE(ABORT, 'injected ema persist failure');
            END;
        `); err != nil {
		t.Fatalf("block telegram_ema_alerts updates: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.SQL.Exec(`DROP TRIGGER IF EXISTS telegram_ema_alerts_block_update`)
	})

	e.persistEmaAfterSend([]EmaEval{{
		ID: id, DataOK: true, Reached: true, Action: "buy", DeviationPct: -20,
	}}, "confirmations")

	logs, err := db.ListAutotradeLogs(50)
	if err != nil {
		t.Fatal(err)
	}
	for _, l := range logs {
		if strings.Contains(fmt.Sprint(l["message"]), "ema_persist_failed") {
			return
		}
	}
	t.Fatalf("want autotrade log containing ema_persist_failed, got %+v", logs)
}

// AUD-172: a new alert has no stored info side, a crossing is computed only
// against a stored side, and the side was stored only on a crossing — the
// info level of a new alert never fired.
func TestNewEMAAlertStartsTrackingInfoSide(t *testing.T) {
	var bars []types.OHLC
	for i := 1; i <= 24; i++ {
		bars = append(bars, types.OHLC{Date: fmt.Sprintf("2026-08-%02d", i), Open: 100, High: 101, Low: 99, Close: 100, Volume: 1})
	}
	db, e, _ := testEngine(t, bars)
	if _, err := db.UpsertEMAAlert(map[string]any{
		"id": "ema-info", "symbol": "AAPL", "emaPeriod": 20, "buyLevelPct": -50, "sellLevelPct": 40,
		"nextAction": "buy", "thresholdPct": 0.5, "infoLevelPct": -20,
	}); err != nil {
		t.Fatal(err)
	}
	eval := func(price float64) EmaEval {
		t.Helper()
		e.Quotes = &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": {{Date: "2026-09-01", Open: 100, High: 103, Low: price, Close: price, Volume: 1}}}}
		e.mu.Lock()
		e.quoteCache = nil
		e.mu.Unlock()
		alerts, err := db.ListEMAAlerts()
		if err != nil || len(alerts) != 1 {
			t.Fatalf("alerts %v err %v", alerts, err)
		}
		ev := e.evalEMAAlert(alerts[0], []string{"finnhub"}, "2026-09-01")
		if !ev.DataOK {
			t.Fatalf("no data: %+v", ev)
		}
		e.persistEmaAfterSend([]EmaEval{ev}, "overview")
		return ev
	}
	if ev := eval(101); ev.InfoCrossing != "" || ev.InfoSide != "above" {
		t.Fatalf("first reading: %+v", ev)
	}
	alerts, _ := db.ListEMAAlerts()
	if side := alerts[0].InfoLastSide; side == nil || *side != "above" {
		t.Fatalf("first side not stored: %v", side)
	}
	if ev := eval(70); ev.InfoCrossing != "down" {
		t.Fatalf("drop below the info level is not a crossing: %+v", ev)
	}
}
