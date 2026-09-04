package live

import (
	"errors"
	"testing"
	"time"

	"mktorder.com/go/internal/types"
)

func t1Opts() AggregateOpts {
	return AggregateOpts{ForceSend: false, UpdateState: true}
}

func TestT1LeaseExpiresAllowsRetryExecute(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})
	today := "2026-09-01"
	prev := T1LeaseTTL
	T1LeaseTTL = time.Second
	t.Cleanup(func() { T1LeaseTTL = prev })
	att, err := db.BeginT1Attempt(e.ChatID, today, e.now(), T1LeaseTTL)
	if err != nil || att.Skip {
		t.Fatalf("lease %+v %v", att, err)
	}
	later := e.now().Add(2 * time.Second)
	e.Now = func() time.Time { return later }
	res, err := e.Aggregate(1, t1Opts())
	if err != nil {
		t.Fatal(err)
	}
	if len(br.Orders) != 1 {
		t.Fatalf("expired lease without execution must retry Execute, orders=%d reason=%s", len(br.Orders), res.Reason)
	}
}

func TestT1ExecutionFinishedRetriesReportOnly(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	tg := e.Telegram.(*MemoryTelegram)
	tg.Fail = errors.New("telegram down")
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})
	_, err := e.Aggregate(1, t1Opts())
	if err == nil {
		t.Fatal("want telegram error")
	}
	if len(br.Orders) != 1 {
		t.Fatalf("first run should place, got %d", len(br.Orders))
	}
	if db.T1ExecutionFinished(e.ChatID, "2026-09-01") == false {
		t.Fatal("execution must be marked finished even if the report fails")
	}
	t11, t1 := db.AggregateState(e.ChatID, "2026-09-01")
	if t1 {
		t.Fatalf("report must not be marked sent, t11=%v t1=%v", t11, t1)
	}
	tg.Fail = nil
	tg.FailN = 0
	res, err := e.Aggregate(1, t1Opts())
	if err != nil {
		t.Fatal(err)
	}
	if len(br.Orders) != 1 {
		t.Fatalf("report retry must not Execute again, orders=%d", len(br.Orders))
	}
	if !res.Sent {
		t.Fatalf("report retry should send: %+v", res)
	}
	_, t1 = db.AggregateState(e.ChatID, "2026-09-01")
	if !t1 {
		t.Fatal("report_sent not marked")
	}
}

func TestT1PendingTrackerSkipsSecondExecute(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	br.ListingLag = true
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})
	if _, err := e.Aggregate(1, t1Opts()); err != nil {
		t.Fatal(err)
	}
	if len(br.Orders) != 1 {
		t.Fatalf("first %d", len(br.Orders))
	}
	if _, err := db.SQL.Exec(`UPDATE aggregate_send_state SET t1_sent=0, t1_execution_finished=0, t1_lease_until='' WHERE chat_id=?`, e.ChatID); err != nil {
		t.Fatal(err)
	}
	res, err := e.Aggregate(1, t1Opts())
	if err != nil {
		t.Fatal(err)
	}
	if len(br.Orders) != 1 {
		t.Fatalf("pending tracker after crash must not place again: %+v reason=%s", br.Orders, res.Reason)
	}
}

func TestT1RetryReconcilesOpenOrders(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})
	if _, err := e.Aggregate(1, t1Opts()); err != nil {
		t.Fatal(err)
	}
	if len(br.Orders) != 1 {
		t.Fatalf("first %d", len(br.Orders))
	}
	if _, err := db.SQL.Exec(`DELETE FROM order_trackers`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.SQL.Exec(`UPDATE aggregate_send_state SET t1_sent=0, t1_execution_finished=0, t1_lease_until='' WHERE chat_id=?`, e.ChatID); err != nil {
		t.Fatal(err)
	}
	res, err := e.Aggregate(1, t1Opts())
	if err != nil {
		t.Fatal(err)
	}
	if len(br.Orders) != 1 {
		t.Fatalf("OpenOrders reconcile must not place again: %+v reason=%s", br.Orders, res.Reason)
	}
}

func TestTrackerSaveFailureSurvivesRestart(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})
	if _, err := db.SQL.Exec(`DROP TABLE order_trackers`); err != nil {
		t.Fatal(err)
	}
	res := e.Execute("t1")
	if !res.Executed || len(br.Orders) != 1 {
		t.Fatalf("first place %+v orders=%d", res.Broker, len(br.Orders))
	}
	br.Open = []any{}
	e2 := New(db, e.Quotes)
	e2.Broker = br
	e2.Telegram = e.Telegram
	e2.ChatID = e.ChatID
	e2.Now = e.Now
	e2.Sleep = func(time.Duration) {}
	e2.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "allowNewEntries": true})
	res2 := e2.Execute("t1")
	if res2.Executed || len(br.Orders) != 1 {
		t.Fatalf("persisted tracker block must survive restart: executed=%v orders=%d", res2.Executed, len(br.Orders))
	}
}

func TestT1ParallelLeaseSingleExecute(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, _ := testEngine(t, bars)
	today := "2026-09-01"
	a, err := db.BeginT1Attempt(e.ChatID, today, e.now(), time.Minute)
	if err != nil || a.Skip {
		t.Fatalf("first %+v %v", a, err)
	}
	b, err := db.BeginT1Attempt(e.ChatID, today, e.now(), time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if !b.Skip || b.Reason != "lease_held" {
		t.Fatalf("second must be lease_held, got %+v", b)
	}
}
