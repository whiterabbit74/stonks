package live

import (
	"database/sql"
	"fmt"
	"strings"
	"testing"
)

func seedOrderMeta(e *Engine, id string, meta orderMeta) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.orderMeta == nil {
		e.orderMeta = map[string]orderMeta{}
	}
	e.orderMeta[id] = meta
}

func telegramBody(t *testing.T, e *Engine) string {
	t.Helper()
	tg, ok := e.Telegram.(*MemoryTelegram)
	if !ok || tg == nil {
		t.Fatal("engine telegram is not MemoryTelegram")
	}
	var b strings.Builder
	for _, m := range tg.Sent() {
		b.WriteString(m[1])
		b.WriteByte('\n')
	}
	return b.String()
}

// AU-P0-1: fill alerts must name the tracker broker, not hardcode Webull.
func TestFillMessagesUseTrackerBroker(t *testing.T) {
	t.Run("partial_from_meta", func(t *testing.T) {
		_, e, _ := testEngine(t, nil)
		id := "rh-partial"
		seedOrderMeta(e, id, orderMeta{
			Action: "entry", Symbol: "AAPL", Quantity: 10,
			Broker: "robinhood", DateKey: "2026-09-01",
		})
		e.recordFill(map[string]any{
			"clientOrderId": id, "symbol": "AAPL", "action": "entry",
			"quantity": 10.0, "dateKey": "2026-09-01", "broker": "robinhood",
		}, map[string]any{"status": "filled", "filled_qty": 4.0, "avg_price": 8.2}, "filled")
		body := telegramBody(t, e)
		if !strings.Contains(body, "Robinhood: частичное исполнение") {
			t.Fatalf("partial fill must name Robinhood, got %q", body)
		}
		if strings.Contains(body, "Webull") {
			t.Fatalf("partial fill must not say Webull when broker=robinhood, got %q", body)
		}
	})
	t.Run("partial_from_tracker_row", func(t *testing.T) {
		_, e, _ := testEngine(t, nil)
		id := "rh-partial-row"
		seedOrderMeta(e, id, orderMeta{
			Action: "entry", Symbol: "AAPL", Quantity: 10, DateKey: "2026-09-01",
		})
		e.recordFill(map[string]any{
			"clientOrderId": id, "symbol": "AAPL", "action": "entry",
			"quantity": 10.0, "dateKey": "2026-09-01", "broker": "robinhood",
		}, map[string]any{"status": "filled", "filled_qty": 4.0, "avg_price": 8.2}, "filled")
		body := telegramBody(t, e)
		if !strings.Contains(body, "Robinhood: частичное исполнение") {
			t.Fatalf("tracker t[broker] must name Robinhood, got %q", body)
		}
		if strings.Contains(body, "Webull") {
			t.Fatalf("tracker t[broker] must not say Webull, got %q", body)
		}
	})
	t.Run("slippage", func(t *testing.T) {
		_, e, _ := testEngine(t, nil)
		e.PatchAutoConfig(map[string]any{"maxSlippageBps": 25})
		id := "rh-slip"
		seedOrderMeta(e, id, orderMeta{
			Action: "entry", Symbol: "AAPL", Quantity: 1,
			Broker: "robinhood", QuotePrice: 8.2, DateKey: "2026-09-01",
		})
		e.recordFill(map[string]any{
			"clientOrderId": id, "symbol": "AAPL", "action": "entry",
			"quantity": 1.0, "dateKey": "2026-09-01", "broker": "robinhood",
		}, map[string]any{"status": "filled", "filled_qty": 1.0, "avg_price": 9.0}, "filled")
		body := telegramBody(t, e)
		if !strings.Contains(body, "Robinhood: проскальзывание") {
			t.Fatalf("slippage must name Robinhood, got %q", body)
		}
		if strings.Contains(body, "Webull") {
			t.Fatalf("slippage must not say Webull when broker=robinhood, got %q", body)
		}
	})
}

func assertEntryPriceSQLNull(t *testing.T, e *Engine, table, id string) {
	t.Helper()
	var p sql.NullFloat64
	if err := e.DB.SQL.QueryRow(`SELECT entry_price FROM `+table+` WHERE id=?`, id).Scan(&p); err != nil {
		t.Fatalf("scan %s.%s entry_price: %v", table, id, err)
	}
	if p.Valid {
		t.Fatalf("%s.%s entry_price must be SQL NULL, got %v", table, id, p.Float64)
	}
}

// AU-P1-3: a fill without a price must not journal 0 as if it were real.
func TestUnconfirmedFillPriceIsNullNotZero(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	id := "oid-noprice-null"
	seedOrderMeta(e, id, orderMeta{
		Action: "entry", Symbol: "AAPL", Quantity: 2,
		QuotePrice: 8.2, DateKey: "2026-09-01", Broker: "robinhood",
	})
	e.recordFill(map[string]any{
		"clientOrderId": id, "symbol": "AAPL", "action": "entry",
		"quantity": 2.0, "dateKey": "2026-09-01", "broker": "robinhood",
	}, map[string]any{"status": "filled", "filled_qty": 2.0}, "filled")

	row, _ := e.DB.GetTrade("broker_trades", id)
	if row == nil {
		t.Fatal("unconfirmed fill must still open a journal row")
	}
	if row["entryPrice"] != nil {
		t.Fatalf("entryPrice must be JSON/SQL null, not 0: %+v", row["entryPrice"])
	}
	assertEntryPriceSQLNull(t, e, "broker_trades", id)
	assertEntryPriceSQLNull(t, e, "trades", "m-"+id)
	notes := fmt.Sprint(row["notes"])
	if !strings.Contains(notes, "fill_price_unconfirmed") {
		t.Fatalf("need a mark so UI can badge an unconfirmed price, notes=%q", notes)
	}

	closed, err := e.DB.CloseTradeByID("broker_trades", id, 10.0, "2026-09-02", nil)
	if err != nil {
		t.Fatalf("close: %v", err)
	}
	if closed["pnlAbsolute"] != nil || closed["pnlPercent"] != nil {
		t.Fatalf("PnL must not treat a missing fill as 0: %+v", closed)
	}
}

// AU-P2-1: journal UPDATE errors must be logged and must block further entries.
func TestJournalSQLUpdateErrorBlocksEntry(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	if _, err := e.DB.SQL.Exec(`CREATE TRIGGER fail_bt_update BEFORE UPDATE ON broker_trades BEGIN SELECT RAISE(ABORT, 'injected update failure'); END`); err != nil {
		t.Fatalf("inject update failure: %v", err)
	}
	id := "oid-sqlfail"
	seedOrderMeta(e, id, orderMeta{
		Action: "entry", Symbol: "MSFT", Quantity: 1,
		Broker: "webull", DateKey: "2026-09-01",
	})
	e.recordFill(map[string]any{
		"clientOrderId": id, "symbol": "MSFT", "action": "entry",
		"quantity": 1.0, "dateKey": "2026-09-01", "broker": "webull",
	}, map[string]any{"status": "filled", "filled_qty": 1.0, "avg_price": 8.2}, "filled")

	if !e.trackerPersistBlocked("webull") {
		t.Fatal("SQL update error on the journal must raise the tracker persist block")
	}
	logs, err := e.DB.ListAutotradeLogs(50)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, l := range logs {
		msg := fmt.Sprint(l["message"])
		if strings.Contains(msg, "injected update failure") {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("SQL error must be logged, logs=%v", logs)
	}
}
