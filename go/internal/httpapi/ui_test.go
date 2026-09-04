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
	if !strings.Contains(cj, "adj_close") || !strings.Contains(cj, "ema200") {
		t.Fatal("chart CSV must export price/ibs/ema columns like the old TradingChart")
	}
	app, _ := os.ReadFile(filepath.Join(web, "js/app.js"))
	a := string(app)
	css, _ := os.ReadFile(filepath.Join(web, "css/extra.css"))
	extra := string(css)

	for _, route := range []string{"/login", "/data", "/enhance", "/stocks", "/ema", "/multi-ticker-options", "/calendar", "/split", "/watches", "/broker", "/settings", "/results"} {
		if !strings.Contains(a, route) {
			t.Errorf("app.js missing route %s", route)
		}
	}
	for _, label := range []string{
		"Вход", "Данные", "Новые данные", "Акции", "EMA", "Опционы",
		"Календарь торгов", "Сплиты", "Мониторинг", "Кабинет Webull", "Настройки",
	} {
		if !strings.Contains(a, label) {
			t.Errorf("missing page title %s", label)
		}
	}
	if strings.Contains(a, "from 'react'") || strings.Contains(a, "ReactDOM") {
		t.Fatal("UI must be vanilla JS, not React")
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
		"Online",
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
	paths := []string{"/", "/login", "/data", "/enhance", "/stocks", "/ema", "/multi-ticker-options", "/calendar", "/split", "/watches", "/broker", "/settings", "/results"}
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
