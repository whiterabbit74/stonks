package live

import (
	"errors"
	"fmt"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
	"path/filepath"
	"strings"
	"testing"
	"time"
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

// exitReentryEngine is a T-1 day with an open AAPL to sell and MSFT to buy
// once it is sold, on one broker whose orders fill at once.
func exitReentryEngine(t *testing.T, telegram TelegramSender) *Engine {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	exitBars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 11.9, Volume: 1}}
	entryBars := []types.OHLC{{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.1, Volume: 1}}
	_ = db.SaveDataset("AAPL", "AAPL", "", "", exitBars, false)
	_ = db.SaveDataset("MSFT", "MSFT", "", "", entryBars, false)
	_ = db.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.10, "highIBS": 0.75})
	_ = db.UpsertWatch(map[string]any{"symbol": "MSFT", "lowIBS": 0.10, "highIBS": 0.75})
	wb := &MemoryBroker{Name: "webull"}
	e := New(db, &MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": exitBars, "MSFT": entryBars}})
	e.AttachBroker("webull", wb)
	e.Telegram = telegram
	e.ChatID = "c"
	e.Now = nearCloseNow()
	e.Sleep = func(time.Duration) {}
	wb.Acct = map[string]any{"cash_balance": 10000.0}
	wb.FillStatus, wb.FillPrice, wb.FillQty = "FILLED", 11.9, 7
	wb.OnPositions = func() []any {
		wb.mu.Lock()
		defer wb.mu.Unlock()
		if len(wb.Orders) > 0 {
			return []any{}
		}
		return []any{map[string]any{"symbol": "AAPL", "quantity": 7.0}}
	}
	mustInsertBrokerTrade(t, e, "wb-aapl", "AAPL", "webull", "2026-08-20", 7)
	e.PatchAutoConfig(map[string]any{
		"enabled": true, "lowIBS": 0.10, "highIBS": 0.75,
		"allowNewEntries": true, "allowExits": true, "entryCapitalMode": "cash_100",
		"brokers": map[string]any{
			"webull": map[string]any{"enabled": true, "allowNewEntries": true, "allowExits": true},
		},
	})
	return e
}

// T-1 with an exit and a same-day re-entry: the decision reaches the chat
// first, then the fill and the result, then the re-entry.
func TestT1DecisionGoesOutBeforeFills(t *testing.T) {
	tg := &MemoryTelegram{}
	// A slow decision send leaves the fill every chance to overtake it, as
	// Robinhood's did on 2026-10-09.
	e := exitReentryEngine(t, slowDecisionTelegram{tg})
	res, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true})
	if err != nil || !res.Sent {
		t.Fatalf("%v %+v", err, res)
	}
	e.StopTrackers()

	at := func(want string) int {
		t.Helper()
		for i, m := range tg.Sent() {
			if strings.Contains(m[1], want) {
				return i
			}
		}
		t.Fatalf("no message with %q:\n%s", want, sentBody(tg))
		return -1
	}
	decision, sold, closed, reentry := at("1 минута до закрытия"), at("продано 7 AAPL"), at("AAPL закрыта:"), at("🔁 После выхода")
	if !(decision < sold && sold < closed && closed < reentry) {
		t.Fatalf("order decision=%d sold=%d closed=%d reentry=%d:\n%s", decision, sold, closed, reentry, sentBody(tg))
	}
	if first := tg.Sent()[decision][1]; !strings.Contains(first, "Закрываем AAPL") || strings.Contains(first, "Открываем MSFT") {
		t.Fatalf("the decision message reports the exit, the re-entry comes later:\n%s", first)
	}
	if follow := tg.Sent()[reentry][1]; !strings.Contains(follow, "Открываем MSFT") {
		t.Fatalf("follow-up must report the re-entry:\n%s", follow)
	}
	if !strings.Contains(res.Text, "Закрываем AAPL") || !strings.Contains(res.Text, "Открываем MSFT") {
		t.Fatalf("the run's text keeps both parts:\n%s", res.Text)
	}
	if again, _ := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true}); again.Reason != "already_sent" {
		t.Fatalf("the report must be marked sent, got %+v", again)
	}
}

// The decision failing to send must not lose it: the cycle falls back to one
// full report at the end, and the failure is on record.
func TestT1DecisionSendFailureFallsBackToFullReport(t *testing.T) {
	tg := &MemoryTelegram{Fail: errors.New("telegram down"), FailN: 1}
	e := exitReentryEngine(t, tg)
	res, err := e.Aggregate(1, AggregateOpts{ForceSend: true, UpdateState: true})
	if err != nil || !res.Sent {
		t.Fatalf("%v %+v", err, res)
	}
	e.StopTrackers()
	var report string
	for _, m := range tg.Sent() {
		if strings.Contains(m[1], "1 минута до закрытия") {
			report = m[1]
		}
	}
	if !strings.Contains(report, "Закрываем AAPL") || !strings.Contains(report, "Открываем MSFT") {
		t.Fatalf("full report must carry the decision and the re-entry:\n%s", sentBody(tg))
	}
	if strings.Contains(sentBody(tg), "🔁 После выхода") {
		t.Fatal("a follow-up without its decision makes no sense")
	}
	if !strings.Contains(autotradeLogText(t, e), "event=notify_failed") {
		t.Fatal("the failed decision send must be logged")
	}
}

type slowDecisionTelegram struct{ *MemoryTelegram }

func (s slowDecisionTelegram) Send(chatID, text string) error {
	if strings.Contains(text, "1 минута до закрытия") {
		time.Sleep(200 * time.Millisecond)
	}
	return s.MemoryTelegram.Send(chatID, text)
}

// Nothing may stay held after a T-1 run: a held alert is a lost alert.
func TestHeldNoticesGoOutOnceOnRelease(t *testing.T) {
	_, e, _ := testEngine(t, nil)
	tg := e.Telegram.(*MemoryTelegram)
	e.holdNoticesUntilDecision()
	_ = e.Send(e.chat(), "fill")
	if len(tg.Sent()) != 0 {
		t.Fatal("a held notice went out before the decision")
	}
	e.releaseNotices()
	e.releaseNotices()
	if got := tg.Sent(); len(got) != 1 || got[0][1] != "fill" {
		t.Fatalf("held notice must go out exactly once, got %v", got)
	}
}

func sentBody(tg *MemoryTelegram) string {
	var b strings.Builder
	for _, m := range tg.Sent() {
		b.WriteString(m[1])
		b.WriteByte('\n')
	}
	return b.String()
}
