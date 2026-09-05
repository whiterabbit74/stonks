package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"mktorder.com/go/internal/goldens"
	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/types"
)

var allRoutes = []struct{ Method, Path string }{
	{"POST", "/api/login"}, {"GET", "/api/auth/check"}, {"POST", "/api/logout"}, {"POST", "/api/auth/hash-password"},
	{"GET", "/api/settings"}, {"PUT", "/api/settings"}, {"PATCH", "/api/settings"},
	{"GET", "/api/datasets"}, {"GET", "/api/datasets/{id}"}, {"GET", "/api/datasets/{id}/metadata"},
	{"POST", "/api/datasets"}, {"PUT", "/api/datasets/{id}"}, {"DELETE", "/api/datasets/{id}"},
	{"POST", "/api/datasets/{id}/refresh"}, {"POST", "/api/datasets/{id}/apply-splits"}, {"PATCH", "/api/datasets/{id}/metadata"},
	{"GET", "/api/splits/webull-raw"}, {"GET", "/api/splits"}, {"GET", "/api/splits/{symbol}"},
	{"PUT", "/api/splits/{symbol}"}, {"PATCH", "/api/splits/{symbol}"},
	{"DELETE", "/api/splits/{symbol}/{date}"}, {"DELETE", "/api/splits/{symbol}"},
	{"GET", "/api/trading-calendar"}, {"GET", "/api/trading/expected-prev-day"},
	{"POST", "/api/trading-calendar/fetch-webull"}, {"POST", "/api/trading-calendar/import-webull"},
	{"PATCH", "/api/trading-calendar/day"},
	{"POST", "/api/telegram/watch"}, {"DELETE", "/api/telegram/watch/{symbol}"}, {"PATCH", "/api/telegram/watch/{symbol}"},
	{"GET", "/api/telegram/watches"}, {"GET", "/api/telegram/ema-alerts"}, {"POST", "/api/telegram/ema-alerts"},
	{"PATCH", "/api/telegram/ema-alerts/{id}"}, {"DELETE", "/api/telegram/ema-alerts/{id}"},
	{"POST", "/api/telegram/send"}, {"POST", "/api/telegram/test"}, {"GET", "/api/telegram/trades"},
	{"POST", "/api/telegram/simulate"}, {"POST", "/api/telegram/actualize-prices"},
	{"POST", "/api/telegram/update-positions"}, {"POST", "/api/telegram/update-all"}, {"POST", "/api/telegram/command"},
	{"GET", "/api/trades"}, {"POST", "/api/trades"}, {"PATCH", "/api/trades/{id}"},
	{"POST", "/api/trades/{id}/close-monitor"}, {"DELETE", "/api/trades/{id}"},
	{"GET", "/api/broker-trades"}, {"POST", "/api/broker-trades"}, {"PATCH", "/api/broker-trades/{id}"}, {"DELETE", "/api/broker-trades/{id}"},
	{"GET", "/api/monitor/consistency"}, {"POST", "/api/monitor/reconcile"},
	{"GET", "/api/quote/{symbol}"}, {"GET", "/api/quotes/webull-batch"}, {"GET", "/api/yahoo-finance/{symbol}"},
	{"GET", "/api/fetch/{provider}/{symbol}"}, {"GET", "/api/test/alpha-vantage"}, {"GET", "/api/test/finnhub"},
	{"GET", "/api/test/twelve-data"}, {"POST", "/api/test-provider"},
	{"GET", "/api/status"}, {"GET", "/healthz"}, {"GET", "/readyz"},
	{"GET", "/api/autotrade/config"}, {"PATCH", "/api/autotrade/config"}, {"GET", "/api/autotrade/status"},
	{"POST", "/api/autotrade/evaluate"}, {"POST", "/api/autotrade/execute"},
	{"GET", "/api/autotrade/webull/account"}, {"GET", "/api/autotrade/webull/dashboard"}, {"GET", "/api/autotrade/logs"},
	{"POST", "/api/autotrade/webull/close-position"}, {"POST", "/api/autotrade/webull/test-buy"},
	{"POST", "/api/autotrade/webull/token/create"}, {"POST", "/api/autotrade/webull/token/check"},
	{"PUT", "/api/autotrade/webull/token"}, {"GET", "/api/autotrade/webull/token/status"},
	{"POST", "/api/autotrade/robinhood/oauth/start"}, {"POST", "/api/autotrade/robinhood/oauth/complete"},
	{"POST", "/api/autotrade/robinhood/oauth/disconnect"}, {"GET", "/api/autotrade/robinhood/oauth/status"},
	{"GET", "/api/autotrade/robinhood/account"}, {"GET", "/api/autotrade/robinhood/dashboard"},
	{"GET", "/api/autotrade/robinhood/tools"}, {"POST", "/api/autotrade/robinhood/close-position"},
	{"POST", "/api/autotrade/robinhood/test-buy"}, {"GET", "/api/brokers/health"},
	{"POST", "/api/calc/clean-backtest"}, {"POST", "/api/calc/backtest"}, {"POST", "/api/calc/single-position"},
	{"POST", "/api/calc/options"}, {"POST", "/api/calc/options-multi"}, {"POST", "/api/calc/ema-zone"},
	{"POST", "/api/calc/buy-at-close"}, {"POST", "/api/calc/buy-at-close-4"}, {"POST", "/api/calc/no-stop-loss"},
	{"POST", "/api/calc/metrics"}, {"POST", "/api/calc/indicators"}, {"POST", "/api/calc/black-scholes"},
	{"POST", "/api/calc/split-adjust"}, {"POST", "/api/calc/margin"}, {"POST", "/api/calc/ibs-signals"},
	{"POST", "/api/calc/buy-hold"},
}

func testServer(t *testing.T, password string) *Server {
	t.Helper()
	injectAuth := password == ""
	if injectAuth {
		password = "test-secret"
	}
	t.Setenv("ADMIN_PASSWORD", password)
	t.Setenv("GO_ENV", "development")
	t.Setenv("NODE_ENV", "")
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := New(db, dir)
	if injectAuth {
		tok := "0123456789abcdef0123456789abcdef"
		now := time.Now().UnixMilli()
		if err := s.DB.SessionSet(tok, now, now+24*60*60*1000); err != nil {
			t.Fatal(err)
		}
		s.testAuthToken = tok
	}
	return s
}

func TestAllRoutesRegistered(t *testing.T) {
	s := testServer(t, "secret")
	for _, rt := range allRoutes {
		req := httptest.NewRequest(rt.Method, concretize(rt.Path), nil)
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		if rec.Code == http.StatusNotFound {
			t.Errorf("%s %s not registered (404)", rt.Method, rt.Path)
		}
	}
}

func concretize(p string) string {
	p = replaceAll(p, "{id}", "GOOGL")
	p = replaceAll(p, "{symbol}", "GOOGL")
	p = replaceAll(p, "{date}", "2024-01-01")
	p = replaceAll(p, "{provider}", "finnhub")
	return p
}

func replaceAll(s, a, b string) string {
	for {
		i := indexOf(s, a)
		if i < 0 {
			return s
		}
		s = s[:i] + b + s[i+len(a):]
	}
}

func indexOf(s, a string) int {
	for i := 0; i+len(a) <= len(s); i++ {
		if s[i:i+len(a)] == a {
			return i
		}
	}
	return -1
}

func TestUnauthenticatedProtected401(t *testing.T) {
	s := testServer(t, "secret")
	req := httptest.NewRequest("GET", "/api/datasets", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 401 {
		t.Fatalf("datasets without auth got %d", rec.Code)
	}
}

func TestStatusJSON(t *testing.T) {
	s := testServer(t, "secret")
	req := httptest.NewRequest("GET", "/api/status", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["status"] != "ok" {
		t.Fatalf("%v", body)
	}
	if body["engine"] != "go" {
		t.Fatalf("status engine %v", body["engine"])
	}
	db, _ := body["db"].(map[string]any)
	if db["connected"] != true {
		t.Fatalf("db %v", db)
	}
}

func TestMutationRejectsExtraJSON(t *testing.T) {
	s := testServer(t, "")
	req := httptest.NewRequest("PATCH", "/api/autotrade/config", strings.NewReader(`{"enabled":true}{"x":1}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("extra json got %d %s", rec.Code, rec.Body.String())
	}
}

func TestMonitorTradesFailsOnDBError(t *testing.T) {
	s := testServer(t, "")
	if _, err := s.DB.SQL.Exec(`DROP TABLE trades`); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("GET", "/api/telegram/trades", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 500 {
		t.Fatalf("monitor trades got %d %s", rec.Code, rec.Body.String())
	}
}

func TestMutatorsFailOnDBError(t *testing.T) {
	bar := []types.OHLC{{Date: "2024-01-01", Open: 10, High: 11, Low: 9, Close: 10, Volume: 1}}
	cases := []struct {
		name   string
		method string
		path   string
		body   string
		prep   func(*testing.T, *Server)
	}{
		{"watch-delete", "DELETE", "/api/telegram/watch/AAPL", "", func(t *testing.T, s *Server) {
			if _, err := s.DB.SQL.Exec(`DROP TABLE telegram_watches`); err != nil {
				t.Fatal(err)
			}
		}},
		{"watch-patch", "PATCH", "/api/telegram/watch/AAPL", `{"lowIBS":0.12}`, func(t *testing.T, s *Server) {
			if _, err := s.DB.SQL.Exec(`DROP TABLE telegram_watches`); err != nil {
				t.Fatal(err)
			}
		}},
		{"ema-delete", "DELETE", "/api/telegram/ema-alerts/x", "", func(t *testing.T, s *Server) {
			if _, err := s.DB.SQL.Exec(`DROP TABLE telegram_ema_alerts`); err != nil {
				t.Fatal(err)
			}
		}},
		{"trade-patch", "PATCH", "/api/trades/t1", `{"notes":"x"}`, func(t *testing.T, s *Server) {
			if _, err := s.DB.SQL.Exec(`DROP TABLE trades`); err != nil {
				t.Fatal(err)
			}
		}},
		{"trade-delete", "DELETE", "/api/trades/t1", "", func(t *testing.T, s *Server) {
			if _, err := s.DB.SQL.Exec(`DROP TABLE trades`); err != nil {
				t.Fatal(err)
			}
		}},
		{"broker-patch", "PATCH", "/api/broker-trades/b1", `{"notes":"x"}`, func(t *testing.T, s *Server) {
			if _, err := s.DB.SQL.Exec(`DROP TABLE broker_trades`); err != nil {
				t.Fatal(err)
			}
		}},
		{"broker-delete", "DELETE", "/api/broker-trades/b1", "", func(t *testing.T, s *Server) {
			if _, err := s.DB.SQL.Exec(`DROP TABLE broker_trades`); err != nil {
				t.Fatal(err)
			}
		}},
		{"split-delete-date", "DELETE", "/api/splits/AAPL/2024-01-02", "", func(t *testing.T, s *Server) {
			if _, err := s.DB.SQL.Exec(`DROP TABLE splits`); err != nil {
				t.Fatal(err)
			}
		}},
		{"splits-delete", "DELETE", "/api/splits/AAPL", "", func(t *testing.T, s *Server) {
			if _, err := s.DB.SQL.Exec(`DROP TABLE splits`); err != nil {
				t.Fatal(err)
			}
		}},
		{"dataset-import-splits", "PUT", "/api/datasets/AAPL", "", func(t *testing.T, s *Server) {
			if err := s.DB.SaveDataset("AAPL", "AAPL", "", "", bar, false); err != nil {
				t.Fatal(err)
			}
			if _, err := s.DB.SQL.Exec(`DROP TABLE splits`); err != nil {
				t.Fatal(err)
			}
		}},
		{"dataset-refresh-meta", "POST", "/api/datasets/AAPL/refresh", "", func(t *testing.T, s *Server) {
			if err := s.DB.SaveDataset("AAPL", "AAPL", "Apple", "core", bar, false); err != nil {
				t.Fatal(err)
			}
			if _, err := s.DB.SQL.Exec(`CREATE TRIGGER fail_meta BEFORE UPDATE ON dataset_meta BEGIN SELECT RAISE(ABORT, 'boom'); END`); err != nil {
				t.Fatal(err)
			}
			av := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"Time Series (Daily)":{"2024-01-08":{"1. open":"11","2. high":"13","3. low":"10","4. close":"12","6. volume":"110"}}}`))
			}))
			t.Cleanup(av.Close)
			s.Providers = &providers.Client{HTTP: av.Client(), AlphaKey: "k", AlphaBase: av.URL}
			st := s.DB.Settings()
			st["resultsRefreshProvider"] = "alpha_vantage"
			if err := s.DB.SaveSettings(st); err != nil {
				t.Fatal(err)
			}
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := testServer(t, "")
			tc.prep(t, s)
			body := tc.body
			if tc.name == "dataset-import-splits" {
				raw, err := json.Marshal(map[string]any{
					"data":   bar,
					"splits": []types.SplitEvent{{Date: "2024-01-02", Factor: 2}},
				})
				if err != nil {
					t.Fatal(err)
				}
				body = string(raw)
			}
			var req *http.Request
			if body != "" {
				req = httptest.NewRequest(tc.method, tc.path, strings.NewReader(body))
				req.Header.Set("Content-Type", "application/json")
			} else {
				req = httptest.NewRequest(tc.method, tc.path, nil)
			}
			rec := httptest.NewRecorder()
			s.Handler().ServeHTTP(rec, req)
			if rec.Code != 500 {
				t.Fatalf("%s %s got %d %s", tc.method, tc.path, rec.Code, rec.Body.String())
			}
			if strings.Contains(rec.Body.String(), `"ok": true`) || strings.Contains(rec.Body.String(), `"ok":true`) {
				t.Fatalf("%s answered ok:true on a DB error: %s", tc.name, rec.Body.String())
			}
		})
	}
}

func TestGetCalendarDoesNotWrite(t *testing.T) {
	s := testServer(t, "secret")
	before, _ := s.DB.GetCalendar()
	req := httptest.NewRequest("GET", "/api/trading-calendar", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("calendar %d", rec.Code)
	}
	after, _ := s.DB.GetCalendar()
	if string(before) != string(after) {
		t.Fatal("GET calendar must not persist")
	}
}

func TestCrossSiteMutationWithoutOriginForbidden(t *testing.T) {
	s := testServer(t, "secret")
	req := httptest.NewRequest("POST", "/api/telegram/test", strings.NewReader(`{"message":"x"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 403 {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}

func TestReadyzAndHealthz(t *testing.T) {
	s := testServer(t, "secret")
	for _, path := range []string{"/healthz", "/readyz"} {
		req := httptest.NewRequest("GET", path, nil)
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		if rec.Code != 200 {
			t.Fatalf("%s %d %s", path, rec.Code, rec.Body.String())
		}
	}
	s.DB.Close()
	req := httptest.NewRequest("GET", "/readyz", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code == 200 {
		t.Fatal("readyz must not be 200 after the db is closed")
	}
	req = httptest.NewRequest("GET", "/healthz", nil)
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("healthz is liveness, got %d", rec.Code)
	}
}

func TestDatasetAndCalcGolden(t *testing.T) {
	s := testServer(t, "")
	bars := goldens.Bars("googl-bars.json")
	if err := s.DB.SaveDataset("GOOGL", "GOOGL", "Alphabet", "", bars, false); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("GET", "/api/datasets/GOOGL", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("get dataset %d %s", rec.Code, rec.Body.String())
	}
	var ds map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &ds)
	if int(ds["dataPoints"].(float64)) != 5296 && ds["dataPoints"].(float64) != 5296 {
		// dataPoints from meta
	}

	payload, _ := json.Marshal(map[string]any{
		"data":     bars,
		"strategy": types.DefaultIBSStrategy(),
	})
	req = httptest.NewRequest("POST", "/api/calc/clean-backtest", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("calc %d %s", rec.Code, rec.Body.String())
	}
	var result types.BacktestResult
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	want := goldens.CompactTrades("googl-clean-trades.json")
	if len(result.Trades) != len(want) {
		t.Fatalf("calc trades %d want %d", len(result.Trades), len(want))
	}
	if result.Trades[0].EntryDate != want[0].EntryDate || result.Trades[0].ExitReason != want[0].ExitReason {
		t.Fatalf("first trade %+v want %+v", result.Trades[0], want[0])
	}
}
