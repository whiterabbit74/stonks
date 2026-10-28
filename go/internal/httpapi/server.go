package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"mktorder.com/go/internal/live"
	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/store"
)

const (
	jsonBodyLimit     = 5 << 20
	sessionShortTTL   = 12 * time.Hour
	sessionRemember   = 30 * 24 * time.Hour
	sessionTouchEvery = 5 * time.Minute
	sessionPurgeEvery = 5 * time.Minute
	autoLogsMaxLimit  = 500
)

type Server struct {
	DB            *store.DB
	WebDir        string
	BuildID       string
	Providers     *providers.Client
	Live          *live.Engine
	mux           *http.ServeMux
	prod          bool
	adminUser     string
	adminPass     string
	limiter       *ipLimiter
	testAuthToken string
	lastPurge     time.Time
	purgeMu       sync.Mutex
	// sessionsRevoked: обязательный отзыв сессий после смены пароля прошёл.
	// Пока нет, ни одна сессия не принимается (AUD-149).
	sessionsRevoked atomic.Bool
}

// New wires its own providers and Engine. Only for tests and tools: a process
// that also runs the scheduler builds one Engine and passes it to both.
func New(db *store.DB, webDir string) *Server {
	p := providers.FromEnv()
	return NewWithProviders(db, webDir, p, live.NewProcess(db, p))
}

// NewWithProviders takes ready dependencies; eng is the process's one Engine
// (live.NewProcess), shared with the scheduler.
func NewWithProviders(db *store.DB, webDir string, p *providers.Client, eng *live.Engine) *Server {
	if eng == nil {
		panic("httpapi: nil live.Engine")
	}
	s := &Server{
		DB:        db,
		WebDir:    webDir,
		BuildID:   os.Getenv("BUILD_ID"),
		Providers: p,
		Live:      eng,
		prod:      envIsProd(),
		adminUser: strings.ToLower(envDefault("ADMIN_USERNAME", "admin@example.com")),
		adminPass: os.Getenv("ADMIN_PASSWORD"),
		limiter:   newIPLimiter(),
	}
	s.revokeSessionsOnCredentialChange()
	s.mux = http.NewServeMux()
	s.routes()
	return s
}

func envIsProd() bool {
	// Fail closed: production unless GO_ENV is explicitly development.
	goEnv := strings.ToLower(strings.TrimSpace(os.Getenv("GO_ENV")))
	if goEnv == "development" {
		return false
	}
	return true
}

func envDefault(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func (s *Server) Handler() http.Handler {
	h := s.accessLog(recoverMiddleware(s.checkOrigin(s.rateLimit(s.mux))))
	if s.testAuthToken == "" {
		return h
	}
	tok := s.testAuthToken
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if cookieToken(r) == "" {
			r = r.Clone(r.Context())
			r.AddCookie(&http.Cookie{Name: "auth_token", Value: tok})
		}
		h.ServeHTTP(w, r)
	})
}

func (s *Server) routes() {
	wrap := func(fn http.HandlerFunc) http.HandlerFunc {
		return s.auth(fn)
	}
	// Auth
	s.mux.HandleFunc("POST /api/login", wrap(s.handleLogin))
	s.mux.HandleFunc("GET /api/auth/check", wrap(s.handleAuthCheck))
	s.mux.HandleFunc("POST /api/logout", wrap(s.handleLogout))
	s.mux.HandleFunc("POST /api/auth/hash-password", wrap(s.handleHashPassword))
	// Settings
	s.mux.HandleFunc("GET /api/settings", wrap(s.handleGetSettings))
	s.mux.HandleFunc("PUT /api/settings", wrap(s.handlePutSettings))
	s.mux.HandleFunc("PATCH /api/settings", wrap(s.handlePatchSettings))
	// Datasets
	s.mux.HandleFunc("GET /api/datasets", wrap(s.handleListDatasets))
	s.mux.HandleFunc("GET /api/datasets/{id}/metadata", wrap(s.handleDatasetMeta))
	s.mux.HandleFunc("GET /api/datasets/{id}", wrap(s.handleGetDataset))
	s.mux.HandleFunc("POST /api/datasets", wrap(s.handleCreateDataset))
	s.mux.HandleFunc("PUT /api/datasets/{id}", wrap(s.handlePutDataset))
	s.mux.HandleFunc("DELETE /api/datasets/{id}", wrap(s.handleDeleteDataset))
	s.mux.HandleFunc("POST /api/datasets/{id}/refresh", wrap(s.handleRefreshDataset))
	s.mux.HandleFunc("POST /api/datasets/{id}/apply-splits", wrap(s.handleApplySplits))
	s.mux.HandleFunc("PATCH /api/datasets/{id}/metadata", wrap(s.handlePatchDatasetMeta))
	// Splits
	s.mux.HandleFunc("GET /api/splits/webull-raw", wrap(s.handleWebullRawSplits))
	s.mux.HandleFunc("GET /api/splits", wrap(s.handleAllSplits))
	s.mux.HandleFunc("GET /api/splits/{symbol}", wrap(s.handleGetSplits))
	s.mux.HandleFunc("PUT /api/splits/{symbol}", wrap(s.handlePutSplits))
	s.mux.HandleFunc("PATCH /api/splits/{symbol}", wrap(s.handlePatchSplits))
	s.mux.HandleFunc("DELETE /api/splits/{symbol}/{date}", wrap(s.handleDeleteSplitDate))
	s.mux.HandleFunc("DELETE /api/splits/{symbol}", wrap(s.handleDeleteSplits))
	// Calendar
	s.mux.HandleFunc("GET /api/trading-calendar", wrap(s.handleGetCalendar))
	s.mux.HandleFunc("GET /api/trading/expected-prev-day", wrap(s.handlePrevDay))
	s.mux.HandleFunc("POST /api/trading-calendar/fetch-webull", wrap(s.handleCalendarFetch))
	s.mux.HandleFunc("POST /api/trading-calendar/import-webull", wrap(s.handleImportCalendar))
	s.mux.HandleFunc("PATCH /api/trading-calendar/day", wrap(s.handlePatchCalendarDay))
	// Telegram
	s.mux.HandleFunc("POST /api/telegram/watch", wrap(s.handleWatchPost))
	s.mux.HandleFunc("DELETE /api/telegram/watch/{symbol}", wrap(s.handleWatchDelete))
	s.mux.HandleFunc("PATCH /api/telegram/watch/{symbol}", wrap(s.handleWatchPatch))
	s.mux.HandleFunc("GET /api/telegram/watches", wrap(s.handleWatches))
	s.mux.HandleFunc("GET /api/telegram/ema-alerts", wrap(s.handleEMAAlerts))
	s.mux.HandleFunc("POST /api/telegram/ema-alerts", wrap(s.handleEMAAlertPost))
	s.mux.HandleFunc("PATCH /api/telegram/ema-alerts/{id}", wrap(s.handleEMAAlertPatch))
	s.mux.HandleFunc("DELETE /api/telegram/ema-alerts/{id}", wrap(s.handleEMAAlertDelete))
	s.mux.HandleFunc("POST /api/telegram/send", wrap(s.handleTelegramSend))
	s.mux.HandleFunc("POST /api/telegram/test", wrap(s.handleTelegramTest))
	s.mux.HandleFunc("POST /api/telegram/simulate", wrap(s.handleTelegramSimulate))
	s.mux.HandleFunc("POST /api/telegram/actualize-prices", wrap(s.handleActualizePrices))
	s.mux.HandleFunc("POST /api/telegram/update-all", wrap(s.handleUpdateAll))
	s.mux.HandleFunc("POST /api/telegram/command", wrap(s.handleTelegramCommand))
	s.mux.HandleFunc("GET /api/monitor/consistency", wrap(s.handleMonitorConsistency))
	s.mux.HandleFunc("POST /api/monitor/reconcile", wrap(s.handleMonitorReconcile))
	// Positions — one journal. /api/trades and /api/broker-trades are gone
	// with the two tables they served.
	s.mux.HandleFunc("GET /api/positions", wrap(s.handleListPositions))
	s.mux.HandleFunc("POST /api/positions", wrap(s.handlePostPosition))
	s.mux.HandleFunc("PATCH /api/positions/{id}", wrap(s.handlePatchPosition))
	s.mux.HandleFunc("POST /api/positions/{id}/close", wrap(s.handleClosePosition))
	s.mux.HandleFunc("DELETE /api/positions/{id}", wrap(s.handleDeletePosition))
	// Quotes
	s.mux.HandleFunc("GET /api/quote/{symbol}", wrap(s.handleQuote))
	s.mux.HandleFunc("GET /api/quotes/webull-batch", wrap(s.handleWebullBatch))
	s.mux.HandleFunc("GET /api/yahoo-finance/{symbol}", wrap(s.handleYahooFinance))
	s.mux.HandleFunc("GET /api/fetch/{provider}/{symbol}", wrap(s.handleFetchProvider))
	s.mux.HandleFunc("GET /api/test/alpha-vantage", wrap(s.handleTestAlpha))
	s.mux.HandleFunc("GET /api/test/finnhub", wrap(s.handleTestFinnhub))
	s.mux.HandleFunc("GET /api/test/twelve-data", wrap(s.handleTestTwelve))
	s.mux.HandleFunc("POST /api/test-provider", wrap(s.handleTestProvider))
	// Status
	s.mux.HandleFunc("GET /api/status", wrap(s.handleStatus))
	s.mux.HandleFunc("GET /healthz", s.handleHealthz)
	s.mux.HandleFunc("GET /readyz", s.handleReadyz)
	// Autotrade
	s.mux.HandleFunc("GET /api/autotrade/config", wrap(s.handleAutoConfig))
	s.mux.HandleFunc("PATCH /api/autotrade/config", wrap(s.handleAutoConfigPatch))
	s.mux.HandleFunc("GET /api/autotrade/status", wrap(s.handleAutoStatus))
	s.mux.HandleFunc("POST /api/autotrade/evaluate", wrap(s.handleAutoEvaluate))
	s.mux.HandleFunc("GET /api/autotrade/webull/account", wrap(s.handleWebullAccount))
	s.mux.HandleFunc("GET /api/autotrade/webull/dashboard", wrap(s.handleWebullDashboard))
	s.mux.HandleFunc("GET /api/autotrade/logs", wrap(s.handleAutoLogs))
	s.mux.HandleFunc("POST /api/autotrade/trackers/{clientOrderId}/resolve", wrap(s.handleTrackerResolve))
	s.mux.HandleFunc("POST /api/autotrade/trackers/persist-block/{broker}/resolve", wrap(s.handleTrackerPersistBlockResolve))
	s.mux.HandleFunc("POST /api/autotrade/webull/close-position", wrap(s.handleWebullClose))
	s.mux.HandleFunc("POST /api/autotrade/webull/test-buy", wrap(s.handleWebullTestBuy))
	s.mux.HandleFunc("POST /api/autotrade/webull/token/create", wrap(s.handleTokenCreate))
	s.mux.HandleFunc("POST /api/autotrade/webull/token/check", wrap(s.handleTokenCheck))
	s.mux.HandleFunc("PUT /api/autotrade/webull/token", wrap(s.handlePutWebullToken))
	s.mux.HandleFunc("GET /api/autotrade/webull/token/status", wrap(s.handleTokenStatus))
	s.mux.HandleFunc("POST /api/autotrade/robinhood/oauth/start", wrap(s.handleRobinhoodOAuthStart))
	s.mux.HandleFunc("POST /api/autotrade/robinhood/oauth/complete", wrap(s.handleRobinhoodOAuthComplete))
	s.mux.HandleFunc("POST /api/autotrade/robinhood/oauth/disconnect", wrap(s.handleRobinhoodOAuthDisconnect))
	s.mux.HandleFunc("GET /api/autotrade/robinhood/oauth/status", wrap(s.handleRobinhoodOAuthStatus))
	s.mux.HandleFunc("GET /api/autotrade/robinhood/account", wrap(s.handleRobinhoodAccount))
	s.mux.HandleFunc("GET /api/autotrade/robinhood/dashboard", wrap(s.handleRobinhoodDashboard))
	s.mux.HandleFunc("GET /api/autotrade/robinhood/tools", wrap(s.handleRobinhoodTools))
	s.mux.HandleFunc("POST /api/autotrade/robinhood/close-position", wrap(s.handleRobinhoodClose))
	s.mux.HandleFunc("POST /api/autotrade/robinhood/test-buy", wrap(s.handleRobinhoodTestBuy))
	s.mux.HandleFunc("GET /api/brokers/health", wrap(s.handleBrokersHealth))
	s.registerCalc()
	s.mux.HandleFunc("GET /", s.serveWeb)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(v); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":"encode failed"}`))
		return
	}
	w.WriteHeader(code)
	_, _ = w.Write(buf.Bytes())
}

func readJSON(r *http.Request, dest any) error {
	if r.Body == nil {
		return io.EOF
	}
	r.Body = http.MaxBytesReader(nil, r.Body, jsonBodyLimit)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(dest); err != nil {
		return err
	}
	if dec.More() {
		return errors.New("extra json")
	}
	return nil
}

func (s *Server) requireJSON(w http.ResponseWriter, r *http.Request, dest any) bool {
	if err := readJSON(r, dest); err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid json"})
		return false
	}
	return true
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	ds, ohlc, err := s.DB.Counts()
	if err != nil {
		writeJSON(w, 503, map[string]any{"status": "not_ready", "error": "database unavailable"})
		return
	}
	writeJSON(w, 200, map[string]any{
		"status": "ok", "message": "Trading Backtester API is running",
		"engine":    "go",
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"buildId":   s.BuildID,
		"db":        map[string]any{"connected": true, "datasets": ds, "ohlcRows": ohlc},
		"accessLog": HTTPLogHealth(),
	})
}

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"status": "ok"})
}

func (s *Server) handleReadyz(w http.ResponseWriter, r *http.Request) {
	if s.DB == nil || s.DB.SQL == nil {
		writeJSON(w, 503, map[string]any{"status": "not_ready", "error": "db missing"})
		return
	}
	if err := s.DB.SQL.Ping(); err != nil {
		writeJSON(w, 503, map[string]any{"status": "not_ready", "error": "database unavailable"})
		return
	}
	if !s.DB.HasColumn("order_trackers", "last_fill_price") {
		writeJSON(w, 503, map[string]any{"status": "not_ready", "error": "schema incomplete"})
		return
	}
	if !s.DB.HasColumn("webull_token", "last_check_raw") {
		writeJSON(w, 503, map[string]any{"status": "not_ready", "error": "schema incomplete"})
		return
	}
	writeJSON(w, 200, map[string]any{"status": "ready"})
}

func str(v any) string {
	if v == nil {
		return ""
	}
	s, _ := v.(string)
	return s
}
