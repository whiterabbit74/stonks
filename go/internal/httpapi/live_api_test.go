package httpapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/live"
	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/types"
)

func TestMain(m *testing.M) {
	live.FastTrackers = true
	os.Exit(m.Run())
}

func liveServer(t *testing.T) (*Server, *live.MemoryTelegram, *live.MemoryBroker) {
	t.Helper()
	s := testServer(t, "")
	tg := &live.MemoryTelegram{}
	br := &live.MemoryBroker{}
	bars := []types.OHLC{
		{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1},
	}
	q := &live.MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": bars}}
	s.Live.Telegram = tg
	s.Live.Broker = br
	s.Live.Quotes = q
	s.Live.ChatID = "test-chat"
	if err := s.DB.UpsertWatch(map[string]any{"symbol": "AAPL", "lowIBS": 0.1, "highIBS": 0.75, "chatId": "test-chat"}); err != nil {
		t.Fatal(err)
	}
	if err := s.DB.SaveDataset("AAPL", "AAPL", "", "", bars, false); err != nil {
		t.Fatal(err)
	}
	return s, tg, br
}

func postJSON(s *Server, path string, body any) *httptest.ResponseRecorder {
	b, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	return rec
}

func TestLivePathsAreNotJsonOKStubs(t *testing.T) {
	s, tg, br := liveServer(t)

	rec := postJSON(s, "/api/telegram/simulate", map[string]any{"stage": "overview"})
	if rec.Code != 200 {
		t.Fatalf("simulate overview %d %s", rec.Code, rec.Body.String())
	}
	var sim map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &sim)
	if sim["success"] != true || sim["stage"] != "overview" {
		t.Fatalf("overview %v", sim)
	}
	if len(tg.Messages) == 0 || !strings.Contains(tg.Messages[0][1], "AAPL") {
		t.Fatalf("telegram payload missing AAPL: %+v", tg.Messages)
	}
	overview := tg.Messages[0][1]
	for _, need := range []string{"11m", "ET", "ENTRY", "FLAT", "IBS", "RT"} {
		if !strings.Contains(overview, need) {
			t.Fatalf("T-11 overview missing %q: %s", need, overview)
		}
	}

	rec = postJSON(s, "/api/telegram/simulate", map[string]any{"stage": "confirmations"})
	_ = json.Unmarshal(rec.Body.Bytes(), &sim)
	if sim["stage"] != "confirmations" {
		t.Fatalf("confirmations %v", sim)
	}
	text, _ := sim["text"].(string)
	if !strings.Contains(text, "РЕШЕНИЕ") || !strings.Contains(text, "AAPL") {
		t.Fatalf("T-1 decision text missing: %s", rec.Body.String())
	}
	if sim["dryRun"] != true {
		t.Fatalf("http confirmations must dry-run: %v", sim)
	}

	more := []types.OHLC{
		{Date: "2026-09-01", Open: 10, High: 12, Low: 8, Close: 8.2, Volume: 1},
		{Date: "2026-09-02", Open: 8, High: 9, Low: 7, Close: 8.5, Volume: 1},
	}
	s.Live.Quotes = &live.MemoryQuotes{Bars: map[string][]types.OHLC{"AAPL": more}}
	rec = postJSON(s, "/api/telegram/actualize-prices", map[string]any{})
	if rec.Code != 200 {
		t.Fatalf("actualize %d %s", rec.Code, rec.Body.String())
	}
	bars, _, _ := s.DB.GetOHLC("AAPL")
	if len(bars) < 2 {
		t.Fatalf("OHLC not persisted, got %d bars", len(bars))
	}

	rec = postJSON(s, "/api/telegram/update-all", map[string]any{})
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "prices") {
		t.Fatalf("update-all %d %s", rec.Code, rec.Body.String())
	}

	req := httptest.NewRequest("PATCH", "/api/autotrade/config", bytes.NewReader(mustJSON(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "entrySizingMode": "quantity", "fixedQuantity": 1,
	})))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("patch config %d %s", rec.Code, rec.Body.String())
	}

	s2 := New(s.DB, s.WebDir)
	req = httptest.NewRequest("GET", "/api/autotrade/config", nil)
	rec = httptest.NewRecorder()
	s2.Handler().ServeHTTP(rec, req)
	if !strings.Contains(rec.Body.String(), `"enabled":true`) && !strings.Contains(rec.Body.String(), `"enabled": true`) {
		t.Fatalf("config did not persist across reopen: %s", rec.Body.String())
	}

	put := httptest.NewRequest("PUT", "/api/autotrade/webull/token", bytes.NewReader(mustJSON(map[string]any{"token": "abc"})))
	put.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, put)
	st := httptest.NewRequest("GET", "/api/autotrade/webull/token/status", nil)
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, st)
	if !strings.Contains(rec.Body.String(), `"hasToken":true`) && !strings.Contains(rec.Body.String(), `"present":true`) {
		t.Fatalf("token status %s", rec.Body.String())
	}

	rec = postJSON(s, "/api/autotrade/execute", map[string]any{})
	body := rec.Body.String()
	if strings.Contains(body, "live orders disabled in local Go rewrite") {
		t.Fatalf("execute still stub: %s", body)
	}
	if rec.Code != 200 {
		t.Fatalf("execute %d %s", rec.Code, body)
	}
	var ex map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &ex)
	if ex["executed"] != true {
		t.Fatalf("expected submitted execute, got %s", body)
	}
	if len(br.Orders) == 0 {
		t.Fatal("broker PlaceMarket not called")
	}
}

func TestHTTPSimulateDoesNotConsumeT1Lock(t *testing.T) {
	s, _, br := liveServer(t)
	s.Live.Now = func() time.Time { return time.Date(2026, 9, 1, 19, 59, 0, 0, time.UTC) }
	req := httptest.NewRequest("PATCH", "/api/autotrade/config", bytes.NewReader(mustJSON(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "entrySizingMode": "quantity", "fixedQuantity": 1,
	})))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("config %d %s", rec.Code, rec.Body.String())
	}

	overview := postJSON(s, "/api/telegram/simulate", map[string]any{"stage": "overview"})
	if overview.Code != 200 {
		t.Fatalf("overview %d %s", overview.Code, overview.Body.String())
	}
	confirm := postJSON(s, "/api/telegram/simulate", map[string]any{"stage": "confirmations"})
	if confirm.Code != 200 {
		t.Fatalf("confirmations %d %s", confirm.Code, confirm.Body.String())
	}
	var sim map[string]any
	_ = json.Unmarshal(confirm.Body.Bytes(), &sim)
	if sim["dryRun"] != true || sim["executed"] == true {
		t.Fatalf("HTTP simulate must stay dry-run: %s", confirm.Body.String())
	}
	if strings.Contains(confirm.Body.String(), "live orders disabled") {
		t.Fatalf("stub: %s", confirm.Body.String())
	}
	if len(br.Orders) != 0 {
		t.Fatalf("simulate placed %+v", br.Orders)
	}
	t11, t1 := s.DB.AggregateState("test-chat", "2026-09-01")
	if t11 || t1 {
		t.Fatalf("simulate must not consume t11Sent/t1Sent, got t11=%v t1=%v", t11, t1)
	}
	again := postJSON(s, "/api/telegram/simulate", map[string]any{"stage": "confirmations"})
	_ = json.Unmarshal(again.Body.Bytes(), &sim)
	if fmt.Sprint(sim["reason"]) == "already_sent" {
		t.Fatalf("second simulate blocked by lock: %s", again.Body.String())
	}

	liveRes, err := s.Live.Aggregate(1, live.AggregateOpts{ForceSend: true, DryRun: false, UpdateState: true})
	if err != nil {
		t.Fatal(err)
	}
	if !liveRes.Executed || len(br.Orders) != 1 {
		t.Fatalf("live T-1 after simulate must still place, executed=%v orders=%+v reason=%s", liveRes.Executed, br.Orders, liveRes.Reason)
	}
	_, t1 = s.DB.AggregateState("test-chat", "2026-09-01")
	if !t1 {
		t.Fatal("live T-1 should claim t1Sent")
	}
}

func TestSimulateConfirmationsDoesNotPlace(t *testing.T) {
	s, _, br := liveServer(t)
	req := httptest.NewRequest("PATCH", "/api/autotrade/config", bytes.NewReader(mustJSON(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "entrySizingMode": "quantity", "fixedQuantity": 1,
	})))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	rec = postJSON(s, "/api/telegram/simulate", map[string]any{"stage": "confirmations"})
	if rec.Code != 200 {
		t.Fatalf("simulate %d %s", rec.Code, rec.Body.String())
	}
	var sim map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &sim)
	if sim["dryRun"] != true {
		t.Fatalf("http simulate must dry-run: %s", rec.Body.String())
	}
	if len(br.Orders) != 0 {
		t.Fatalf("http simulate placed %+v", br.Orders)
	}
}

func TestAutoLogsIncludePending(t *testing.T) {
	s, _, _ := liveServer(t)
	_ = s.DB.SaveOrderTracker(map[string]any{"clientOrderId": "oid-1", "symbol": "AAPL", "action": "entry", "status": "submitted", "quantity": 1})
	req := httptest.NewRequest("GET", "/api/autotrade/logs?limit=10", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("logs %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"pending"`) || !strings.Contains(rec.Body.String(), "oid-1") {
		t.Fatalf("logs missing pending tracker: %s", rec.Body.String())
	}
}

func TestTestBuyDisabledByDefault(t *testing.T) {
	s, _, _ := liveServer(t)
	t.Setenv("WEBULL_ENABLE_LIVE_TEST_BUY", "")
	rec := postJSON(s, "/api/autotrade/webull/test-buy", map[string]any{"symbol": "AAPL", "quantity": 1})
	if rec.Code != 403 {
		t.Fatalf("want 403 got %d %s", rec.Code, rec.Body.String())
	}
}

func TestSimulateSplitJumpAndEmaAndFillPoll(t *testing.T) {
	s, tg, br := liveServer(t)
	bars := []types.OHLC{{Date: "2026-09-01", Open: 91, High: 94, Low: 90, Close: 92.7, Volume: 1}}
	if err := s.DB.SaveDataset("TQQQ", "TQQQ", "", "", bars, false); err != nil {
		t.Fatal(err)
	}
	if err := s.DB.UpsertWatch(map[string]any{"symbol": "TQQQ", "lowIBS": 0.9, "highIBS": 0.75}); err != nil {
		t.Fatal(err)
	}
	s.Live.Quotes = &live.MemoryQuotes{Q: map[string]providers.QuotePayload{
		"TQQQ": {Quote: map[string]any{"current": 44.68}, Range: map[string]any{"low": 44.0, "high": 50.0}},
		"AAPL": {Quote: map[string]any{"current": 8.2}, Range: map[string]any{"low": 8.0, "high": 12.0}},
	}}
	tg.Messages = nil
	rec := postJSON(s, "/api/telegram/simulate", map[string]any{"stage": "overview"})
	if rec.Code != 200 {
		t.Fatalf("simulate %d %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	joined := body
	for _, m := range tg.Messages {
		joined += m[1]
	}
	if !strings.Contains(joined, "ПРОВЕРКА ДАННЫХ") || !strings.Contains(joined, "EMA/IBS сигналы заблокированы") {
		t.Fatalf("http simulate missing integrity: %s msgs=%+v", body, tg.Messages)
	}

	var hist []types.OHLC
	for i := 1; i <= 20; i++ {
		hist = append(hist, types.OHLC{Date: fmt.Sprintf("2026-08-%02d", i), Open: 100, High: 100, Low: 100, Close: 100, Volume: 1})
	}
	_ = s.DB.SaveDataset("MSFT", "MSFT", "", "", hist, true)
	_, _ = s.DB.UpsertEMAAlert(map[string]any{
		"id": "ema-msft", "symbol": "MSFT", "emaPeriod": 20, "buyLevelPct": 0, "sellLevelPct": 40,
		"nextAction": "buy", "thresholdPct": 1, "levelPct": 0, "direction": "below",
	})
	s.Live.Quotes = &live.MemoryQuotes{Q: map[string]providers.QuotePayload{
		"MSFT": {Quote: map[string]any{"current": 100.0}, Range: map[string]any{"low": 99.0, "high": 101.0}},
		"AAPL": {Quote: map[string]any{"current": 8.2}, Range: map[string]any{"low": 8.0, "high": 12.0}},
	}}
	tg.Messages = nil
	rec = postJSON(s, "/api/telegram/simulate", map[string]any{"stage": "overview"})
	joined = rec.Body.String()
	for _, m := range tg.Messages {
		joined += m[1]
	}
	if !strings.Contains(joined, "📐 EMA сигналы") {
		t.Fatalf("http simulate missing EMA message: %s %+v", rec.Body.String(), tg.Messages)
	}

	req := httptest.NewRequest("PATCH", "/api/autotrade/config", bytes.NewReader(mustJSON(map[string]any{
		"enabled": true, "lowIBS": 0.9, "allowNewEntries": true, "entrySizingMode": "quantity", "fixedQuantity": 1,
	})))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	rec = postJSON(s, "/api/autotrade/execute", map[string]any{})
	if rec.Code != 200 {
		t.Fatalf("execute %d %s", rec.Code, rec.Body.String())
	}
	if len(br.Orders) == 0 {
		t.Fatal("expected order to poll")
	}
	oid := br.Orders[len(br.Orders)-1].ClientOrderID
	br.Details = map[string]map[string]any{oid: {"status": "FILLED"}}
	n := s.Live.PollTrackers()
	if n == 0 {
		t.Fatal("poll did not see tracker")
	}
}

func TestWatchesGETSyncsOpenMonitorTrade(t *testing.T) {
	s, _, _ := liveServer(t)
	if err := s.DB.InsertTrade("trades", map[string]any{
		"id": "m-aapl", "symbol": "AAPL", "status": "open", "entryDate": "2026-09-01", "entryPrice": 10.5,
	}); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("GET", "/api/telegram/watches", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("watches %d %s", rec.Code, rec.Body.String())
	}
	var list []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, w := range list {
		if fmt.Sprint(w["symbol"]) == "AAPL" {
			found = true
			if w["isOpenPosition"] != true {
				t.Fatalf("expected open position projection: %+v", w)
			}
		}
	}
	if !found {
		t.Fatalf("AAPL missing: %s", rec.Body.String())
	}
}

func TestEMAAlertPostReturnsAlert(t *testing.T) {
	s, _, _ := liveServer(t)
	rec := postJSON(s, "/api/telegram/ema-alerts", map[string]any{
		"symbol": "TQQQ", "emaPeriod": 20, "buyLevelPct": 15, "sellLevelPct": 40, "nextAction": "buy",
	})
	if rec.Code != 200 {
		t.Fatalf("ema post %d %s", rec.Code, rec.Body.String())
	}
	var row map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &row); err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(row["symbol"]) != "TQQQ" || row["id"] == nil || row["ok"] == true {
		t.Fatalf("expected created alert, got %s", rec.Body.String())
	}
}

func TestImportWebullCalendarDerivesHolidays(t *testing.T) {
	s, _, br := liveServer(t)
	s.Live.Now = func() time.Time { return time.Date(2026, 9, 1, 16, 0, 0, 0, time.UTC) }
	var days []map[string]any
	for i := 0; i < 30; i++ {
		tm := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC).AddDate(0, 0, i)
		ymd := tm.Format("2006-01-02")
		w := tm.Weekday()
		if w == time.Saturday || w == time.Sunday {
			continue
		}
		if ymd == "2026-09-08" {
			continue
		}
		typ := "FULL_DAY"
		if ymd == "2026-09-02" {
			typ = "HALF_DAY"
		}
		days = append(days, map[string]any{"trade_day": ymd, "trade_date_type": typ})
	}
	br.Days = days
	rec := postJSON(s, "/api/trading-calendar/import-webull", map[string]any{})
	if rec.Code != 200 {
		t.Fatalf("import %d %s", rec.Code, rec.Body.String())
	}
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out["ok"] != true {
		t.Fatalf("import body %s", rec.Body.String())
	}
	if n, _ := out["newHolidays"].(float64); n < 1 {
		t.Fatalf("expected new holiday, got %s", rec.Body.String())
	}
	if n, _ := out["newShortDays"].(float64); n < 1 {
		t.Fatalf("expected short day, got %s", rec.Body.String())
	}
	raw, _ := s.DB.GetCalendar()
	if !strings.Contains(string(raw), `"09-08"`) || !strings.Contains(string(raw), `"09-02"`) {
		t.Fatalf("calendar missing derived days: %s", raw)
	}
}

func TestShippedAppJsMappers(t *testing.T) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("caller")
	}
	dir := filepath.Dir(thisFile)
	script := filepath.Join(dir, "testdata", "run-app-mappers.mjs")
	if _, err := os.Stat(script); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("node", script)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("shipped app.js mapper: %v\n%s", err, out)
	}
	var got struct {
		OK      bool           `json:"ok"`
		Fail    []string       `json:"fail"`
		Nested  map[string]any `json:"nested"`
		AppPath string         `json:"appPath"`
	}
	if err := json.Unmarshal(out, &got); err != nil {
		t.Fatalf("mapper json: %v\n%s", err, out)
	}
	if !strings.Contains(got.AppPath, filepath.Join("web", "js", "app.js")) {
		t.Fatalf("mapper did not load shipped app.js: %s", got.AppPath)
	}
	if !got.OK {
		t.Fatalf("mapper assertions: %v", got.Fail)
	}
	if fmt.Sprint(got.Nested["totalAssets"]) != "12345.67" {
		t.Fatalf("totalAssets %v", got.Nested["totalAssets"])
	}
	if fmt.Sprint(got.Nested["buyingPower"]) != "2000" {
		t.Fatalf("buyingPower %v", got.Nested["buyingPower"])
	}
}

func TestDashboardNestedWebullBalance(t *testing.T) {
	s, _, br := liveServer(t)
	_, thisFile, _, _ := runtime.Caller(0)
	rawFix, err := os.ReadFile(filepath.Join(filepath.Dir(thisFile), "testdata", "webull-nested-dashboard.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fix map[string]any
	if err := json.Unmarshal(rawFix, &fix); err != nil {
		t.Fatal(err)
	}
	acct, _ := fix["account"].(map[string]any)
	br.Acct = acct
	if holdings, ok := fix["positions"].(map[string]any); ok {
		if rows, ok := holdings["holdings"].([]any); ok {
			br.Pos = rows
		}
	}
	req := httptest.NewRequest("GET", "/api/autotrade/webull/dashboard", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("dashboard %d %s", rec.Code, rec.Body.String())
	}
	var dash map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &dash); err != nil {
		t.Fatal(err)
	}
	if dash["balance"] == nil {
		t.Fatalf("top-level balance missing: %s", rec.Body.String())
	}
	if fmt.Sprint(dash["fetchedAt"]) == "" || dash["fetchedAt"] == nil {
		t.Fatalf("fetchedAt missing: %s", rec.Body.String())
	}
	accounts, _ := dash["accounts"].([]any)
	if len(accounts) < 1 {
		t.Fatalf("accounts missing: %s", rec.Body.String())
	}
	raw := rec.Body.String()
	for _, need := range []string{"12345.67", "1000.00", "2000.00", "AAPL", "1800.00"} {
		if !strings.Contains(raw, need) {
			t.Fatalf("dashboard missing %q: %s", need, raw)
		}
	}
}

func TestUIOracleBlocks(t *testing.T) {
	app, err := os.ReadFile("../web/js/app.js")
	if err != nil {
		app, err = os.ReadFile("../../web/js/app.js")
	}
	if err != nil {
		t.Fatal(err)
	}
	a := string(app)
	if strings.Contains(a, "state.stockTab !== 'summary'") {
		t.Fatal("stocks params must not be injected on non-summary tabs")
	}
	if strings.Count(a, "${stocksParams(") != 2 {
		t.Fatalf("stocksParams should render only in summary asides, got %d", strings.Count(a, "${stocksParams("))
	}
	for _, need := range []string{
		"<th>Тикер</th>", "Дата входа-выхода", "Цена входа", "Цена выхода",
		"applyMonitorMarginSimulation", "watch-margin", "Маржинальность",
		"extractBalanceSummary", "total_net_liquidation_value", "overnight_buying_power",
		"Себестоимость", "Рыночная стоимость", "PnL %",
		"monitorTradesTable", "Reconcile Candidate",
		"broker-reconcile", "Показать скрытые",
		`data-edit="`, `data-refresh="`, `data-export="`, "companyName", "Сохранён:",
		"Настройки провайдера", "compactMetricsHTML", "reset-opt-tickers",
		"webullCoverageThrough", `data-edit-split="`, `data-del-ticker="`,
	} {
		if !strings.Contains(a, need) {
			t.Errorf("UI missing %s", need)
		}
	}
	if !strings.Contains(a, "Изменить</button>") || !strings.Contains(a, "Обновить</button>") || !strings.Contains(a, "Экспорт</button>") {
		t.Error("data list-row actions missing")
	}
}

func TestDashboardIncludesBrokerOrders(t *testing.T) {
	s, _, br := liveServer(t)
	br.Open = []any{map[string]any{"symbol": "AAPL", "side": "BUY", "status": "WORKING", "quantity": 2, "order_type": "MARKET"}}
	br.Hist = []any{map[string]any{"symbol": "MSFT", "side": "SELL", "status": "FILLED", "filled_qty": 1, "filled_price": 8.2, "filled_time": "2026-09-01"}}
	req := httptest.NewRequest("GET", "/api/autotrade/webull/dashboard", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("dashboard %d %s", rec.Code, rec.Body.String())
	}
	var dash map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &dash); err != nil {
		t.Fatal(err)
	}
	open, _ := dash["openOrders"].([]any)
	hist, _ := dash["orderHistory"].([]any)
	if len(open) != 1 {
		t.Fatalf("openOrders %v body=%s", dash["openOrders"], rec.Body.String())
	}
	om, _ := open[0].(map[string]any)
	if fmt.Sprint(om["symbol"]) != "AAPL" || fmt.Sprint(om["status"]) != "WORKING" {
		t.Fatalf("open order %+v", om)
	}
	if len(hist) != 1 {
		t.Fatalf("orderHistory %v", dash["orderHistory"])
	}
	hm, _ := hist[0].(map[string]any)
	if fmt.Sprint(hm["symbol"]) != "MSFT" || fmt.Sprint(hm["status"]) != "FILLED" {
		t.Fatalf("history %+v", hm)
	}
}

func TestPagesDriveLiveAPIs(t *testing.T) {
	app, err := os.ReadFile("../web/js/app.js")
	if err != nil {
		app, err = os.ReadFile("../../web/js/app.js")
	}
	if err != nil {
		t.Fatal(err)
	}
	api, err := os.ReadFile("../web/js/api.js")
	if err != nil {
		api, err = os.ReadFile("../../web/js/api.js")
	}
	if err != nil {
		t.Fatal(err)
	}
	a, j := string(app), string(api)
	need := []string{"/api/monitor/consistency", "/api/autotrade/webull/dashboard", "/api/autotrade/logs", "/api/autotrade/status"}
	for _, s := range need {
		if !strings.Contains(a, s) && !strings.Contains(j, s) {
			t.Errorf("UI missing %s", s)
		}
	}
	if !strings.Contains(a, "openOrders") || !strings.Contains(a, "orderHistory") {
		t.Error("broker tabs must render dashboard openOrders/orderHistory")
	}
	for _, need := range []string{"auto-enable", "auto-test-buy", "auto-token-check", "auto-token-save", "name=\"autoEnabled\"", "entryCapitalMode", "data-close-pos", "BUY AAL"} {
		if !strings.Contains(a, need) {
			t.Errorf("UI missing autotrade control %s", need)
		}
	}
	if !strings.Contains(j, "token/create") || !strings.Contains(j, "test-buy") || !strings.Contains(j, "close-position") {
		t.Error("api.js missing token/test-buy/close-position")
	}
	if !strings.Contains(a, "r.sent") {
		t.Error("watches simulate toast must inspect r.sent")
	}
	if strings.Contains(a, "Monitor и broker журналы сейчас согласованы.") && !strings.Contains(a, "consistency") {
		t.Error("consistency copy is hardcoded")
	}
}

func TestNoJsonOKCannedMap(t *testing.T) {
	raw, err := os.ReadFile("server.go")
	if err != nil {
		t.Fatal(err)
	}
	txt := string(raw)
	if strings.Contains(txt, "live orders disabled in local Go rewrite") {
		t.Fatal("canned execute stub still in server.go")
	}
	if strings.Contains(txt, `"simulated": true`) {
		t.Fatal("canned simulate stub still in server.go")
	}
}

func TestCloseMonitorRequiresExitPrice(t *testing.T) {
	s, _, _ := liveServer(t)
	_ = s.DB.InsertTrade("trades", map[string]any{"id": "m1", "symbol": "AAPL", "status": "open", "entryDate": "2026-08-20", "entryPrice": 10.0})
	rec := postJSON(s, "/api/trades/m1/close-monitor", map[string]any{})
	if rec.Code != 400 {
		t.Fatalf("want 400 missing exitPrice, got %d %s", rec.Code, rec.Body.String())
	}
	rec = postJSON(s, "/api/trades/missing/close-monitor", map[string]any{"exitPrice": 12.0})
	if rec.Code != 404 {
		t.Fatalf("want 404, got %d %s", rec.Code, rec.Body.String())
	}
}

func TestCloseMonitor409AndPnL(t *testing.T) {
	s, _, _ := liveServer(t)
	_ = s.DB.InsertTrade("trades", map[string]any{"id": "m1", "symbol": "AAPL", "status": "open", "entryDate": "2026-08-20", "entryPrice": 10.0})
	rec := postJSON(s, "/api/trades/m1/close-monitor", map[string]any{"exitPrice": 12.0, "exitDate": "2026-09-01"})
	if rec.Code != 200 {
		t.Fatalf("close %d %s", rec.Code, rec.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(out["status"]) != "closed" {
		t.Fatalf("status %v", out["status"])
	}
	if pnl, _ := out["pnlAbsolute"].(float64); pnl != 2 {
		t.Fatalf("pnlAbsolute %v body=%s", out["pnlAbsolute"], rec.Body.String())
	}
	if pct, _ := out["pnlPercent"].(float64); pct != 20 {
		t.Fatalf("pnlPercent %v", out["pnlPercent"])
	}
	rec = postJSON(s, "/api/trades/m1/close-monitor", map[string]any{"exitPrice": 12.0})
	if rec.Code != 409 {
		t.Fatalf("already closed want 409, got %d %s", rec.Code, rec.Body.String())
	}
	_ = s.DB.InsertTrade("trades", map[string]any{"id": "m2", "symbol": "MSFT", "status": "open", "entryDate": "2026-08-20", "entryPrice": 10.0})
	_, _ = s.DB.SQL.Exec(`UPDATE trades SET linked_broker_trade_id='b1' WHERE id='m2'`)
	rec = postJSON(s, "/api/trades/m2/close-monitor", map[string]any{"exitPrice": 11.0})
	if rec.Code != 409 {
		t.Fatalf("linked trade want 409, got %d %s", rec.Code, rec.Body.String())
	}
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
