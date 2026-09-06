package live

import (
	"strings"
	"testing"
)

// AUD-023: Actualize builds its ticker list from the watchlist and the EMA
// alerts. An unreadable table used to read as "no tickers" — the daily bars
// were skipped under the guise of nothing to update.
func TestAUD023ActualizeFailsClosedOnUnreadableWatchlist(t *testing.T) {
	db, e, _ := testEngine(t, nil)
	if res := e.Actualize(true); res.Reason == "no_tickers" {
		t.Fatalf("seeded watchlist must yield tickers: %+v", res)
	}
	if _, err := db.SQL.Exec(`DROP TABLE telegram_watches`); err != nil {
		t.Fatal(err)
	}
	res := e.Actualize(true)
	if res.Reason != "watchlist_read_failed" || res.Success {
		t.Fatalf("unreadable watchlist must fail loudly: %+v", res)
	}
}

func TestAUD023ActualizeFailsClosedOnUnreadableEMAAlerts(t *testing.T) {
	db, e, _ := testEngine(t, nil)
	if _, err := db.SQL.Exec(`DROP TABLE telegram_ema_alerts`); err != nil {
		t.Fatal(err)
	}
	res := e.Actualize(true)
	if res.Reason != "ema_alerts_read_failed" || res.Success {
		t.Fatalf("unreadable ema alerts must fail loudly: %+v", res)
	}
}

// Same root cause: an unreadable ema_alerts table made EvaluateEMAAlerts
// answer "no alerts", which is what the T-11/T-1 send checks before skipping.
func TestAUD023EMAAlertsReadFailureIsNotEmpty(t *testing.T) {
	db, e, _ := testEngine(t, nil)
	if _, err := e.EvaluateEMAAlerts(); err != nil {
		t.Fatalf("healthy read: %v", err)
	}
	if _, err := db.SQL.Exec(`DROP TABLE telegram_ema_alerts`); err != nil {
		t.Fatal(err)
	}
	if _, err := e.EvaluateEMAAlerts(); err == nil {
		t.Fatal("unreadable ema alerts must not read as no alerts")
	}
}

// Same root cause in the messages: an unreadable trade journal used to print
// "Позиция: нет" and label every ticker FLAT.
func TestAUD023UnreadableJournalIsNotFlatInMessages(t *testing.T) {
	db, e, _ := testEngine(t, nil)
	if _, err := db.SQL.Exec(`DROP TABLE trades`); err != nil {
		t.Fatal(err)
	}
	rows := []t1Watch{{sym: "AAPL", eval: watchEval{ok: true, ibs: 0.5, price: 10}}}
	t1 := e.buildT1Text(1, rows, nil, false, false, EvalResult{}, EvalResult{}, nil)
	if !strings.Contains(t1, "Позиция: неизвестна") {
		t.Fatalf("T-1 must not claim a flat book on an unreadable journal:\n%s", t1)
	}
	t11 := e.buildT11Text(11, "2026-09-01", "finnhub", rows, nil, nil)
	if !strings.Contains(t11, "Журнал сделок недоступен") || strings.Contains(t11, "FLAT") {
		t.Fatalf("T-11 must not label tickers FLAT on an unreadable journal:\n%s", t11)
	}
}
