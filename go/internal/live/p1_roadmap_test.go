package live

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"mktorder.com/go/internal/types"
)

func TestOrderLandedRejectsForeignID(t *testing.T) {
	_, e, br := testEngine(t, nil)
	br.SetDetail("ours", map[string]any{"status": "FILLED", "client_order_id": "other"})
	landed, qf, _ := e.orderLanded(backgroundWindow(), "ours", br)
	if landed || qf {
		t.Fatalf("foreign id must not count as landed: landed=%v queryFailed=%v", landed, qf)
	}
	br.SetDetail("ours", map[string]any{"status": "FILLED", "client_order_id": "ours"})
	landed, qf, _ = e.orderLanded(backgroundWindow(), "ours", br)
	if !landed || qf {
		t.Fatal("matching id must land")
	}
}

func TestTrackerSaveFailureBlocksEntry(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	blockOrderTrackerInserts(t, e)
	res := e.Execute("t1")
	unblockOrderTrackerInserts(t, e)
	if !res.Executed {
		t.Fatalf("order still reaches the broker: %+v", res.Broker)
	}
	if len(br.Orders) != 1 {
		t.Fatalf("want 1 order, got %d", len(br.Orders))
	}
	res2 := e.Execute("t1")
	if res2.Executed || len(br.Orders) != 1 {
		t.Fatalf("persist failure must block a second entry: executed=%v orders=%d", res2.Executed, len(br.Orders))
	}
}

func TestActualizeRespectsSettingAndDailyGuard(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, _ := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	st := db.Settings()
	st["enablePostClosePriceActualization"] = false
	_ = db.SaveSettings(st)
	res := e.Actualize(false)
	if res.Reason != "disabled_by_settings" {
		t.Fatalf("disabled: %+v", res)
	}
	st["enablePostClosePriceActualization"] = true
	_ = db.SaveSettings(st)
	if r := e.Actualize(false); !r.Updated {
		t.Fatalf("first run %+v", r)
	}
	if r := e.Actualize(false); r.Reason != "already_ran_today" {
		t.Fatalf("second run %+v", r)
	}
}

func TestOpenOrdersErrorBlocksEntry(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, br := testEngine(t, bars)
	e.Sleep = func(time.Duration) {}
	br.FailOpenOrders = errors.New("timeout")
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	res := e.Execute("t1")
	if res.Executed || len(br.Orders) != 0 {
		t.Fatalf("OpenOrders error must block entry: %+v orders=%d", res.Broker, len(br.Orders))
	}
}

func TestJournalReadErrorBlocksEvaluate(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, _ := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	db.Close()
	ev := e.Evaluate()
	if fmt.Sprint(ev.Decision["reason"]) != "journal_unavailable" {
		t.Fatalf("Evaluate %+v", ev.Decision)
	}
	snap := e.Consistency()
	if BlockingMismatch(snap) == nil {
		t.Fatalf("Consistency must block: %+v", snap)
	}
}

func TestCanSubmitFalseWhenNeedsReauth(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	e.PatchAutoConfig(map[string]any{"enabled": true})
	_ = e.DB.SaveWebullToken("tok", "2099-01-01", HealthNeedsReauth)
	if e.CanSubmit() {
		t.Fatal("NEEDS_REAUTH must not report running")
	}
}

func TestExecuteReportsSubmittedPhase(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	_, e, _ := testEngine(t, bars)
	e.PatchAutoConfig(map[string]any{"enabled": true, "lowIBS": 0.9, "highIBS": 1, "allowNewEntries": true})
	res := e.Execute("t1")
	if !res.Submitted || res.Phase != "submitted" {
		t.Fatalf("phase %+v submitted=%v", res.Phase, res.Submitted)
	}
}

func TestUnconfirmedFillPriceDoesNotUseQuote(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	id := "oid-noprice"
	e.mu.Lock()
	if e.orderMeta == nil {
		e.orderMeta = map[string]orderMeta{}
	}
	e.orderMeta[id] = orderMeta{Action: "entry", Symbol: "AAPL", Quantity: 1, QuotePrice: 8.2, DateKey: "2026-09-01", Broker: "webull"}
	e.mu.Unlock()
	e.recordFill(map[string]any{
		"clientOrderId": id, "symbol": "AAPL", "action": "entry", "quantity": 1.0, "dateKey": "2026-09-01",
	}, map[string]any{"status": "filled", "filled_qty": 1.0}, "filled")
	row := e.DB.GetTrade("broker_trades", id)
	if asFloat(row["entryPrice"]) == 8.2 {
		t.Fatalf("must not invent fill price from quote: %+v", row)
	}
}

func TestPartialEntryUpsertsQuantity(t *testing.T) {
	bars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1}}
	db, e, _ := testEngine(t, bars)
	id := "oid-partial"
	e.mu.Lock()
	if e.orderMeta == nil {
		e.orderMeta = map[string]orderMeta{}
	}
	e.orderMeta[id] = orderMeta{Action: "entry", Symbol: "AAPL", Quantity: 10, Broker: "webull", DateKey: "2026-09-01"}
	e.mu.Unlock()
	e.recordFill(map[string]any{
		"clientOrderId": id, "symbol": "AAPL", "action": "entry", "quantity": 10.0, "dateKey": "2026-09-01",
	}, map[string]any{"status": "filled", "filled_qty": 5.0, "avg_price": 8.2}, "filled")
	row := db.GetTrade("broker_trades", id)
	if asFloat(row["quantity"]) != 5 {
		t.Fatalf("first partial %+v", row)
	}
	e.recordFill(map[string]any{
		"clientOrderId": id, "symbol": "AAPL", "action": "entry", "quantity": 10.0, "dateKey": "2026-09-01",
	}, map[string]any{"status": "filled", "filled_qty": 10.0, "avg_price": 8.2}, "filled")
	row = db.GetTrade("broker_trades", id)
	if asFloat(row["quantity"]) != 10 {
		t.Fatalf("upsert %+v", row)
	}
}
