package httpapi

import (
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

	for _, copy := range []string{
		"Запустить бэктест",
		"Библиотека датасетов",
		"Общие", "API", "Telegram", "Интерфейс", "Автоторговля",
		"Список", "Добавить", "Импорт", "Экспорт", "Webull API",
		"Кабинет Webull", "[OFF]", "[LIVE]",
		"take-profit-percent-input",
		"200%",
		"NYSE",
	} {
		if !strings.Contains(a, copy) {
			t.Errorf("missing page copy %s", copy)
		}
	}
	for _, tab := range []string{"summary", "tickerCharts", "openDayDrawdown", "single-position", "options-multi"} {
		if !strings.Contains(a, tab) {
			t.Errorf("app.js missing %s", tab)
		}
	}
	if !strings.Contains(a, "cal-edit") || !strings.Contains(a, "set-form") || !strings.Contains(a, "split-form") || !strings.Contains(a, "broker-form") {
		t.Fatal("interactive calendar/settings/splits/broker forms missing")
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
}
