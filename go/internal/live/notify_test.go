package live

import (
	"errors"
	"fmt"
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
