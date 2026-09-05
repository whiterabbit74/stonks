package live

import (
	"fmt"
	"strings"
	"testing"
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
