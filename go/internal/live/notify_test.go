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
