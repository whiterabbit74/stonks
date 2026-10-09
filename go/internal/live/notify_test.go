package live

import (
	"errors"
	"fmt"
	"mktorder.com/go/internal/store"
	"strings"
	"testing"
)

func autotradeLogText(t *testing.T, e *Engine) string {
	t.Helper()
	logs, err := e.DB.ListAutotradeLogs(200)
	if err != nil {
		t.Fatal(err)
	}
	var b strings.Builder
	for _, l := range logs {
		b.WriteString(fmt.Sprint(l["message"]))
		b.WriteByte('\n')
	}
	return b.String()
}

// A refused alert used to disappear: every caller drops the error.
func TestFailedNotificationIsLogged(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	e.Telegram = &MemoryTelegram{Fail: errors.New("telegram down")}
	_ = e.Send(e.chat(), "<b>Robinhood: выход без открытой позиции</b>\nMSFT")
	logs := autotradeLogText(t, e)
	if !strings.Contains(logs, "event=notify_failed") || !strings.Contains(logs, "telegram down") ||
		!strings.Contains(logs, "выход без открытой позиции") {
		t.Fatalf("failed send must be logged with its error and first line, got:\n%s", logs)
	}
}

func TestTrackerNoticeText(t *testing.T) {
	exit := map[string]any{"symbol": "MSFT", "action": "exit", "quantity": 1.0, "broker": "robinhood", "source": "telegram_t1"}
	if got := trackerNoticeText(exit, map[string]any{"avg_price": 535.12, "filled_qty": 1.0}, "filled"); got != "<b>Robinhood</b>: продано 1 MSFT по $535.12" {
		t.Fatalf("T-1 exit fill: %q", got)
	}
	if got := trackerNoticeText(exit, nil, "filled"); got != "<b>Robinhood</b>: продано 1 MSFT — цена не подтверждена" {
		t.Fatalf("fill without a price must not print $0: %q", got)
	}
	test := map[string]any{"symbol": "AAPL", "action": "entry", "quantity": 3.0, "broker": "webull", "source": "test_buy"}
	if got := trackerNoticeText(test, nil, "rejected"); got != "<b>Webull</b>: заявка на покупку AAPL — отклонена\nисточник: test_buy" {
		t.Fatalf("non-T-1 source must be named: %q", got)
	}
}

// The day's MSFT exit: Robinhood fills first, Webull closes the position. The
// result goes out once, after the fill line that closed it.
func TestPositionCloseSendsResultAfterLastFill(t *testing.T) {
	e, _, _ := dualBrokerEngine(t, nil)
	tg := e.Telegram.(*MemoryTelegram)
	p := store.Position{ID: "msft", Symbol: "MSFT", Status: "open", EntryDate: "2026-10-06",
		EntryPrice: store.Ptr(529.5), Quantity: 4, Source: "telegram_t1"}
	p.SetLeg("webull", store.BrokerLeg{Qty: 3, EntryPrice: store.Ptr(529.48), EntryOrderID: "wb-in"})
	p.SetLeg("robinhood", store.BrokerLeg{Qty: 1, EntryPrice: store.Ptr(529.5), EntryOrderID: "rh-in"})
	if err := e.DB.SavePosition(p); err != nil {
		t.Fatal(err)
	}
	exit := func(id, broker string, qty, price float64) {
		tr := map[string]any{"clientOrderId": id, "symbol": "MSFT", "action": "exit", "quantity": qty,
			"source": "telegram_t1", "dateKey": "2026-10-09", "broker": broker, "status": "submitted"}
		if err := e.DB.SaveOrderTracker(tr); err != nil {
			t.Fatal(err)
		}
		e.finalizeTrackerStatus(tr, map[string]any{"status": "FILLED", "avg_price": price, "filled_qty": qty}, "filled")
	}
	exit("rh-out", "robinhood", 1, 535.12)
	if body := telegramBody(t, e); strings.Contains(body, "закрыта") {
		t.Fatalf("one broker out is not a closed position:\n%s", body)
	}
	exit("wb-out", "webull", 3, 535.14)

	sent := tg.Sent()
	if len(sent) != 3 {
		t.Fatalf("want two fills and one result, got %d:\n%s", len(sent), telegramBody(t, e))
	}
	if !strings.Contains(sent[1][1], "Webull</b>: продано 3 MSFT") {
		t.Fatalf("result must follow the fill that closed the position:\n%s", telegramBody(t, e))
	}
	result := sent[2][1]
	for _, want := range []string{"✅ MSFT закрыта: +$", "4 шт. · $529.50 → ", "3 дн.", "06.10.2026 → 09.10.2026",
		"Webull: $529.48 → $535.14", "Robinhood: $529.50 → $535.12"} {
		if !strings.Contains(result, want) {
			t.Fatalf("result lacks %q:\n%s", want, result)
		}
	}

	// The broker repeating its answer books nothing and reports nothing.
	exit("wb-out", "webull", 3, 535.14)
	if n := len(tg.Sent()); n != 3 {
		t.Fatalf("a replayed fill must not resend the result, got %d messages", n)
	}
}

func TestCloseNoticeLossAndUnknownPnL(t *testing.T) {
	loss := &store.Position{Symbol: "MSFT", Quantity: 4, EntryDate: "2026-09-04", ExitDate: "2026-09-10",
		EntryPrice: store.Ptr(499.6), ExitPrice: store.Ptr(492.49),
		PnLAbsolute: store.Ptr(-28.44), PnLPercent: store.Ptr(-1.423139), IsTest: true}
	if got := closeNoticeText(loss); !strings.HasPrefix(got, "<b>🔻 MSFT закрыта: −$28.44 (−1.42%)</b> · тест\n") {
		t.Fatalf("loss: %q", got)
	}
	unknown := &store.Position{Symbol: "AAPL", Quantity: 1, EntryDate: "2026-09-04", ExitDate: "2026-09-10"}
	if got := closeNoticeText(unknown); !strings.Contains(got, "PnL не посчитан") || !strings.Contains(got, "— → —") {
		t.Fatalf("unknown prices must not claim a P&L: %q", got)
	}
}
