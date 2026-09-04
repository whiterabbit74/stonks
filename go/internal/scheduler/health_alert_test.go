package scheduler

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/live"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

func TestBrokerHealthAlertsOnNeedsReauthOnce(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	tg := &live.MemoryTelegram{}
	eng := live.New(db, nil)
	eng.Telegram = tg
	eng.ChatID = "c"
	eng.Broker = &live.MemoryBroker{}
	_ = db.SaveWebullToken("tok", time.Now().Add(-time.Hour).Format(time.RFC3339), "EXPIRED")
	now := time.Date(2026, 9, 1, 15, 0, 0, 0, time.UTC)
	today := tradingdate.TodayNYSE(now)
	RunBrokerHealth(db, Deps{Live: eng}, today, now)
	n := 0
	for _, m := range tg.Sent() {
		if strings.Contains(m[1], "переавторизация") || strings.Contains(m[1], "истекает") {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("want 1 alert, got %d %+v", n, tg.Sent())
	}
	tg.Reset()
	RunBrokerHealth(db, Deps{Live: eng}, today, now)
	for _, m := range tg.Sent() {
		if strings.Contains(m[1], "переавторизация") || strings.Contains(m[1], "истекает") {
			t.Fatalf("repeat same day: %+v", tg.Sent())
		}
	}
}
