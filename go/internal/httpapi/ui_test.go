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

	for _, route := range []string{"/login", "/data", "/enhance", "/stocks", "/ema", "/multi-ticker-options", "/calendar", "/split", "/watches", "/broker", "/webull", "/robinhood", "/settings", "/results"} {
		if !strings.Contains(a, route) {
			t.Errorf("app.js missing route %s", route)
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
	if !strings.Contains(a, "analysisTabs(WATCH_TABS") {
		t.Fatal("monitoring page must keep Сводка/Сделки/Тикеры/EMA tabs on the page")
	}
	if strings.Contains(a, "Webull credentials are not configured") {
		t.Fatal("English Webull credentials banner must be replaced with Russian oracle copy")
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
	if strings.Contains(a, `id="broker-token"`) || strings.Contains(a, "id='broker-token'") {
		t.Fatal("#broker-token must be gone; connection status lives in the header badges")
	}
	for _, tab := range []string{"summary", "tickerCharts", "openDayDrawdown", "single-position", "options-multi", "emaDeviation"} {
		if !strings.Contains(a, tab) {
			t.Errorf("app.js missing %s", tab)
		}
	}
	if !strings.Contains(a, "cal-edit") || !strings.Contains(a, "set-form") || !strings.Contains(a, "split-form") || !strings.Contains(a, "broker-form") {
		t.Fatal("interactive calendar/settings/splits/broker forms missing")
	}
	for _, needle := range []string{
		"includeBaseline",
		"calcTickerRefs",
		"take-profit-percent-input",
		"data-testprov",
		"['alpha_vantage', 'finnhub', 'twelve_data', 'polygon', 'webull']",
		"fmtUsd(fv, 0)",
		"d == null ? 0",
		"data-hero-ticker",
		"['1M', '3M', '6M', '1Y', '3Y', '5Y', 'MAX']",
		"ema-alert-form",
	} {
		if !strings.Contains(a, needle) {
			t.Errorf("missing %s", needle)
		}
	}

	raw, err := os.ReadFile(filepath.Join(web, "tickers.json"))
	if err != nil {
		t.Fatalf("tickers.json: %v", err)
	}
	var catalog []map[string]any
	if err := json.Unmarshal(raw, &catalog); err != nil {
		t.Fatalf("tickers.json parse: %v", err)
	}
	if len(catalog) == 0 {
		t.Fatal("tickers.json is empty")
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
	if len(catalog) == 0 {
		t.Fatal("GET /tickers.json empty catalog")
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

// TestBrokerHeaderLabeledStatuses is C-1/C-2/C-3: three labeled Russian
// badges for this page's broker, one health dictionary, no raw OK/LIVE.
func TestBrokerHeaderLabeledStatuses(t *testing.T) {
	a := readWeb(t, "js/app.js")
	if strings.Contains(a, `id="broker-token"`) {
		t.Fatal("#broker-token must be removed")
	}
	fn := jsFn(a, "brokerHealthText")
	if fn == "" {
		t.Fatal("missing brokerHealthText dictionary next to brokerLabel")
	}
	for _, want := range []string{"активно", "истекает через", "нужна переавторизация", "нет токена", "брокер недоступен"} {
		if !strings.Contains(fn, want) {
			t.Errorf("brokerHealthText missing %q", want)
		}
	}
	page := jsFn(a, "pageBroker")
	if strings.Contains(page, "[LIVE]") || strings.Contains(page, "[OFF]") {
		t.Fatal("broker header must not show raw [LIVE]/[OFF]")
	}
	if strings.Contains(page, "health.status ||") {
		t.Fatal("broker header must not print raw health.status")
	}
	if !strings.Contains(page, "Автоторговля:") || !strings.Contains(page, "Подключение:") {
		t.Fatal("broker header must have labeled Автоторговля and Подключение badges")
	}
	if !strings.Contains(page, "Торговля через") {
		t.Fatal("broker header must have Торговля через Webull|Robinhood badge")
	}
	if !strings.Contains(page, "brokerFlag(ac, kind, 'enabled')") {
		t.Fatal("trade badge must use brokerFlag for this page's broker")
	}
	if !strings.Contains(page, "brokerHealthText(") {
		t.Fatal("connection badge must go through brokerHealthText")
	}
	settings := jsFn(a, "pageSettings")
	if strings.Contains(settings, "торговля остановлена") {
		t.Fatal("settings health is connection status, not «торговля остановлена»")
	}
	if !strings.Contains(settings, "разрешено торговать") {
		t.Fatal("broker checkbox must be «разрешено торговать»")
	}
	if !strings.Contains(settings, "brokerHealthText(") {
		t.Fatal("settings must use the same health dictionary as the header")
	}
	if strings.Contains(settings, "NEEDS_REAUTH") {
		t.Fatal("settings must not print raw NEEDS_REAUTH")
	}
}

// TestBrokerJournalTrackedAndLogsArePerKind is A-4/A-5/A-6.
func TestBrokerJournalTrackedAndLogsArePerKind(t *testing.T) {
	a := readWeb(t, "js/app.js")
	page := jsFn(a, "pageBroker")
	// One row per position with a column block per broker, instead of a
	// «Брокер» column on a per-broker journal.
	if !strings.Contains(page, "legCell(t.webull)") || !strings.Contains(page, "legCell(t.robinhood)") {
		t.Fatal("journal table must show both broker legs")
	}
	if !strings.Contains(page, ">Webull<") || !strings.Contains(page, ">Robinhood<") {
		t.Fatal("journal table must head the two broker column blocks")
	}
	if !strings.Contains(page, "o.broker === kind") {
		t.Fatal("tracked pending/recent must filter o.broker === kind")
	}
	if !strings.Contains(page, "Логи автоторговли (все брокеры)") {
		t.Fatal("autotrade log heading must be «Логи автоторговли (все брокеры)»")
	}
	if strings.Contains(page, "Webull / autotrade логи") {
		t.Fatal("log heading must not stay hardcoded as Webull")
	}
	if !strings.Contains(page, "l.broker") {
		t.Fatal("log line must show the broker field when present")
	}
	if !strings.Contains(a, "API.positions({ includeHidden: true })") {
		t.Fatal("SPA must load the journal from /api/positions")
	}
	form := strings.Index(a, "getElementById('broker-form')")
	if form < 0 {
		t.Fatal("broker-form submit handler not found")
	}
	end := strings.Index(a[form:], "querySelectorAll('[data-edit-bt]')")
	if end < 0 {
		t.Fatal("broker-form handler not bounded")
	}
	submit := a[form : form+end]
	if !strings.Contains(submit, "broker: kind") && !strings.Contains(submit, "rec.broker = kind") {
		t.Fatal("journal POST must stamp rec.broker = kind so a Robinhood add is not stored as webull")
	}
}

// TestBrokerPagesIsolateLoadTabAndDashboard is A-1/A-2/A-3: /webull and
// /robinhood must not share one load flag, one tab, or one untagged dashboard.
func TestBrokerPagesIsolateLoadTabAndDashboard(t *testing.T) {
	a := readWeb(t, "js/app.js")
	if strings.Contains(a, "state.loaded.broker = true") {
		t.Fatal("loaded.broker must be the broker kind, not a shared true")
	}
	if !strings.Contains(a, "state.loaded.broker !== kind") {
		t.Fatal("must reload when loaded.broker !== kind")
	}
	if !strings.Contains(a, "state.loaded.broker = kind") {
		t.Fatal("after a dashboard fetch, loaded.broker must be set to kind")
	}
	page := jsFn(a, "pageBroker")
	if page == "" {
		t.Fatal("pageBroker not found")
	}
	if strings.Contains(page, "state.brokerTab ||") {
		t.Fatal("brokerTab must not be one shared string across /webull and /robinhood")
	}
	if !strings.Contains(page, "state.brokerTab[kind]") {
		t.Fatal("tab must be stored per broker as state.brokerTab[kind]")
	}
	if !strings.Contains(a, "state.brokerTab[kind] = b.dataset.btab") && !strings.Contains(a, "state.brokerTab[kind]=b.dataset.btab") {
		t.Fatal("tab clicks must write state.brokerTab[kind]")
	}
	if !strings.Contains(a, "broker: kind") {
		t.Fatal("dashboard must be tagged with broker: kind")
	}
	if !strings.Contains(page, "state.dashboard.broker !== kind") && !strings.Contains(page, "state.dashboard.broker === kind") {
		t.Fatal("pageBroker must refuse tables when state.dashboard.broker mismatches kind")
	}
	if !strings.Contains(page, "Загрузка…") {
		t.Fatal("mismatched dashboard must render «Загрузка…» instead of the other broker's rows")
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

// TestAutotradeEntriesExitsReadsEngineTruth is B-0: settings checkboxes and
// the autotrade tile must go through one helper that matches live.brokerFlags
// (flat-key fallback only for webull; a missing robinhood key is false).
func TestAutotradeEntriesExitsReadsEngineTruth(t *testing.T) {
	app, err := os.ReadFile(filepath.Join("..", "..", "web", "js", "app.js"))
	if err != nil {
		t.Fatal(err)
	}
	a := string(app)
	if strings.Contains(a, "ac.allowNewEntries !== false") || strings.Contains(a, "ac.allowExits !== false") {
		t.Fatal("Entries/Exits must not treat a missing flag as true (`!== false`); the engine defaults missing keys to false")
	}
	if strings.Contains(a, "function brokerAllowFlag(") {
		t.Fatal("brokerAllowFlag must be renamed to brokerFlag and cover enabled as well as allow*")
	}
	fn := jsFn(a, "brokerFlag")
	if fn == "" {
		t.Fatal("missing brokerFlag helper — must be a straight port of live.brokerFlags")
	}
	if !strings.Contains(fn, "name === 'webull'") {
		t.Fatal("brokerFlag must fall back to flat keys only for webull")
	}
	if !strings.Contains(fn, "hasOwnProperty") {
		t.Fatal("brokerFlag must treat a missing nested key as absent, matching cfgHas")
	}
	page := jsFn(a, "pageSettings")
	if page == "" {
		t.Fatal("pageSettings not found")
	}
	for _, key := range []string{"enabled", "allowNewEntries", "allowExits"} {
		call := "brokerFlag(ac, id, '" + key + "')"
		if !strings.Contains(page, call) {
			t.Errorf("settings %s checkbox must go through %s", key, call)
		}
	}
	if strings.Contains(page, "ac.allowNewEntries") || strings.Contains(page, "ac.allowExits") {
		t.Fatal("Robinhood settings render must not fall back to ac.allowNewEntries / ac.allowExits")
	}
	tile := jsFn(a, "pageBroker")
	if !strings.Contains(tile, "brokerFlag(ac, kind, 'allowNewEntries')") || !strings.Contains(tile, "brokerFlag(ac, kind, 'allowExits')") {
		t.Fatal("Entries/Exits tile must be read per broker via brokerFlag, not one flag shared across brokers")
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
func TestMutationToastsFollowSuccessfulResponse(t *testing.T) {
	app, err := os.ReadFile(filepath.Join("..", "..", "web", "js", "app.js"))
	if err != nil {
		t.Fatal(err)
	}
	a := string(app)
	save := strings.Index(a, "await API.saveSettings(body)")
	if save < 0 {
		t.Fatal("set-form must await API.saveSettings")
	}
	toast := strings.Index(a[save:], "toast('Сохранено')")
	if toast < 0 || toast > 500 {
		t.Fatal("toast «Сохранено» must follow a successful saveSettings response")
	}
	patch := strings.Index(a, "await API.patchPosition")
	if patch < 0 {
		t.Fatal("journal edit must await patchPosition")
	}
	if i := strings.Index(a[patch:], "closeModal()"); i < 0 || i > 400 {
		t.Fatal("broker edit must close the modal only after a successful patch")
	}
	delWatch := strings.Index(a, "await API.deleteWatch")
	if delWatch < 0 {
		t.Fatal("watch delete must await API.deleteWatch")
	}
	delPosition := strings.Index(a, "await API.deletePosition(")
	if delPosition < 0 {
		t.Fatal("position delete must await the DELETE")
	}
}

func TestSetFormSendsOnlyKnownSettingsAndNestedBrokerFlags(t *testing.T) {
	app, err := os.ReadFile(filepath.Join("..", "..", "web", "js", "app.js"))
	if err != nil {
		t.Fatal(err)
	}
	a := string(app)
	start := strings.Index(a, "getElementById('set-form')")
	if start < 0 {
		t.Fatal("set-form submit handler not found")
	}
	end := strings.Index(a[start:], "function defaultStrategy()")
	if end < 0 {
		t.Fatal("set-form handler not bounded")
	}
	form := a[start : start+end]
	if strings.Contains(form, "form.webullAllowEntries?.checked ||") || strings.Contains(form, "form.webullAllowExits?.checked ||") {
		t.Fatal("B-6: set-form must not OR broker checkboxes into flat allowNewEntries/allowExits")
	}
	if strings.Contains(form, "for (const [k, v] of fd.entries())") {
		t.Fatal("P-15: set-form must not dump FormData into PATCH /api/settings")
	}
	if strings.Contains(form, "webull: { enabled: !!form.webullEnabled?.checked") ||
		strings.Contains(form, "robinhood: { enabled: !!form.robinhoodEnabled?.checked") {
		t.Fatal("B-2: set-form must not always send all six broker flags")
	}
	if !strings.Contains(a, "function brokerFlagsPatch(") {
		t.Fatal("missing brokerFlagsPatch — compare checkboxes to brokerFlag and omit unchanged keys")
	}
	if !strings.Contains(form, "brokerFlagsPatch(") {
		t.Fatal("set-form must build brokers via brokerFlagsPatch")
	}
	if !strings.Contains(form, "updates.brokers") {
		t.Fatal("set-form must assign brokers only when the patch is non-empty (only lowIBS changed → no brokers)")
	}
}

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
	if strings.Contains(section, "Окно исполнения не является предохранителем сделки") {
		t.Fatal("autotrade tab must not keep the old «окно не предохранитель» sentence now that Исполнить is back")
	}
	if !strings.Contains(section, `id="auto-execute"`) {
		t.Fatal("autotrade tab must have the Исполнить button")
	}
	if !strings.Contains(a, "API.execute(") {
		t.Fatal("app.js must call API.execute for the Исполнить button")
	}
	if !strings.Contains(section, "регулярному T-1 оно не применяется") {
		t.Fatal("autotrade tab card must say the execution window does not apply to the regular T-1 run")
	}
	if !strings.Contains(section, "резерв") || !strings.Contains(section, "проскальзывания") {
		t.Fatal("autotrade tab card must explain that the slippage threshold now floors the entry sizing reserve")
	}
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

// TestSettingsFormOmitsCommissionFields is P-7: the general settings tab used
// to persist commissionType/Fixed/Percentage that nothing reads. Backtests
// still post defaultStrategy.riskManagement.commission {percentage: 0}; the
// settings form must not grow those field names again.
func TestSettingsFormOmitsCommissionFields(t *testing.T) {
	a := readWeb(t, "js/app.js")
	page := jsFn(a, "pageSettings")
	if page == "" {
		t.Fatal("pageSettings not found")
	}
	for _, name := range []string{"commissionType", "commissionFixed", "commissionPercentage"} {
		if strings.Contains(page, `name="`+name+`"`) {
			t.Errorf("settings form must not render %s", name)
		}
	}
	form := strings.Index(a, "getElementById('set-form')")
	if form < 0 {
		t.Fatal("set-form handler not found")
	}
	end := strings.Index(a[form:], "function defaultStrategy()")
	if end < 0 {
		t.Fatal("set-form handler not bounded")
	}
	handler := a[form : form+end]
	if strings.Contains(handler, "commissionFixed") || strings.Contains(handler, "commissionPercentage") {
		t.Fatal("set-form must not Number()-coerce settings commission fields")
	}
}

// TestLiveIBSThresholdHelpers is P-13: live monitoring thresholds come from
// state.autoConfig via liveLowIBS/liveHighIBS, with DEFAULT_* only as the last
// fallback. Backtest bac / defaultStrategy.parameters stay their own 0.1/0.75.
func TestLiveIBSThresholdHelpers(t *testing.T) {
	a := readWeb(t, "js/app.js")
	if !strings.Contains(a, "const DEFAULT_LOW_IBS = 0.1") || !strings.Contains(a, "const DEFAULT_HIGH_IBS = 0.75") {
		t.Fatal("missing DEFAULT_LOW_IBS / DEFAULT_HIGH_IBS next to CAPITAL_MODES")
	}
	if !strings.Contains(a, "function liveLowIBS()") || !strings.Contains(a, "function liveHighIBS()") {
		t.Fatal("missing liveLowIBS / liveHighIBS helpers")
	}
	for _, fn := range []string{"pageWatches", "pageBroker", "pageSettings"} {
		block := jsFn(a, fn)
		if block == "" {
			t.Fatalf("%s not found", fn)
		}
		if strings.Contains(block, "?? 0.1") || strings.Contains(block, "?? 0.75") {
			t.Errorf("%s still falls back to a live IBS literal instead of liveLowIBS/liveHighIBS", fn)
		}
	}
	if strings.Contains(a, "ibs < 0.10") || strings.Contains(a, "ibs > 0.75") {
		t.Fatal("broker monitor IBS color must not hardcode 0.10/0.75")
	}
	trades := jsFn(a, "tradesTable")
	if trades == "" {
		t.Fatal("tradesTable not found")
	}
	if !strings.Contains(trades, "liveHighIBS()") {
		t.Fatal("hasExitProblem must use liveHighIBS()")
	}
	addWatch := strings.Index(a, "API.addWatch(")
	if addWatch < 0 {
		t.Fatal("API.addWatch not found")
	}
	addCallEnd := strings.Index(a[addWatch:], ");")
	if addCallEnd < 0 {
		t.Fatal("API.addWatch call not closed")
	}
	addCall := a[addWatch : addWatch+addCallEnd]
	if strings.Contains(addCall, "0.1") || strings.Contains(addCall, "0.75") {
		t.Fatal("addWatch must not hardcode 0.1/0.75; send liveLowIBS/liveHighIBS")
	}
	if !strings.Contains(addCall, "liveLowIBS()") || !strings.Contains(addCall, "liveHighIBS()") {
		t.Fatal("addWatch must send liveLowIBS/liveHighIBS")
	}
	ds := jsFn(a, "defaultStrategy")
	if !strings.Contains(ds, "lowIBS: 0.1, highIBS: 0.75") {
		t.Fatal("defaultStrategy.parameters must stay 0.1/0.75")
	}
}

// TestWatchAndBrokerIBSUseStrictInequalityGlyphs is P-3: entry/exit IBS
// comparisons are strict (`ibs < lowIBS`, `ibs > highIBS`). The watch table
// and broker monitor must print < / >, not ≤ / ≥. EMA zone labels stay
// «Покупка ≤ %» / «Продажа ≥ %».
func TestWatchAndBrokerIBSUseStrictInequalityGlyphs(t *testing.T) {
	a := readWeb(t, "js/app.js")
	watches := jsFn(a, "pageWatches")
	if watches == "" {
		t.Fatal("pageWatches not found")
	}
	rowStart := strings.Index(watches, "const rows = (state.watches")
	if rowStart < 0 {
		t.Fatal("watch table rows not found")
	}
	rowEnd := strings.Index(watches[rowStart:], "const alerts")
	if rowEnd < 0 {
		t.Fatal("watch table rows not bounded")
	}
	watchRows := watches[rowStart : rowStart+rowEnd]
	if strings.Contains(watchRows, "≤") || strings.Contains(watchRows, "≥") {
		t.Fatal("watch table IBS cells must not use ≤/≥")
	}
	if !strings.Contains(watches, "Вход, IBS") || !strings.Contains(watches, "Выход, IBS") {
		t.Fatal("watch table headers must be «Вход, IBS <» / «Выход, IBS >»")
	}
	if !strings.Contains(watches, "Покупка ≤ %") || !strings.Contains(watches, "Продажа ≥ %") {
		t.Fatal("EMA labels «Покупка ≤ %» / «Продажа ≥ %» must stay")
	}

	broker := jsFn(a, "pageBroker")
	monStart := strings.Index(broker, "tab === 'monitor'")
	if monStart < 0 {
		t.Fatal("broker monitor tab not found")
	}
	monEnd := strings.Index(broker[monStart:], "tab === 'logs'")
	if monEnd < 0 {
		monEnd = strings.Index(broker[monStart:], "} else {")
	}
	if monEnd < 0 {
		t.Fatal("broker monitor tab not bounded")
	}
	monitor := broker[monStart : monStart+monEnd]
	if strings.Contains(monitor, "≤") || strings.Contains(monitor, "≥") {
		t.Fatal("broker monitor IBS cells must not use ≤/≥")
	}
	if strings.Contains(monitor, ">Threshold<") || strings.Contains(monitor, "'Threshold'") {
		t.Fatal("broker monitor must not keep the vague Threshold column")
	}
	if !strings.Contains(monitor, "Вход, IBS") || !strings.Contains(monitor, "Выход, IBS") {
		t.Fatal("broker monitor headers must be «Вход, IBS <» / «Выход, IBS >»")
	}
}

// TestBrokerMonitorIBSColorUsesRowThresholds is P-4: IBS cell colour must
// follow the row's w.lowIBS / w.highIBS (strict < / >), falling back to
// liveLowIBS/liveHighIBS, not the literals 0.10 / 0.75.
func TestBrokerMonitorIBSColorUsesRowThresholds(t *testing.T) {
	a := readWeb(t, "js/app.js")
	broker := jsFn(a, "pageBroker")
	monStart := strings.Index(broker, "tab === 'monitor'")
	if monStart < 0 {
		t.Fatal("broker monitor tab not found")
	}
	monitor := broker[monStart:]
	if !strings.Contains(monitor, "w.lowIBS") || !strings.Contains(monitor, "w.highIBS") {
		t.Fatal("broker monitor IBS color must read w.lowIBS / w.highIBS")
	}
	if strings.Contains(monitor, "ibs < 0.10") || strings.Contains(monitor, "ibs > 0.75") {
		t.Fatal("broker monitor IBS color must not use literals 0.10 / 0.75")
	}
	if !strings.Contains(monitor, "ibs < lo") || !strings.Contains(monitor, "ibs > hi") {
		t.Fatal("broker monitor IBS color must use strict ibs < lo / ibs > hi")
	}
}

// TestSettingsAPITabShowsPolygonKeyStatus is P-9: Polygon is a provider
// button but the key lives in POLYGON_API_KEY / stored settings, not an
// input on the API tab. The SPA must surface polygonApiKeyConfigured.
func TestSettingsAPITabShowsPolygonKeyStatus(t *testing.T) {
	a := readWeb(t, "js/app.js")
	page := jsFn(a, "pageSettings")
	if page == "" {
		t.Fatal("pageSettings not found")
	}
	if !strings.Contains(page, "polygonApiKeyConfigured") {
		t.Fatal("API tab must read polygonApiKeyConfigured from GET /api/settings")
	}
	if !strings.Contains(page, "ключ задан") || !strings.Contains(page, "ключ не задан") {
		t.Fatal("API tab must show «ключ задан» / «ключ не задан» next to Polygon")
	}
	if !strings.Contains(page, "POLYGON_API_KEY") {
		t.Fatal("API tab must say the Polygon key lives in POLYGON_API_KEY")
	}
	if strings.Contains(page, `name="polygonApiKey"`) {
		t.Fatal("API tab must not offer a polygonApiKey input")
	}
}

// TestAutotradeDecisionReadsBrokerDecisions is P-5: the «Последнее решение»
// tile must read lastResult.brokerDecisions[kind] and only fall back to the
// showcase decision when that map entry is missing. Reasons go through the
// single SPA dictionary (decisionReasonText).
func TestAutotradeDecisionReadsBrokerDecisions(t *testing.T) {
	a := readWeb(t, "js/app.js")
	if !strings.Contains(a, "brokerDecisions") {
		t.Fatal("app.js must read lastResult.brokerDecisions")
	}
	if strings.Count(a, "function decisionReasonText(") != 1 {
		t.Fatal("SPA must have exactly one decisionReasonText dictionary")
	}
	auto := jsFn(a, "pageBroker")
	start := strings.Index(auto, "tab === 'autotrade'")
	if start < 0 {
		t.Fatal("autotrade tab not found")
	}
	end := strings.Index(auto[start:], "tab === 'monitor'")
	if end < 0 {
		t.Fatal("autotrade tab not bounded")
	}
	section := auto[start : start+end]
	if !strings.Contains(section, "brokerDecisions") || !strings.Contains(section, "[kind]") {
		t.Fatal("Последнее решение must read brokerDecisions[kind]")
	}
	if !strings.Contains(section, "decisionReasonText(") {
		t.Fatal("decision reason on the tile must go through decisionReasonText")
	}
	dict := jsFn(a, "decisionReasonText")
	for _, key := range []string{"broker_disabled", "NEEDS_REAUTH", "allowNewEntries_false", "entries_disabled", "exits_disabled", "no_signal"} {
		if !strings.Contains(dict, key) {
			t.Errorf("decisionReasonText missing %s", key)
		}
	}
}

// TestInitialCapitalSettingIsTheSingleDefault is P-10: monitorStats,
// defaultStrategy, and calc metrics used to hardcode 10000 while pretending
// to read state.settings.initialCapital. One helper plus the settings field.
func TestInitialCapitalSettingIsTheSingleDefault(t *testing.T) {
	a := readWeb(t, "js/app.js")
	if !strings.Contains(a, "const DEFAULT_INITIAL_CAPITAL = 10000") {
		t.Fatal("missing DEFAULT_INITIAL_CAPITAL")
	}
	if !strings.Contains(a, "function initialCapital()") {
		t.Fatal("missing initialCapital helper")
	}
	if strings.Count(a, "initialCapital: 10000") != 0 {
		t.Fatal("app.js must not hardcode initialCapital: 10000; use initialCapital()")
	}
	page := jsFn(a, "pageSettings")
	if !strings.Contains(page, `name="initialCapital"`) {
		t.Fatal("settings general tab must expose initialCapital")
	}
	stats := jsFn(a, "monitorStats")
	if !strings.Contains(stats, "initialCapital()") {
		t.Fatal("monitorStats must use initialCapital()")
	}
	ds := jsFn(a, "defaultStrategy")
	if !strings.Contains(ds, "initialCapital: initialCapital()") {
		t.Fatal("defaultStrategy.riskManagement.initialCapital must use the helper")
	}
}

// TestWatchThresholdsAreEditable is P-8: adding a ticker must not stamp
// hardcoded 0.1/0.75, and /watches must expose a «Пороги» control that PATCHes
// only lowIBS/highIBS.
func TestWatchThresholdsAreEditable(t *testing.T) {
	app := readWeb(t, "js/app.js")
	api := readWeb(t, "js/api.js")
	addWatch := strings.Index(app, "API.addWatch(")
	if addWatch < 0 {
		t.Fatal("API.addWatch not found")
	}
	addEnd := strings.Index(app[addWatch:], ");")
	if addEnd < 0 {
		t.Fatal("API.addWatch call not closed")
	}
	addCall := app[addWatch : addWatch+addEnd]
	if strings.Contains(addCall, "0.1, highIBS: 0.75") || strings.Contains(addCall, "lowIBS: 0.1") {
		t.Fatal("addWatch must not contain the literals 0.1, highIBS: 0.75")
	}
	if !strings.Contains(app, "data-watch-thr") || !strings.Contains(app, "Изменить пороги") {
		t.Fatal("watches table must have a «Пороги» control")
	}
	if !strings.Contains(api, "patchWatch:") || !strings.Contains(api, "API.patch('/api/telegram/watch/'") {
		t.Fatal("api.js must define API.patchWatch → PATCH /api/telegram/watch/{symbol}")
	}
	modal := jsFn(app, "openWatchThresholdsModal")
	if modal == "" {
		t.Fatal("openWatchThresholdsModal not found")
	}
	if !strings.Contains(modal, "API.patchWatch(") {
		t.Fatal("Пороги modal must call API.patchWatch")
	}
	if strings.Contains(modal, "isOpenPosition") || strings.Contains(modal, "entryPrice") || strings.Contains(modal, "entryDate") || strings.Contains(modal, "currentTradeId") {
		t.Fatal("threshold PATCH must not send isOpenPosition/entry_*")
	}
}

// TestEmaPresetChangeRunsBacktest: picking a saved EMA preset must keep that
// option selected after re-render and immediately run the same calc as the
// form submit. The empty «Выбрать пресет» row is a no-op.
func TestEmaPresetChangeRunsBacktest(t *testing.T) {
	a := readWeb(t, "js/app.js")
	form := jsFn(a, "emaFormHTML")
	if form == "" {
		t.Fatal("emaFormHTML not found")
	}
	if !strings.Contains(form, "state.emaPresetId") {
		t.Fatal("ema preset <option> must mark the selected preset so the dropdown does not snap back")
	}
	start := strings.Index(a, "getElementById('ema-preset')?.addEventListener('change'")
	if start < 0 {
		t.Fatal("ema-preset change handler not found")
	}
	endRel := strings.Index(a[start:], "bindEmaZones")
	if endRel < 0 {
		t.Fatal("ema-preset change handler not bounded")
	}
	handler := a[start : start+endRel]
	runAt := strings.Index(handler, "runEma(")
	if runAt < 0 {
		runAt = strings.Index(handler, "requestSubmit(")
	}
	if runAt < 0 {
		t.Fatal("selecting an EMA preset must run the backtest, not only fill the form")
	}
	guardAt := strings.Index(handler, "if (!pset)")
	if guardAt < 0 {
		guardAt = strings.Index(handler, "if (!id)")
	}
	if guardAt < 0 || guardAt > runAt {
		t.Fatal("empty «Выбрать пресет» must not run the backtest")
	}
}

// TestStocksPageHasPresetsNotDefaultHint: the dashed «↩ AAPL, MSFT, AMZN, MAGS»
// restore control is gone. Stocks keeps ticker lists as named presets, same
// as EMA — select, save, delete, and picking one runs the backtest.
func TestStocksPageHasPresetsNotDefaultHint(t *testing.T) {
	a := readWeb(t, "js/app.js")
	params := jsFn(a, "stocksParams")
	if params == "" {
		t.Fatal("stocksParams not found")
	}
	if strings.Contains(params, "reset-tickers") {
		t.Fatal("stocks must not keep the dashed default-ticker hint; that list is a preset now")
	}
	for _, id := range []string{`id="stock-preset"`, `id="stock-preset-save"`, `id="stock-preset-del"`} {
		if !strings.Contains(params, id) {
			t.Fatalf("stocks params missing %s (EMA-style presets)", id)
		}
	}
	if !strings.Contains(params, "state.stockPresetId") {
		t.Fatal("stock preset <option> must mark the selected preset so the dropdown does not snap back")
	}
	start := strings.Index(a, "getElementById('stock-preset')?.addEventListener('change'")
	if start < 0 {
		t.Fatal("stock-preset change handler not found")
	}
	endRel := strings.Index(a[start:], "getElementById('run-bt')")
	if endRel < 0 {
		endRel = strings.Index(a[start:], "querySelectorAll('[data-stab]')")
	}
	if endRel < 0 {
		t.Fatal("stock-preset change handler not bounded")
	}
	handler := a[start : start+endRel]
	runAt := strings.Index(handler, "runStocks(")
	if runAt < 0 {
		t.Fatal("selecting a stocks preset must run the backtest, not only fill the form")
	}
	guardAt := strings.Index(handler, "if (!pset)")
	if guardAt < 0 {
		guardAt = strings.Index(handler, "if (!id)")
	}
	if guardAt < 0 || guardAt > runAt {
		t.Fatal("empty «Выбрать пресет» must not run the backtest")
	}
}

// TestWatchesSimulateButtonIsT1 is F-30: confirmations is T-1 (1 minute),
// not T-2. The watches control and toasts must match that stage.
func TestWatchesSimulateButtonIsT1(t *testing.T) {
	a := readWeb(t, "js/app.js")
	watches := jsFn(a, "pageWatches")
	if watches == "" {
		t.Fatal("pageWatches not found")
	}
	if !strings.Contains(watches, ">Тест T-1<") {
		t.Fatal("watches page must have «Тест T-1»")
	}
	if strings.Contains(watches, ">Тест T-2<") {
		t.Fatal("watches page must not have «Тест T-2»")
	}
	after := jsFn(a, "afterRender")
	if after == "" {
		t.Fatal("afterRender not found")
	}
	start := strings.Index(after, "getElementById('watch-t1')")
	if start < 0 {
		t.Fatal("watch-t1 click handler not found")
	}
	endRel := strings.Index(after[start:], "getElementById('watch-prices')")
	if endRel < 0 {
		t.Fatal("watch-t1 handler not bounded")
	}
	handler := after[start : start+endRel]
	if !strings.Contains(handler, "simulate('confirmations')") {
		t.Fatal("T-1 button must still call simulate('confirmations')")
	}
	if strings.Contains(handler, "T-2") {
		t.Fatal("T-1 toasts must not say T-2")
	}
}

func TestWatchPricesReadsActualizeResultFields(t *testing.T) {
	a := readWeb(t, "js/app.js")
	after := jsFn(a, "afterRender")
	start := strings.Index(after, "getElementById('watch-prices')")
	if start < 0 {
		t.Fatal("watch-prices handler not found")
	}
	handler := after[start:]
	if i := strings.Index(handler, "getElementById('watch-manual')"); i > 0 {
		handler = handler[:i]
	}
	if !strings.Contains(handler, "prices.count") || !strings.Contains(handler, "failedTickers") {
		t.Fatal("watch-prices must read ActualizeResult count and failedTickers")
	}
	if strings.Contains(handler, "updatedCount") {
		t.Fatal("must not use Node leftover updatedCount")
	}
}

func TestDatasetExportRevokesObjectURL(t *testing.T) {
	a := readWeb(t, "js/app.js")
	start := strings.Index(a, "querySelectorAll('[data-export]')")
	if start < 0 {
		t.Fatal("dataset export handler not found")
	}
	chunk := a[start:]
	if i := strings.Index(chunk, "querySelectorAll('[data-edit]')"); i > 0 {
		chunk = chunk[:i]
	}
	if !strings.Contains(chunk, "revokeObjectURL") {
		t.Fatal("dataset export must revokeObjectURL like the other exports")
	}
}

func TestToastIsPoliteStatus(t *testing.T) {
	a := readWeb(t, "js/app.js")
	start := strings.Index(a, "function toast(")
	if start < 0 {
		t.Fatal("toast not found")
	}
	fn := a[start : start+800]
	if !strings.Contains(fn, `setAttribute('role', 'status')`) || !strings.Contains(fn, "aria-live") {
		t.Fatal("toast must be role=status aria-live for screen readers")
	}
}

func TestAPIFetchUsesAbortController(t *testing.T) {
	a := readWeb(t, "js/api.js")
	start := strings.Index(a, "async req(")
	if start < 0 {
		t.Fatal("API.req not found")
	}
	fn := a[start:]
	if i := strings.Index(fn, "\n  get:"); i > 0 {
		fn = fn[:i]
	}
	if !strings.Contains(fn, "AbortController") {
		t.Fatal("API.req must abort hung fetches")
	}
	if !strings.Contains(fn, "timeout") {
		t.Fatal("API.req must take a timeout")
	}
	if !strings.Contains(a, "update-all") || !strings.Contains(a, "timeout: 600000") {
		t.Fatal("update-all must keep a long timeout past WriteTimeout")
	}
}

func TestAutoExecuteUsesWithBusy(t *testing.T) {
	a := readWeb(t, "js/app.js")
	if !strings.Contains(a, "getElementById('auto-execute')") {
		t.Fatal("auto-execute handler missing")
	}
}

func TestLongActionsDisableTheirButtons(t *testing.T) {
	a := readWeb(t, "js/app.js")
	if !strings.Contains(a, "function withBusy(") {
		t.Fatal("need withBusy so double-clicks cannot start a second long action")
	}
	for _, id := range []string{"watch-prices", "watch-t11", "watch-t1"} {
		start := strings.Index(a, "getElementById('"+id+"')")
		if start < 0 {
			t.Fatalf("%s handler not found", id)
		}
		chunk := a[start:]
		if i := strings.Index(chunk, "getElementById("); i > 0 && id != "watch-prices" {
			// keep a slice of this listener
		}
		if i := strings.Index(chunk[20:], "document.getElementById"); i > 0 {
			chunk = chunk[:20+i]
		}
		if !strings.Contains(chunk, "withBusy") && !strings.Contains(chunk, ".disabled") {
			t.Fatalf("%s must disable the button while the request runs", id)
		}
	}
	closeStart := strings.Index(a, "[data-close-pos]")
	if closeStart < 0 {
		t.Fatal("close-position handler not found")
	}
	closeChunk := a[closeStart : closeStart+900]
	if !strings.Contains(closeChunk, "withBusy") && !strings.Contains(closeChunk, ".disabled") {
		t.Fatal("close position must disable the button while the order is in flight")
	}
	for _, id := range []string{"auto-execute", "auto-test-buy"} {
		start := strings.Index(a, "getElementById('"+id+"')")
		if start < 0 {
			t.Fatalf("%s handler not found", id)
		}
		chunk := a[start:]
		if i := strings.Index(chunk[20:], "document.getElementById"); i > 0 {
			chunk = chunk[:20+i]
		}
		if !strings.Contains(chunk, "withBusy") {
			t.Fatalf("%s must wrap the in-flight request in withBusy", id)
		}
	}
	refStart := strings.Index(a, "querySelectorAll('[data-refresh]')")
	if refStart < 0 {
		t.Fatal("dataset refresh handler not found")
	}
	refChunk := a[refStart:]
	if i := strings.Index(refChunk, "if (p === '/enhance')"); i > 0 {
		refChunk = refChunk[:i]
	}
	if !strings.Contains(refChunk, "withBusy") && !strings.Contains(refChunk, "disabled") {
		t.Fatal("dataset refresh must disable the button")
	}
}

func TestBuyHoldPaintRemovesOnlyChartBh(t *testing.T) {
	a := readWeb(t, "js/app.js")
	paint := strings.Index(a, "Charts.destroyIn(host)")
	if paint < 0 {
		t.Fatal("buy-hold paint must call Charts.destroyIn(host)")
	}
	chunk := a[max(0, paint-200) : paint+120]
	if !strings.Contains(chunk, "chart-bh") {
		t.Fatal("destroyIn must target the chart-bh container")
	}
	if strings.Contains(chunk, "Charts.destroy()") || strings.Contains(chunk, "Charts.live.splice(0)") {
		t.Fatal("buy-hold paint must not destroy every live chart")
	}
	c := readWeb(t, "js/charts.js")
	if !strings.Contains(c, "destroyIn(container)") {
		t.Fatal("charts.js must expose destroyIn so one container can be removed")
	}
}

func TestKeepChartsSkipsPageRootInnerHTML(t *testing.T) {
	a := readWeb(t, "js/app.js")
	start := strings.Index(a, "async function renderPage")
	if start < 0 {
		t.Fatal("renderPage not found")
	}
	chunk := a[start:]
	if i := strings.Index(chunk[20:], "\n  function "); i > 0 {
		chunk = chunk[:20+i]
	}
	if !strings.Contains(chunk, "if (!opts.keepCharts)") || !strings.Contains(chunk, "innerHTML = pageHTML()") {
		t.Fatal("keepCharts must skip innerHTML that would orphan chart instances")
	}
}

func TestLoadQuoteIgnoresStaleSequence(t *testing.T) {
	a := readWeb(t, "js/app.js")
	start := strings.Index(a, "async function loadQuote")
	if start < 0 {
		t.Fatal("loadQuote not found")
	}
	chunk := a[start:]
	if i := strings.Index(chunk[20:], "\n  function "); i > 0 {
		chunk = chunk[:20+i]
	}
	if !strings.Contains(chunk, "quoteSeq") {
		t.Fatal("loadQuote must drop stale in-flight responses")
	}
}

func TestTickerMenuDoesNotDestroyCharts(t *testing.T) {
	a := readWeb(t, "js/app.js")
	start := strings.Index(a, "querySelectorAll('[data-menu]')")
	if start < 0 {
		t.Fatal("ticker menu handler not found")
	}
	chunk := a[start:]
	if i := strings.Index(chunk, "querySelectorAll('[data-del]')"); i > 0 {
		chunk = chunk[:i]
	}
	if strings.Contains(chunk, "renderPage()") && !strings.Contains(chunk, "keepCharts") {
		t.Fatal("ticker-menu must not Charts.destroy via a full renderPage")
	}
	if !strings.Contains(chunk, "keepCharts") && !strings.Contains(chunk, "updateChrome") {
		t.Fatal("ticker-menu must keepCharts or update the menu DOM in place")
	}
	away := a
	if i := strings.Index(a, "state.menuTicker && !e.target.closest('[data-menu]')"); i >= 0 {
		away = a[i:]
		if j := strings.Index(away, "if (state.mobileOpen"); j > 0 {
			away = away[:j]
		}
	}
	if strings.Contains(away, "renderPage()") && !strings.Contains(away, "keepCharts") {
		t.Fatal("closing the ticker menu must not Charts.destroy")
	}
}

func TestStatusPingUpdatesChromeNotFullPage(t *testing.T) {
	a := readWeb(t, "js/app.js")
	after := jsFn(a, "afterRender")
	start := strings.Index(after, "API.status()")
	if start < 0 {
		t.Fatal("status ping not found")
	}
	chunk := after[start:]
	if i := strings.Index(chunk, "document.getElementById('view-list')"); i > 0 {
		chunk = chunk[:i]
	}
	if strings.Contains(chunk, "renderPage(") || strings.Contains(chunk, "renderPage()") {
		t.Fatal("status ping must not destroy charts via renderPage")
	}
	if !strings.Contains(chunk, "updateChrome") {
		t.Fatal("status ping must update the footer badge only")
	}
}

func TestRenderPageIgnoresStaleGeneration(t *testing.T) {
	a := readWeb(t, "js/app.js")
	if !strings.Contains(a, "pageGen") {
		t.Fatal("renderPage must drop stale generations")
	}
	rp := jsFn(a, "renderPage")
	if !strings.Contains(rp, "pageGen") {
		t.Fatal("renderPage must bump and check pageGen")
	}
}

func TestUpdateChromeSkipsNullBadge(t *testing.T) {
	a := readWeb(t, "js/app.js")
	fn := jsFn(a, "updateChrome")
	if strings.Contains(fn, "replaceWith(wrap.firstElementChild)") {
		t.Fatal("replaceWith(null) inserts the text null; guard firstElementChild")
	}
	if !strings.Contains(fn, "firstElementChild") {
		t.Fatal("updateChrome must replace the badge node")
	}
}

// A ?tickers= link owns the page: it fills the field, drops the previous
// backtest and asks for a new one. A plain navigation without the query keeps
// whatever the user had typed instead of blanking it.
func TestURLTickersDriveStocksPage(t *testing.T) {
	a := readWeb(t, "js/app.js")
	if !strings.Contains(jsFn(a, "navigate"), "applyURLTickers()") {
		t.Fatal("navigate must apply ?tickers= from the URL")
	}
	fn := jsFn(a, "applyURLTickers")
	if fn == "" {
		t.Fatal("applyURLTickers missing")
	}
	if !strings.Contains(fn, "if (!q) return;") {
		t.Fatal("no ?tickers= must leave the ticker field alone")
	}
	for _, want := range []string{"state.result = null", "state.stockTab = 'summary'", "state.pendingRun = true", "state.leverage = 100"} {
		if !strings.Contains(fn, want) {
			t.Fatalf("applyURLTickers must set %s", want)
		}
	}
	if !strings.Contains(a, "state.pendingRun = false;\n        runStocks();") {
		t.Fatal("the stocks page must consume pendingRun by running the backtest")
	}
	if strings.Contains(a, "tickerInput = ''") {
		t.Fatal("navigation must not blank the ticker field")
	}
}

// Провал чтения позиций (Webull отвечает 429 на пачку запросов панели) раньше
// выглядел на странице как «открытых позиций нет».
func TestPositionsReadErrorIsShown(t *testing.T) {
	app, err := os.ReadFile(filepath.Join("..", "..", "web", "js/app.js"))
	if err != nil {
		t.Fatal(err)
	}
	a := string(app)
	for _, want := range []string{"dashObj.positionsError", "Позиции не прочитаны"} {
		if !strings.Contains(a, want) {
			t.Errorf("app.js missing %s", want)
		}
	}
}
