package live

import (
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
