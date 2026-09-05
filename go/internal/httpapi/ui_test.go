package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"mktorder.com/go/internal/store"
)

func TestVanillaUIAssets(t *testing.T) {
	web := filepath.Join("..", "..", "web")
	files := []string{
		"index.html", "css/app.css", "css/extra.css",
		"js/app.js", "js/api.js", "js/charts.js",
		"vendor/lightweight-charts.standalone.production.js",
		"fonts/inter/inter-400.ttf", "fonts/jetbrains-mono/jetbrains-mono-400.ttf",
	}
	for _, f := range files {
		p := filepath.Join(web, f)
		if _, err := os.Stat(p); err != nil {
			t.Errorf("missing %s: %v", f, err)
		}
	}
	html, _ := os.ReadFile(filepath.Join(web, "index.html"))
	s := string(html)
	if !strings.Contains(s, "lightweight-charts.standalone.production.js") {
		t.Fatal("index.html must vendor Lightweight Charts v5 standalone")
	}
	if strings.Contains(s, "require(") && !strings.Contains(s, "createChart") {
		t.Fatal("unexpected node require as only path")
	}
	js, _ := os.ReadFile(filepath.Join(web, "js/charts.js"))
	cj := string(js)
	if !strings.Contains(cj, "LightweightCharts.createChart") || !strings.Contains(cj, "chart.addSeries") {
		t.Fatal("charts.js must use v5 createChart + addSeries")
	}
	if !strings.Contains(cj, "CandlestickSeries") {
		t.Fatal("missing CandlestickSeries")
	}
	if !strings.Contains(cj, "RIGHT_OFFSET: 8") {
		t.Fatal("all charts must default to an 8-bar rightOffset")
	}
	if !strings.Contains(cj, "addIbsPane") || !strings.Contains(cj, "lineStyle: 1") {
		t.Fatal("IBS pane must draw dotted 10/75 threshold lines")
	}
	ibsStart := strings.Index(cj, "addIbsPane(")
	if ibsStart < 0 {
		t.Fatal("missing addIbsPane")
	}
	ibsEndRel := strings.Index(cj[ibsStart:], "\n  csvCell")
	if ibsEndRel < 0 {
		ibsEndRel = strings.Index(cj[ibsStart:], "\n  csvFromBars")
	}
	if ibsEndRel < 0 {
		t.Fatal("addIbsPane not bounded")
	}
	ibsBlock := cj[ibsStart : ibsStart+ibsEndRel]
	if strings.Contains(ibsBlock, "AreaSeries") || strings.Contains(ibsBlock, "ibsBandData") || strings.Contains(ibsBlock, "ibsColoredLineData") {
		t.Fatal("IBS pane must be one line plus dotted 10/75 price lines, not area fills or a split-color IBS")
	}
	if !strings.Contains(ibsBlock, "createPriceLine") {
		t.Fatal("IBS pane must createPriceLine at the 10/75 thresholds")
	}
	if !strings.Contains(cj, "adj_close") || !strings.Contains(cj, "ema200") {
		t.Fatal("chart CSV must export price/ibs/ema columns like the old TradingChart")
	}
	app, _ := os.ReadFile(filepath.Join(web, "js/app.js"))
	a := string(app)
	css, _ := os.ReadFile(filepath.Join(web, "css/extra.css"))
	extra := string(css)

	for _, route := range []string{"/login", "/data", "/enhance", "/stocks", "/ema", "/multi-ticker-options", "/calendar", "/split", "/watches", "/broker", "/webull", "/robinhood", "/settings", "/results"} {
		if !strings.Contains(a, route) {
			t.Errorf("app.js missing route %s", route)
		}
	}
	for _, label := range []string{
		"Вход", "Данные", "Новые данные", "Акции", "EMA", "Опционы",
		"Календарь торгов", "Сплиты", "Мониторинг", "Кабинет Webull", "Кабинет Robinhood", "Подключение", "Настройки",
	} {
		if !strings.Contains(a, label) {
			t.Errorf("missing page title %s", label)
		}
	}
	if strings.Contains(a, "from 'react'") || strings.Contains(a, "ReactDOM") {
		t.Fatal("UI must be vanilla JS, not React")
	}
	if !strings.Contains(a, "Сервис недоступен") || !strings.Contains(a, "state.authUnknown = true") {
		t.Fatal("non-401 auth errors must show an unavailable screen, not boot as authed")
	}
	if strings.Contains(a, "API.monitorTrades().catch(() => [])") || strings.Contains(a, "API.trades().catch(() => API.monitorTrades().catch(() => []))") {
		t.Fatal("watches must not coerce a trades 500 into an empty table")
	}
	if !strings.Contains(a, "watchLoadError") {
		t.Fatal("watches load errors must be shown, not swallowed")
	}
	if strings.Contains(a, "IBS Trading Strategy") || strings.Contains(a, ">IBS Trading<") {
		t.Fatal("old IBS Trading Strategy brand must be replaced")
	}
	if strings.Contains(a, "watch-mobile-tabs") || strings.Contains(extra, "watch-mobile-tabs") {
		t.Fatal("monitoring tabs must not be a mobile-only strip")
	}
	if !strings.Contains(a, "analysisTabs(WATCH_TABS") {
		t.Fatal("monitoring page must keep Сводка/Сделки/Тикеры/EMA tabs on the page")
	}
	if !strings.Contains(a, "Trading strategies") {
		t.Fatal("missing brand Trading strategies")
	}
	if strings.Contains(a, "Webull credentials are not configured") {
		t.Fatal("English Webull credentials banner must be replaced with Russian oracle copy")
	}
	if strings.Contains(a, ">удалить</button>") {
		t.Fatal("lowercase удалить row action must be Удалить")
	}
	ds := strings.Index(a, "function defaultStrategy()")
	if ds < 0 {
		t.Fatal("missing defaultStrategy")
	}
	dsEndRel := strings.Index(a[ds:], "async function loadSelected")
	if dsEndRel < 0 {
		t.Fatal("defaultStrategy not closed before loadSelected")
	}
	dsBlock := a[ds : ds+dsEndRel]
	if strings.Contains(dsBlock, "commissionPercentage") || strings.Contains(dsBlock, "st.commission") {
		t.Fatal("defaultStrategy must not inject settings commission")
	}
	if !strings.Contains(dsBlock, "percentage: 0") {
		t.Fatal("defaultStrategy must post commission percentage: 0 like React createDefaultRiskSettings")
	}
	if !strings.Contains(a, "allowSameDayReentry: true") {
		t.Fatal("UI must post allowSameDayReentry: true")
	}

	chrome := []string{
		"text-2xl",
		"from-indigo-500/50",
		"via-sky-500/40",
		"border-b-2",
		"border-indigo-500",
		"icon-btn-glass",
		"#menu-btn",
		"#settings-btn",
		"bottom-nav",
		"footer-status",
		"Авто", "Тёмная", "Светлая",
		"'auto'", "'dark'", "'light'",
		"laptop", "moon", "sun",
		"Built with ❤️ for traders",
		"footerHTML",
		"chart-watermark",
	}
	for _, banned := range []string{
		"Go API · Lightweight Charts",
		"Go API · Lightweight Charts v5",
		"GoAPI Lightweight Charts",
		"Журнал ошибок",
		"Показать ошибки",
		"errorConsoleOpen",
		"err-log-btn",
	} {
		if strings.Contains(a, banned) || strings.Contains(extra, banned) {
			t.Errorf("footer must not contain %q", banned)
		}
	}
	for _, m := range chrome {
		if !strings.Contains(a, m) && !strings.Contains(extra, m) {
			t.Errorf("missing chrome marker %s", m)
		}
	}
	if !strings.Contains(extra, ".icon-btn-glass") {
		t.Fatal("extra.css missing glass icon-btn")
	}
	if !strings.Contains(extra, "#menu-btn") {
		t.Fatal("extra.css missing hamburger #menu-btn")
	}
	if !strings.Contains(a, "function autotradeLive()") {
		t.Fatal("broker [LIVE] must go through autotradeLive (enabled AND token)")
	}

	for _, copy := range []string{
		"Запустить бэктест",
		"includeBaseline",
		"calcTickerRefs",
		"Библиотека датасетов",
		"Общие", "API", "Telegram", "Интерфейс", "Автоторговля",
		"Список", "Добавить", "Импорт", "Экспорт", "Webull API",
		"Кабинет Webull", "[OFF]", "[LIVE]",
		"take-profit-percent-input",
		"200%",
		"NYSE",
		"Популярные",
		"Экспирация",
		"Сигнал входа/выхода",
		"применяется ко всем отслеживаемым акциям",
		"Отклонение", "Спреды", "Баланс",
		"Импорт из Webull", "Запросить",
		"data-testprov", "Отправить тест",
		"['alpha_vantage', 'finnhub', 'twelve_data', 'polygon', 'webull']",
		"EMA-оповещений пока нет",
		"Всего активов",
		"data-hero-range",
		"Индикаторы",
		"Экспортировать данные графика в CSV",
		"Во весь экран",
		"Штрих-пунктир",
		"Добавить отклонение",
		"Рынок открыт", "Рынок закрыт",
		"День", "Неделя",
		"Линия", "Свечи",
		"Показывать сделки",
		"Добавить зону",
		"не актуальны",
		"Открытая сделка",
		"Обновить котировку",
		"Настройки графика",
		"Детали котировки",
		"Цена закрытия",
		"Webull не настроен",
		"Открытых позиций нет",
		"Активных ордеров нет",
		"История ордеров пока не пришла",
		"Нет отслеживаемых акций",
		"Сделок нет",
		"Логи автоторговли пока пусты",
		"Логи мониторинга пока пусты",
		"Состояние автоторговли",
		"fmtUsd(fv, 0)",
		"d == null ? 0",
		"Итоговый баланс",
	} {
		if !strings.Contains(a, copy) {
			t.Errorf("missing page copy %s", copy)
		}
	}
	for _, tab := range []string{"summary", "tickerCharts", "openDayDrawdown", "single-position", "options-multi", "emaDeviation", "spreads"} {
		if !strings.Contains(a, tab) {
			t.Errorf("app.js missing %s", tab)
		}
	}
	if !strings.Contains(a, "cal-edit") || !strings.Contains(a, "set-form") || !strings.Contains(a, "split-form") || !strings.Contains(a, "broker-form") {
		t.Fatal("interactive calendar/settings/splits/broker forms missing")
	}

	hero := []string{
		"data-hero-ticker",
		"['1M', '3M', '6M', '1Y', '3Y', '5Y', 'MAX']",
		"BuyAtClose4", "Просадка дня", "Пополнения", "Без стоп-лосса",
		"Профит-фактор",
		"Добавить ручную сделку",
		"ema-alert-form",
		"Капитал мониторинга",
		"Скрыть меню",
		"app-side-toggle",
		"Разделы мониторинга",
		"NASDAQ 100", "S&P 500", "Технологии", "Финансы", "Здравоохранение",
		"Энергетика", "Потребительские", "ETF", "С плечом",
	}
	for _, copy := range hero {
		if !strings.Contains(a, copy) {
			t.Errorf("missing hero/catalog/watches copy %s", copy)
		}
	}
	start := strings.Index(a, "const ENHANCE_CATS")
	if start < 0 {
		t.Fatal("missing ENHANCE_CATS")
	}
	endRel := strings.Index(a[start:], "const PATHS")
	if endRel < 0 {
		t.Fatal("ENHANCE_CATS block not closed before PATHS")
	}
	if catCount := strings.Count(a[start:start+endRel], "{ id:"); catCount != 11 {
		t.Errorf("ENHANCE_CATS has %d entries, want 11", catCount)
	}

	raw, err := os.ReadFile(filepath.Join(web, "tickers.json"))
	if err != nil {
		t.Fatalf("tickers.json: %v", err)
	}
	var catalog []map[string]any
	if err := json.Unmarshal(raw, &catalog); err != nil {
		t.Fatalf("tickers.json parse: %v", err)
	}
	if len(catalog) != 192 {
		t.Errorf("tickers.json has %d tickers, want 192", len(catalog))
	}
}

func TestVanillaUIPagesHTTP(t *testing.T) {
	web, err := filepath.Abs(filepath.Join("..", "..", "web"))
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := New(db, web)
	paths := []string{"/", "/login", "/data", "/enhance", "/stocks", "/ema", "/multi-ticker-options", "/calendar", "/split", "/watches", "/broker", "/webull", "/robinhood", "/settings", "/results"}
	for _, p := range paths {
		req := httptest.NewRequest(http.MethodGet, p, nil)
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Errorf("GET %s -> %d, want 200", p, rec.Code)
			continue
		}
		body := rec.Body.String()
		if !strings.Contains(body, "/js/app.js") || !strings.Contains(body, "lightweight-charts.standalone.production.js") {
			t.Errorf("GET %s did not serve the vanilla SPA shell", p)
		}
	}
	req := httptest.NewRequest(http.MethodGet, "/tickers.json", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /tickers.json -> %d, want 200", rec.Code)
	}
	var catalog []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &catalog); err != nil {
		t.Fatalf("GET /tickers.json: %v", err)
	}
	if len(catalog) != 192 {
		t.Errorf("GET /tickers.json returned %d tickers, want 192", len(catalog))
	}
}

func TestStaticCacheHeaders(t *testing.T) {
	web, err := filepath.Abs(filepath.Join("..", "..", "web"))
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := New(db, web)
	s.BuildID = "cachetest"

	get := func(path string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		return rec
	}

	rec := get("/css/extra.css")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /css/extra.css -> %d, want 200", rec.Code)
	}
	if cc := rec.Header().Get("Cache-Control"); cc == "" || !strings.Contains(cc, "no-cache") {
		t.Fatalf("GET /css/extra.css Cache-Control = %q, want no-cache", rec.Header().Get("Cache-Control"))
	}
	if strings.Contains(rec.Body.String(), "<!DOCTYPE html") {
		t.Fatal("GET /css/extra.css served index.html instead of the stylesheet")
	}

	rec = get("/")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET / -> %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "/js/app.js?v=") {
		t.Fatal("GET / must version app.js with ?v=")
	}

	rec = get("/fonts/inter/inter-400.ttf")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /fonts/inter/inter-400.ttf -> %d, want 200", rec.Code)
	}
	cc := rec.Header().Get("Cache-Control")
	if !strings.Contains(cc, "max-age=") {
		t.Errorf("font Cache-Control = %q, want long max-age", cc)
	}
	if strings.Contains(cc, "no-cache") || strings.Contains(cc, "no-store") {
		t.Errorf("font Cache-Control = %q, want a long cache not no-cache", cc)
	}
	if strings.Contains(rec.Body.String(), "<!DOCTYPE html") {
		t.Fatal("GET font served index.html instead of the font file")
	}

	rec = get("/vendor/lightweight-charts.standalone.production.js")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET vendor js -> %d, want 200", rec.Code)
	}
	if rec.Header().Get("Cache-Control") == "" {
		t.Fatal("GET vendor js missing Cache-Control")
	}
	if strings.Contains(rec.Body.String(), "<!DOCTYPE html") {
		t.Fatal("GET vendor js served index.html")
	}
}

// TestBrokerCloseHandlerDispatchesByKind guards P0-3: the "Закрыть" button on
// the Robinhood positions tab must send its SELL to Robinhood, not Webull.
// pageBroker's [data-close-pos] handler is shared by /webull and /robinhood,
// so the handler has to branch on the same `kind` the tab render used rather
// than unconditionally calling the Webull close endpoint.
func TestBrokerCloseHandlerDispatchesByKind(t *testing.T) {
	app, err := os.ReadFile(filepath.Join("..", "..", "web", "js", "app.js"))
	if err != nil {
		t.Fatal(err)
	}
	a := string(app)
	start := strings.Index(a, "querySelectorAll('[data-close-pos]')")
	if start < 0 {
		t.Fatal("data-close-pos handler not found")
	}
	end := strings.Index(a[start:], "}));")
	if end < 0 {
		t.Fatal("data-close-pos handler not closed")
	}
	handler := a[start : start+end]
	if !strings.Contains(handler, "API.rhClose(") {
		t.Fatal("data-close-pos handler never calls API.rhClose - Robinhood positions cannot be closed on Robinhood")
	}
	if !strings.Contains(handler, "kind === 'robinhood'") {
		t.Fatal("data-close-pos handler must branch on the same `kind` pageBroker used to render the tab")
	}
}

// TestAutotradeEntriesExitsReadsEngineTruth is the P2-1 regression: the SPA
// used to show "Entries / Exits: да" whenever the flag was merely not
// `false` (`!== false`), while the engine (go/internal/live/config.go
// allowFlag) treats a missing key as false. A saved config with no
// allowNewEntries/allowExits key at all would show "да" in the UI while the
// engine reads "нет". The fix must read `=== true` and use the per-broker
// value from ac.brokers, not one flag shared across brokers.
func TestAutotradeEntriesExitsReadsEngineTruth(t *testing.T) {
	app, err := os.ReadFile(filepath.Join("..", "..", "web", "js", "app.js"))
	if err != nil {
		t.Fatal(err)
	}
	a := string(app)
	if strings.Contains(a, "ac.allowNewEntries !== false") || strings.Contains(a, "ac.allowExits !== false") {
		t.Fatal("Entries/Exits must not treat a missing flag as true (`!== false`); the engine defaults missing keys to false")
	}
	if !strings.Contains(a, "brokerAllowFlag(ac, kind, 'allowNewEntries')") || !strings.Contains(a, "brokerAllowFlag(ac, kind, 'allowExits')") {
		t.Fatal("Entries/Exits must be read per broker (ac.brokers[kind]), not one flag shared across brokers")
	}
}

// TestAutotradeTestBuyDispatchesByKind is part of P2-3: the test-buy button
// on the shared autotrade tab used to always call the Webull endpoint
// (API.testBuy), including on the Robinhood page.
func TestAutotradeTestBuyDispatchesByKind(t *testing.T) {
	app, err := os.ReadFile(filepath.Join("..", "..", "web", "js", "app.js"))
	if err != nil {
		t.Fatal(err)
	}
	a := string(app)
	start := strings.Index(a, "getElementById('auto-test-buy')")
	if start < 0 {
		t.Fatal("auto-test-buy handler not found")
	}
	end := strings.Index(a[start:], "});")
	if end < 0 {
		t.Fatal("auto-test-buy handler not closed")
	}
	handler := a[start : start+end]
	if !strings.Contains(handler, "API.rhTestBuy(") {
		t.Fatal("auto-test-buy handler never calls API.rhTestBuy - test buys on the Robinhood page still hit Webull")
	}
	if !strings.Contains(handler, "kind === 'robinhood'") {
		t.Fatal("auto-test-buy handler must branch on the same `kind` pageBroker used to render the tab")
	}
}

// TestAutotradeTabSplitsSharedAndBrokerParts is P2-3: the autotrade tab used
// to render the Webull token panel and the Webull-only "BUY AAL" test button
// unconditionally, even on /robinhood. It must branch by `kind`.
func TestAutotradeTabSplitsSharedAndBrokerParts(t *testing.T) {
	app, err := os.ReadFile(filepath.Join("..", "..", "web", "js", "app.js"))
	if err != nil {
		t.Fatal(err)
	}
	a := string(app)
	start := strings.Index(a, "tab === 'autotrade'")
	if start < 0 {
		t.Fatal("autotrade tab not found")
	}
	end := strings.Index(a[start:], "tab === 'monitor'")
	if end < 0 {
		t.Fatal("autotrade tab body not bounded")
	}
	section := a[start : start+end]
	if !strings.Contains(section, "kind === 'robinhood'") {
		t.Fatal("autotrade tab must branch its connection card on `kind`")
	}
	if !strings.Contains(section, "rhStatus") {
		t.Fatal("autotrade tab must show a Robinhood OAuth status card, not just the Webull token panel")
	}
}

// TestAutotradeCardDisclaimsExecutionWindowAndSlippage covers P2-4: the
// "Окно исполнения" / "Порог проскальзывания" card on the autotrade tab must
// say what each setting actually does. The execution window still does not
// apply to the regular T-1 run; the slippage threshold stopped being a
// post-hoc notification once P1-6 made it floor the entry sizing reserve, and
// the roadmap requires the text to follow that change.
func TestAutotradeCardDisclaimsExecutionWindowAndSlippage(t *testing.T) {
	app, err := os.ReadFile(filepath.Join("..", "..", "web", "js", "app.js"))
	if err != nil {
		t.Fatal(err)
	}
	a := string(app)
	start := strings.Index(a, "tab === 'autotrade'")
	if start < 0 {
		t.Fatal("autotrade tab not found")
	}
	end := strings.Index(a[start:], "tab === 'monitor'")
	if end < 0 {
		t.Fatal("autotrade tab body not bounded")
	}
	section := a[start : start+end]
	if !strings.Contains(section, "Окно исполнения не является предохранителем сделки") {
		t.Fatal("autotrade tab card must say the execution window is not a trade safeguard")
	}
	if !strings.Contains(section, "к регулярному T-1 оно не применяется") {
		t.Fatal("autotrade tab card must say the execution window does not apply to the regular T-1 run")
	}
	if !strings.Contains(section, "резерв") || !strings.Contains(section, "проскальзывания") {
		t.Fatal("autotrade tab card must explain that the slippage threshold now floors the entry sizing reserve")
	}
}

// TestBrokerPageIcons keeps Webull (bull head) and Robinhood (feather) as
// distinct 24px stroke marks in the same Lucide set as the rest of the nav.
func TestBrokerPageIcons(t *testing.T) {
	app, err := os.ReadFile(filepath.Join("..", "..", "web", "js", "app.js"))
	if err != nil {
		t.Fatal(err)
	}
	a := string(app)
	for _, row := range []string{
		"{ to: '/webull', label: 'Webull', icon: 'webull' }",
		"{ to: '/robinhood', label: 'Robinhood', icon: 'robinhood' }",
	} {
		if strings.Count(a, row) < 2 {
			t.Errorf("nav must use distinct broker icon %q in TABS and MOBILE_MENU", row)
		}
	}
	start := strings.Index(a, "const PATHS")
	if start < 0 {
		t.Fatal("missing PATHS")
	}
	end := strings.Index(a[start:], "const PC_COLORS")
	if end < 0 {
		t.Fatal("PATHS not bounded")
	}
	paths := a[start : start+end]
	webull := pathFor(paths, "webull")
	hood := pathFor(paths, "robinhood")
	if webull == "" || hood == "" {
		t.Fatal("PATHS must define webull and robinhood marks")
	}
	if webull == hood {
		t.Fatal("Webull and Robinhood marks must differ")
	}
	if !strings.Contains(webull, "<path") || !strings.Contains(hood, "<path") {
		t.Fatal("broker marks must be SVG paths")
	}
	if strings.Contains(paths, "briefcase") {
		t.Fatal("shared briefcase icon must not remain now that brokers have their own marks")
	}
	page := jsFn(a, "pageBroker")
	if page == "" {
		t.Fatal("pageBroker not found")
	}
	if !strings.Contains(page, "pageHeader(") || !strings.Contains(page, ", kind)") {
		t.Fatal("broker page header must take the webull/robinhood mark")
	}
}

func pathFor(paths, name string) string {
	needle := name + ": '"
	i := strings.Index(paths, needle)
	if i < 0 {
		return ""
	}
	rest := paths[i+len(needle):]
	j := strings.Index(rest, "',")
	if j < 0 {
		j = strings.Index(rest, "'")
	}
	if j < 0 {
		return ""
	}
	return rest[:j]
}

// TestPhase3UIAudit is AU-P3-12 / UI 5.1.2–5.1.4 / AU-P1-5 / a11y item 23:
// authCheck must not run on every navigate, toasts cancel the previous timer,
// overlay dialogs expose role=dialog, and Calendar/Watches show the
// not-imported NYSE fallback copy.
func TestPhase3UIAudit(t *testing.T) {
	app, err := os.ReadFile(filepath.Join("..", "..", "web", "js", "app.js"))
	if err != nil {
		t.Fatal(err)
	}
	a := string(app)

	nav := jsFn(a, "navigate")
	if nav == "" {
		t.Fatal("navigate not found")
	}
	if strings.Contains(nav, "API.authCheck") {
		t.Fatal("navigate must not call API.authCheck on every client route change")
	}

	toastFn := jsFn(a, "toast")
	if toastFn == "" {
		t.Fatal("toast not found")
	}
	if !strings.Contains(toastFn, "clearTimeout") {
		t.Fatal("toast must cancel the previous timer with clearTimeout")
	}

	ov := jsFn(a, "overlay")
	if ov == "" {
		t.Fatal("overlay not found")
	}
	if !strings.Contains(ov, `role="dialog"`) {
		t.Fatal(`modal overlay must set role="dialog"`)
	}
	if !strings.Contains(ov, `aria-modal="true"`) {
		t.Fatal(`modal overlay must set aria-modal="true"`)
	}

	if !strings.Contains(a, "calendar-not-imported") {
		t.Fatal("Calendar/Watches must mark the not-imported calendar widget")
	}
	if !strings.Contains(a, "Календарь не импортирован — используются расчётные праздники NYSE") {
		t.Fatal("Calendar/Watches must show the calculated-NYSE fallback copy")
	}

	paint := jsFn(a, "paintCurrentHero")
	if paint == "" {
		t.Fatal("paintCurrentHero not found")
	}
	if !strings.Contains(paint, "setHeroData") && !strings.Contains(paint, "setData") {
		t.Fatal("paintCurrentHero must reuse the hero chart via setData instead of always destroy+hero")
	}
}
