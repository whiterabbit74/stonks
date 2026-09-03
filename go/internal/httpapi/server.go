package httpapi

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"mktorder.com/go/internal/live"
	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/scheduler"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

type Server struct {
	DB        *store.DB
	WebDir    string
	BuildID   string
	Providers *providers.Client
	Live      *live.Engine
	mux       *http.ServeMux
	prod      bool
	adminUser string
	adminPass string
}

func New(db *store.DB, webDir string) *Server {
	return NewWithProviders(db, webDir, providers.FromEnv())
}

func NewWithProviders(db *store.DB, webDir string, p *providers.Client) *Server {
	s := &Server{
		DB:        db,
		WebDir:    webDir,
		BuildID:   os.Getenv("BUILD_ID"),
		Providers: p,
		prod:      os.Getenv("NODE_ENV") == "production" || os.Getenv("GO_ENV") == "production",
		adminUser: strings.ToLower(envDefault("ADMIN_USERNAME", "admin@example.com")),
		adminPass: os.Getenv("ADMIN_PASSWORD"),
	}
	s.Live = live.New(db, p)
	s.mux = http.NewServeMux()
	s.routes()
	return s
}

func envDefault(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func (s *Server) Handler() http.Handler { return s.mux }

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
	s.mux.HandleFunc("POST /api/trading-calendar/sync-webull", wrap(s.handleCalendarSync))
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
	s.mux.HandleFunc("GET /api/telegram/trades", wrap(s.handleMonitorTrades))
	s.mux.HandleFunc("POST /api/telegram/send", wrap(s.handleTelegramSend))
	s.mux.HandleFunc("POST /api/telegram/test", wrap(s.handleTelegramTest))
	s.mux.HandleFunc("POST /api/telegram/simulate", wrap(s.handleTelegramSimulate))
	s.mux.HandleFunc("POST /api/telegram/actualize-prices", wrap(s.handleActualizePrices))
	s.mux.HandleFunc("POST /api/telegram/update-positions", wrap(s.handleUpdatePositions))
	s.mux.HandleFunc("POST /api/telegram/update-all", wrap(s.handleUpdateAll))
	s.mux.HandleFunc("POST /api/telegram/command", wrap(s.handleTelegramCommand))
	s.mux.HandleFunc("GET /api/monitor/consistency", wrap(s.handleMonitorConsistency))
	s.mux.HandleFunc("POST /api/monitor/reconcile", wrap(s.handleMonitorReconcile))
	// Trades
	s.mux.HandleFunc("GET /api/trades", wrap(s.handleListTrades))
	s.mux.HandleFunc("POST /api/trades", wrap(s.handlePostTrade))
	s.mux.HandleFunc("PATCH /api/trades/{id}", wrap(s.handlePatchTrade))
	s.mux.HandleFunc("POST /api/trades/{id}/close-monitor", wrap(s.handleCloseMonitor))
	s.mux.HandleFunc("DELETE /api/trades/{id}", wrap(s.handleDeleteTrade))
	// Broker
	s.mux.HandleFunc("GET /api/broker-trades", wrap(s.handleListBroker))
	s.mux.HandleFunc("POST /api/broker-trades", wrap(s.handlePostBroker))
	s.mux.HandleFunc("PATCH /api/broker-trades/{id}", wrap(s.handlePatchBroker))
	s.mux.HandleFunc("DELETE /api/broker-trades/{id}", wrap(s.handleDeleteBroker))
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
	// Autotrade
	s.mux.HandleFunc("GET /api/autotrade/config", wrap(s.handleAutoConfig))
	s.mux.HandleFunc("PATCH /api/autotrade/config", wrap(s.handleAutoConfigPatch))
	s.mux.HandleFunc("GET /api/autotrade/status", wrap(s.handleAutoStatus))
	s.mux.HandleFunc("POST /api/autotrade/evaluate", wrap(s.handleAutoEvaluate))
	s.mux.HandleFunc("POST /api/autotrade/execute", wrap(s.handleAutoExecute))
	s.mux.HandleFunc("GET /api/autotrade/webull/account", wrap(s.handleWebullAccount))
	s.mux.HandleFunc("GET /api/autotrade/webull/dashboard", wrap(s.handleWebullDashboard))
	s.mux.HandleFunc("GET /api/autotrade/logs", wrap(s.handleAutoLogs))
	s.mux.HandleFunc("POST /api/autotrade/webull/close-position", wrap(s.handleWebullClose))
	s.mux.HandleFunc("POST /api/autotrade/webull/test-buy", wrap(s.handleWebullTestBuy))
	s.mux.HandleFunc("POST /api/autotrade/webull/token/create", wrap(s.handleTokenCreate))
	s.mux.HandleFunc("POST /api/autotrade/webull/token/check", wrap(s.handleTokenCheck))
	s.mux.HandleFunc("PUT /api/autotrade/webull/token", wrap(s.handlePutWebullToken))
	s.mux.HandleFunc("GET /api/autotrade/webull/token/status", wrap(s.handleTokenStatus))
	s.registerCalc()
	s.mux.HandleFunc("GET /", s.serveWeb)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func readJSON(r *http.Request, dest any) error {
	dec := json.NewDecoder(r.Body)
	return dec.Decode(dest)
}

func (s *Server) public(r *http.Request) bool {
	p := r.URL.Path
	if r.Method == http.MethodGet && (p == "/api/status" || p == "/api/auth/check" || p == "/api/trading-calendar" || p == "/api/trading/expected-prev-day") {
		return true
	}
	if r.Method == http.MethodPost && (p == "/api/login" || p == "/api/logout") {
		return true
	}
	if !strings.HasPrefix(p, "/api/") {
		return true
	}
	return false
}

func (s *Server) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.adminPass == "" {
			if s.prod {
				writeJSON(w, 503, map[string]any{"error": "Auth not configured"})
				return
			}
			next(w, r)
			return
		}
		if s.public(r) {
			next(w, r)
			return
		}
		token := cookieToken(r)
		if token == "" {
			writeJSON(w, 401, map[string]any{"error": "Unauthorized"})
			return
		}
		_, exp, ok := s.DB.SessionGet(token)
		if !ok || exp < time.Now().UnixMilli() {
			writeJSON(w, 401, map[string]any{"error": "Unauthorized"})
			return
		}
		next(w, r)
	}
}

func cookieToken(r *http.Request) string {
	if c, err := r.Cookie("auth_token"); err == nil {
		return c.Value
	}
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(strings.ToLower(h), "bearer ") {
		t := strings.TrimSpace(h[7:])
		if len(t) == 32 {
			return t
		}
	}
	return ""
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	ds, ohlc := s.DB.Counts()
	writeJSON(w, 200, map[string]any{
		"status": "ok", "message": "Trading Backtester API is running",
		"engine":    "go",
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"buildId":   s.BuildID,
		"db":        map[string]any{"connected": true, "datasets": ds, "ohlcRows": ohlc},
	})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if s.adminPass == "" {
		writeJSON(w, 200, map[string]any{"success": true, "disabled": true})
		return
	}
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Remember bool   `json:"remember"`
	}
	_ = readJSON(r, &body)
	if body.Username == "" || len(body.Username) > 254 || body.Password == "" || len(body.Password) > 1024 {
		writeJSON(w, 400, map[string]any{"error": "Invalid username format"})
		return
	}
	if strings.ToLower(body.Username) != s.adminUser {
		writeJSON(w, 401, map[string]any{"error": "Invalid credentials"})
		return
	}
	ok := false
	if strings.HasPrefix(s.adminPass, "$2") {
		ok = bcrypt.CompareHashAndPassword([]byte(s.adminPass), []byte(body.Password)) == nil
	} else {
		ok = body.Password == s.adminPass
	}
	if !ok {
		writeJSON(w, 401, map[string]any{"error": "Invalid credentials"})
		return
	}
	tok := randomToken()
	now := time.Now().UnixMilli()
	_ = s.DB.SessionSet(tok, now, now+30*24*60*60*1000)
	http.SetCookie(w, &http.Cookie{Name: "auth_token", Value: tok, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode})
	writeJSON(w, 200, map[string]any{"success": true})
}

func (s *Server) handleAuthCheck(w http.ResponseWriter, r *http.Request) {
	if s.adminPass == "" {
		writeJSON(w, 200, map[string]any{"ok": true, "disabled": true})
		return
	}
	tok := cookieToken(r)
	_, exp, ok := s.DB.SessionGet(tok)
	if !ok || exp < time.Now().UnixMilli() {
		writeJSON(w, 401, map[string]any{"error": "Unauthorized"})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if tok := cookieToken(r); tok != "" {
		s.DB.SessionDelete(tok)
	}
	http.SetCookie(w, &http.Cookie{Name: "auth_token", Value: "", Path: "/", HttpOnly: true, MaxAge: -1})
	writeJSON(w, 200, map[string]any{"success": true})
}

func (s *Server) handleHashPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Password string `json:"password"`
	}
	_ = readJSON(r, &body)
	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), 10)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"hash": string(hash)})
}

func randomToken() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	st := s.DB.Settings()
	delete(st, "polygonApiKey")
	st["polygonApiKeyConfigured"] = os.Getenv("POLYGON_API_KEY") != ""
	writeJSON(w, 200, st)
}

func (s *Server) handlePutSettings(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid json"})
		return
	}
	_ = s.DB.SaveSettings(body)
	writeJSON(w, 200, body)
}

func (s *Server) handlePatchSettings(w http.ResponseWriter, r *http.Request) {
	cur := s.DB.Settings()
	var body map[string]any
	_ = readJSON(r, &body)
	for k, v := range body {
		cur[k] = v
	}
	_ = s.DB.SaveSettings(cur)
	writeJSON(w, 200, cur)
}

func (s *Server) handleListDatasets(w http.ResponseWriter, r *http.Request) {
	list, err := s.DB.ListDatasets()
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Failed to list datasets"})
		return
	}
	writeJSON(w, 200, list)
}

func (s *Server) handleGetDataset(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ds, err := s.DB.GetDataset(id)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "Failed to get dataset"})
		return
	}
	if ds == nil {
		writeJSON(w, 404, map[string]any{"error": "Dataset not found"})
		return
	}
	events, _ := s.DB.ListSplits(id)
	ds["splits"] = events
	adj, _ := ds["adjustedForSplits"].(bool)
	bars := decodeBars(ds["data"])
	out, applied := s.adjustBarsIfNeeded(id, bars, adj)
	if applied && !adj {
		if err := s.persistDataset(id, ds, out, true); err != nil {
			writeJSON(w, 500, map[string]any{"error": err.Error()})
			return
		}
		ds["data"] = out
		ds["adjustedForSplits"] = true
		events, _ = s.DB.ListSplits(id)
		ds["splits"] = events
	}
	writeJSON(w, 200, ds)
}

func (s *Server) handleDatasetMeta(w http.ResponseWriter, r *http.Request) {
	s.handleGetDataset(w, r)
}

func (s *Server) handleCreateDataset(w http.ResponseWriter, r *http.Request) {
	ct := r.Header.Get("Content-Type")
	var payload map[string]any
	if strings.Contains(ct, "multipart") {
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			writeJSON(w, 400, map[string]any{"error": err.Error()})
			return
		}
		f, _, err := r.FormFile("file")
		if err != nil {
			writeJSON(w, 400, map[string]any{"error": "file required"})
			return
		}
		defer f.Close()
		b, _ := io.ReadAll(f)
		if err := json.Unmarshal(b, &payload); err != nil {
			writeJSON(w, 400, map[string]any{"error": "invalid json file"})
			return
		}
	} else if err := readJSON(r, &payload); err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid json"})
		return
	}
	s.savePayload(w, payload)
}

func (s *Server) handlePutDataset(w http.ResponseWriter, r *http.Request) {
	var payload map[string]any
	if err := readJSON(r, &payload); err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid json"})
		return
	}
	payload["ticker"] = r.PathValue("id")
	s.savePayload(w, payload)
}

func (s *Server) savePayload(w http.ResponseWriter, payload map[string]any) {
	ticker := store.SafeTicker(str(payload["ticker"]))
	if ticker == "" {
		ticker = store.SafeTicker(str(payload["name"]))
	}
	name := str(payload["name"])
	bars := decodeBars(payload["data"])
	out, applied := s.adjustBarsIfNeeded(ticker, bars, false)
	if err := s.DB.SaveDataset(ticker, name, str(payload["companyName"]), str(payload["tag"]), out, applied); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "ticker": ticker, "dataPoints": len(out), "adjustedForSplits": applied})
}

func (s *Server) handleRefreshDataset(w http.ResponseWriter, r *http.Request) {
	id := store.SafeTicker(r.PathValue("id"))
	if id == "" {
		writeJSON(w, 400, map[string]any{"error": "Invalid symbol"})
		return
	}
	ds, err := s.DB.GetDataset(id)
	if err != nil || ds == nil {
		writeJSON(w, 404, map[string]any{"error": "Dataset not found"})
		return
	}
	st := s.DB.Settings()
	provider := str(st["enhancerProvider"])
	if provider == "" {
		provider = "finnhub"
	}
	if provider == "webull" {
		writeJSON(w, 400, map[string]any{"error": "Webull не поддерживает загрузку исторических данных"})
		return
	}
	endTs := time.Now().Unix()
	startTs := endTs - 40*365*24*60*60
	hist, err := s.Providers.Historical(id, provider, startTs, endTs, "none")
	if err != nil {
		writeProviderError(w, err)
		return
	}
	name := str(ds["name"])
	if name == "" {
		name = id
	}
	out, applied := s.adjustBarsIfNeeded(id, hist.Rows, false)
	if err := s.DB.SaveDataset(id, name, str(ds["companyName"]), str(ds["tag"]), out, applied); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "ticker": id, "dataPoints": len(out), "provider": provider, "adjustedForSplits": applied})
}

func (s *Server) handleDeleteDataset(w http.ResponseWriter, r *http.Request) {
	if err := s.DB.DeleteDataset(r.PathValue("id")); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleApplySplits(w http.ResponseWriter, r *http.Request) {
	id := store.SafeTicker(r.PathValue("id"))
	if id == "" {
		writeJSON(w, 400, map[string]any{"error": "Invalid dataset ID"})
		return
	}
	ds, err := s.DB.GetDataset(id)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	if ds == nil {
		writeJSON(w, 404, map[string]any{"error": "Dataset not found"})
		return
	}
	if adj, _ := ds["adjustedForSplits"].(bool); adj {
		writeJSON(w, 200, map[string]any{"success": true, "id": id, "alreadyApplied": true, "message": "Датасет уже пересчитан с учётом сплитов"})
		return
	}
	bars := decodeBars(ds["data"])
	out, applied := s.adjustBarsIfNeeded(id, bars, false)
	if err := s.persistDataset(id, ds, out, applied); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	if !applied || pricesUnchanged(bars, out) {
		writeJSON(w, 200, map[string]any{"success": true, "id": id, "alreadyApplied": true, "message": "Датасет уже пересчитан с учётом сплитов"})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "id": id, "message": "Датасет пересчитан с учётом сплитов"})
}

func pricesUnchanged(a, b []types.OHLC) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].Close != b[i].Close {
			return false
		}
	}
	return true
}

func strPtr(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	case *string:
		if t == nil {
			return ""
		}
		return *t
	}
	return str(v)
}

func (s *Server) handlePatchDatasetMeta(w http.ResponseWriter, r *http.Request) {
	id := store.SafeTicker(r.PathValue("id"))
	if id == "" {
		writeJSON(w, 400, map[string]any{"error": "Invalid dataset ID"})
		return
	}
	if !s.DB.DatasetExists(id) {
		writeJSON(w, 404, map[string]any{"error": "Dataset not found"})
		return
	}
	var body map[string]any
	_ = readJSON(r, &body)
	var tag, company *string
	if v, ok := body["tag"]; ok {
		s := fmtString(v)
		tag = &s
	}
	if v, ok := body["companyName"]; ok {
		s := fmtString(v)
		company = &s
	}
	if err := s.DB.UpdateDatasetMetadata(id, tag, company); err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, 404, map[string]any{"error": "Dataset not found"})
			return
		}
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "message": "Метаданные датасета обновлены"})
}

func fmtString(v any) string {
	if v == nil {
		return ""
	}
	return strings.TrimSpace(fmtSprint(v))
}

func fmtSprint(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return str(v)
}

func (s *Server) handleAllSplits(w http.ResponseWriter, r *http.Request) {
	all, err := s.DB.AllSplits()
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, all)
}

func (s *Server) handleGetSplits(w http.ResponseWriter, r *http.Request) {
	list, _ := s.DB.ListSplits(r.PathValue("symbol"))
	writeJSON(w, 200, list)
}

func (s *Server) handlePutSplits(w http.ResponseWriter, r *http.Request) {
	var events []map[string]any
	_ = readJSON(r, &events)
	_ = s.DB.ReplaceSplits(r.PathValue("symbol"), toSplits(events))
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handlePatchSplits(w http.ResponseWriter, r *http.Request) {
	var events []map[string]any
	_ = readJSON(r, &events)
	_ = s.DB.UpsertSplits(r.PathValue("symbol"), toSplits(events))
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleDeleteSplitDate(w http.ResponseWriter, r *http.Request) {
	_ = s.DB.DeleteSplit(r.PathValue("symbol"), r.PathValue("date"))
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleDeleteSplits(w http.ResponseWriter, r *http.Request) {
	_ = s.DB.DeleteSplits(r.PathValue("symbol"))
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleGetCalendar(w http.ResponseWriter, r *http.Request) {
	raw, _ := s.DB.GetCalendar()
	if store.CalendarHolidaysEmpty(raw) {
		raw = json.RawMessage(store.DefaultCalendarJSON)
		_ = s.DB.SaveCalendar(raw)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(200)
	_, _ = w.Write(raw)
}

func (s *Server) handlePrevDay(w http.ResponseWriter, r *http.Request) {
	raw, _ := s.DB.GetCalendar()
	cal := scheduler.ParseCalendar(raw)
	d := tradingdate.AddDays(tradingdate.TodayNYSE(time.Now()), -1)
	for i := 0; i < 30; i++ {
		y, m, day := tradingdate.YMD(d)
		parts := tradingdate.NYSEParts{Year: y, Month: m, Day: day, DayOfWeek: tradingdate.DayOfWeek(d)}
		if scheduler.IsTradingDay(parts, cal) {
			writeJSON(w, 200, map[string]any{"date": d})
			return
		}
		d = tradingdate.AddDays(d, -1)
	}
	writeJSON(w, 200, map[string]any{"date": d})
}

func (s *Server) handleImportCalendar(w http.ResponseWriter, r *http.Request) {
	var body json.RawMessage
	_ = readJSON(r, &body)
	if len(body) > 0 {
		_ = s.DB.SaveCalendar(body)
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handlePatchCalendarDay(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Year string `json:"year"`
		Mmdd string `json:"mmdd"`
		Type string `json:"type"`
		Name string `json:"name"`
	}
	if err := readJSON(r, &body); err != nil || body.Year == "" || body.Mmdd == "" || body.Type == "" {
		writeJSON(w, 400, map[string]any{"error": "year, mmdd and type are required"})
		return
	}
	if !regexp.MustCompile(`^\d{4}$`).MatchString(body.Year) {
		writeJSON(w, 400, map[string]any{"error": "year must be a four-digit year"})
		return
	}
	if !regexp.MustCompile(`^\d{2}-\d{2}$`).MatchString(body.Mmdd) {
		writeJSON(w, 400, map[string]any{"error": "mmdd must be a valid MM-DD date"})
		return
	}
	if body.Type != "normal" && body.Type != "holiday" && body.Type != "short" {
		writeJSON(w, 400, map[string]any{"error": "type must be normal, holiday or short"})
		return
	}
	raw, _ := s.DB.GetCalendar()
	var cal map[string]any
	if err := json.Unmarshal(raw, &cal); err != nil {
		cal = map[string]any{}
	}
	holidays, _ := cal["holidays"].(map[string]any)
	if holidays == nil {
		holidays = map[string]any{}
	}
	shortDays, _ := cal["shortDays"].(map[string]any)
	if shortDays == nil {
		shortDays = map[string]any{}
	}
	deleteNested(holidays, body.Year, body.Mmdd)
	deleteNested(shortDays, body.Year, body.Mmdd)
	name := strings.TrimSpace(body.Name)
	if len(name) > 120 {
		name = name[:120]
	}
	if body.Type == "holiday" {
		yearMap, _ := holidays[body.Year].(map[string]any)
		if yearMap == nil {
			yearMap = map[string]any{}
		}
		if name == "" {
			name = "Holiday"
		}
		yearMap[body.Mmdd] = map[string]any{"name": name, "type": "holiday", "description": "Market Closed"}
		holidays[body.Year] = yearMap
	} else if body.Type == "short" {
		yearMap, _ := shortDays[body.Year].(map[string]any)
		if yearMap == nil {
			yearMap = map[string]any{}
		}
		if name == "" {
			name = "Early Close"
		}
		yearMap[body.Mmdd] = map[string]any{"name": name, "type": "short", "description": "Early close at 1:00 PM", "hours": 3.5}
		shortDays[body.Year] = yearMap
	}
	cal["holidays"] = holidays
	cal["shortDays"] = shortDays
	meta, _ := cal["metadata"].(map[string]any)
	if meta == nil {
		meta = map[string]any{}
	}
	meta["lastUpdated"] = tradingdate.TodayNYSE(time.Now())
	cal["metadata"] = meta
	out, _ := json.Marshal(cal)
	if err := s.DB.SaveCalendar(out); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "year": body.Year, "mmdd": body.Mmdd, "type": body.Type})
}

func deleteNested(root map[string]any, year, mmdd string) {
	yearMap, _ := root[year].(map[string]any)
	if yearMap == nil {
		return
	}
	delete(yearMap, mmdd)
}

func (s *Server) handleWatches(w http.ResponseWriter, r *http.Request) {
	s.liveEng().UpdatePositions()
	list, _ := s.DB.ListWatches()
	writeJSON(w, 200, list)
}

func (s *Server) handleWatchPost(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = readJSON(r, &body)
	if err := s.DB.UpsertWatch(body); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleWatchDelete(w http.ResponseWriter, r *http.Request) {
	_ = s.DB.DeleteWatch(r.PathValue("symbol"))
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleWatchPatch(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = readJSON(r, &body)
	body["symbol"] = r.PathValue("symbol")
	_ = s.DB.UpsertWatch(body)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleEMAAlerts(w http.ResponseWriter, r *http.Request) {
	list, _ := s.DB.ListEMAAlerts()
	writeJSON(w, 200, list)
}

func (s *Server) handleEMAAlertPost(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = readJSON(r, &body)
	id, err := s.DB.UpsertEMAAlert(body)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	if row := s.DB.GetEMAAlert(id); row != nil {
		writeJSON(w, 200, row)
		return
	}
	writeJSON(w, 200, map[string]any{"id": id, "symbol": body["symbol"]})
}

func (s *Server) handleEMAAlertPatch(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = readJSON(r, &body)
	body["id"] = r.PathValue("id")
	id, err := s.DB.UpsertEMAAlert(body)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	if row := s.DB.GetEMAAlert(id); row != nil {
		writeJSON(w, 200, row)
		return
	}
	writeJSON(w, 404, map[string]any{"error": "EMA alert not found"})
}

func (s *Server) handleEMAAlertDelete(w http.ResponseWriter, r *http.Request) {
	_ = s.DB.DeleteEMAAlert(r.PathValue("id"))
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleMonitorTrades(w http.ResponseWriter, r *http.Request) {
	list, _ := s.DB.ListTrades("trades")
	writeJSON(w, 200, map[string]any{"trades": list, "total": len(list)})
}

func (s *Server) handleListTrades(w http.ResponseWriter, r *http.Request) {
	list, _ := s.DB.ListTrades("trades")
	writeJSON(w, 200, list)
}

func (s *Server) handlePostTrade(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = readJSON(r, &body)
	if err := s.DB.InsertTrade("trades", body); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handlePatchTrade(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = readJSON(r, &body)
	_ = s.DB.PatchTrade("trades", r.PathValue("id"), body)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleCloseMonitor(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = readJSON(r, &body)
	body["status"] = "closed"
	_ = s.DB.PatchTrade("trades", r.PathValue("id"), body)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleDeleteTrade(w http.ResponseWriter, r *http.Request) {
	_ = s.DB.DeleteTrade("trades", r.PathValue("id"))
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleListBroker(w http.ResponseWriter, r *http.Request) {
	list, _ := s.DB.ListTrades("broker_trades")
	writeJSON(w, 200, list)
}
func (s *Server) handlePostBroker(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = readJSON(r, &body)
	_ = s.DB.InsertTrade("broker_trades", body)
	writeJSON(w, 200, map[string]any{"ok": true})
}
func (s *Server) handlePatchBroker(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = readJSON(r, &body)
	_ = s.DB.PatchTrade("broker_trades", r.PathValue("id"), body)
	writeJSON(w, 200, map[string]any{"ok": true})
}
func (s *Server) handleDeleteBroker(w http.ResponseWriter, r *http.Request) {
	_ = s.DB.DeleteTrade("broker_trades", r.PathValue("id"))
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleWebullBatch(w http.ResponseWriter, r *http.Request) {
	raw := r.URL.Query().Get("symbols")
	parts := strings.Split(raw, ",")
	var symbols []string
	for _, p := range parts {
		if s := store.SafeTicker(strings.TrimSpace(p)); s != "" {
			symbols = append(symbols, s)
		}
	}
	if len(symbols) == 0 {
		writeJSON(w, 400, map[string]any{"error": "No valid symbols"})
		return
	}
	if len(symbols) > 50 {
		writeJSON(w, 400, map[string]any{"error": "Too many symbols (max 50)"})
		return
	}
	var results []map[string]any
	for _, symbol := range symbols {
		payload, err := s.Providers.Quote(symbol, "webull")
		if err != nil {
			results = append(results, map[string]any{"symbol": symbol, "error": err.Error()})
			continue
		}
		norm := providers.NormalizeIntradayRange(payload.Range, payload.Quote)
		results = append(results, map[string]any{
			"symbol": symbol, "dateKey": payload.DateKey, "range": norm, "quote": payload.Quote, "provider": "webull",
		})
	}
	writeJSON(w, 200, map[string]any{"provider": "webull", "count": len(results), "results": results})
}

func (s *Server) handleQuote(w http.ResponseWriter, r *http.Request) {
	sym := store.SafeTicker(r.PathValue("symbol"))
	if sym == "" {
		writeJSON(w, 400, map[string]any{"error": "Invalid symbol"})
		return
	}
	provider := r.URL.Query().Get("provider")
	if provider == "" {
		provider = "finnhub"
	}
	allowed := map[string]bool{"alpha_vantage": true, "finnhub": true, "twelve_data": true, "polygon": true, "webull": true}
	if !allowed[provider] {
		provider = "finnhub"
	}
	payload, err := s.Providers.Quote(sym, provider)
	if err != nil {
		writeProviderError(w, err)
		return
	}
	norm := providers.NormalizeIntradayRange(payload.Range, payload.Quote)
	writeJSON(w, 200, map[string]any{
		"symbol": sym, "dateKey": payload.DateKey, "range": norm, "quote": payload.Quote, "provider": provider,
	})
}

func (s *Server) handleYahooFinance(w http.ResponseWriter, r *http.Request) {
	sym := store.SafeTicker(r.PathValue("symbol"))
	if sym == "" {
		writeJSON(w, 400, map[string]any{"error": "Invalid symbol"})
		return
	}
	nowTs := time.Now().Unix()
	endTs := parseUnix(r.URL.Query().Get("end"), nowTs)
	startTs := parseUnix(r.URL.Query().Get("start"), endTs-40*365*24*60*60)
	if startTs >= endTs {
		writeJSON(w, 400, map[string]any{"error": "Invalid time range"})
		return
	}
	provider := r.URL.Query().Get("provider")
	if provider == "" {
		provider = "alpha_vantage"
	}
	adjustment := "none"
	if r.URL.Query().Get("adjustment") == "split_only" {
		adjustment = "split_only"
	}
	if provider == "webull" {
		writeJSON(w, 400, map[string]any{"error": "Webull не поддерживает загрузку исторических данных. Выберите другой провайдер (Alpha Vantage, Finnhub, Twelve Data или Polygon) в настройках."})
		return
	}
	hist, err := s.Providers.Historical(sym, provider, startTs, endTs, adjustment)
	if err != nil {
		writeProviderError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{
		"symbol": sym, "provider": provider, "dataPoints": len(hist.Rows), "data": hist.Rows, "splits": hist.Splits,
	})
}

func (s *Server) handleFetchProvider(w http.ResponseWriter, r *http.Request) {
	provider := r.PathValue("provider")
	sym := store.SafeTicker(r.PathValue("symbol"))
	if sym == "" {
		writeJSON(w, 400, map[string]any{"error": "Invalid symbol"})
		return
	}
	endTs := time.Now().Unix()
	startTs := endTs - 40*365*24*60*60
	if provider == "webull" {
		payload, err := s.Providers.Quote(sym, "webull")
		if err != nil {
			writeProviderError(w, err)
			return
		}
		q := payload.Quote
		data := []map[string]any{{
			"date": payload.DateKey, "open": q["open"], "high": q["high"], "low": q["low"],
			"close": q["current"], "adjClose": q["current"], "volume": nil,
		}}
		writeJSON(w, 200, map[string]any{"symbol": sym, "provider": provider, "dataPoints": 1, "data": data, "splits": []any{}})
		return
	}
	hist, err := s.Providers.Historical(sym, provider, startTs, endTs, "none")
	if err != nil {
		writeProviderError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{
		"symbol": sym, "provider": provider, "dataPoints": len(hist.Rows), "data": hist.Rows, "splits": hist.Splits,
	})
}

func (s *Server) handleTestAlpha(w http.ResponseWriter, r *http.Request) {
	if s.Providers.AlphaKey == "" {
		writeJSON(w, 200, map[string]any{"success": false, "error": "API key not configured"})
		return
	}
	end := time.Now().Unix()
	hist, err := s.Providers.Historical("AAPL", "alpha_vantage", end-7*24*60*60, end, "none")
	if err != nil {
		writeJSON(w, 200, map[string]any{"success": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "dataPoints": len(hist.Rows)})
}

func (s *Server) handleTestFinnhub(w http.ResponseWriter, r *http.Request) {
	if s.Providers.FinnhubKey == "" {
		writeJSON(w, 200, map[string]any{"success": false, "error": "API key not configured"})
		return
	}
	end := time.Now().Unix()
	hist, err := s.Providers.Historical("AAPL", "finnhub", end-7*24*60*60, end, "none")
	if err != nil {
		writeJSON(w, 200, map[string]any{"success": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "dataPoints": len(hist.Rows)})
}

func (s *Server) handleTestTwelve(w http.ResponseWriter, r *http.Request) {
	if s.Providers.TwelveKey == "" {
		writeJSON(w, 200, map[string]any{"success": false, "error": "API key not configured"})
		return
	}
	end := time.Now().Unix()
	hist, err := s.Providers.Historical("AAPL", "twelve_data", end-7*24*60*60, end, "none")
	if err != nil {
		writeJSON(w, 200, map[string]any{"success": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "dataPoints": len(hist.Rows)})
}

func (s *Server) handleTestProvider(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = readJSON(r, &body)
	provider, _ := body["provider"].(string)
	symbol := "AAPL"
	switch provider {
	case "alpha_vantage":
		if s.Providers.AlphaKey == "" {
			writeJSON(w, 200, map[string]any{"success": false, "error": "API key not configured"})
			return
		}
		price, err := s.Providers.GlobalQuotePrice(symbol)
		if err != nil {
			writeJSON(w, 200, map[string]any{"success": false, "error": err.Error()})
			return
		}
		writeJSON(w, 200, map[string]any{"success": true, "symbol": symbol, "price": strconv.FormatFloat(price, 'f', 2, 64)})
	case "finnhub":
		if s.Providers.FinnhubKey == "" {
			writeJSON(w, 200, map[string]any{"success": false, "error": "API key not configured"})
			return
		}
		q, err := s.Providers.Quote(symbol, "finnhub")
		if err != nil {
			writeJSON(w, 200, map[string]any{"success": false, "error": err.Error()})
			return
		}
		price := q.Quote["current"]
		writeJSON(w, 200, map[string]any{"success": true, "symbol": symbol, "price": fmtFloat(price)})
	case "twelve_data":
		if s.Providers.TwelveKey == "" {
			writeJSON(w, 200, map[string]any{"success": false, "error": "API key not configured"})
			return
		}
		price, err := s.Providers.TwelvePrice(symbol)
		if err != nil {
			writeJSON(w, 200, map[string]any{"success": false, "error": err.Error()})
			return
		}
		writeJSON(w, 200, map[string]any{"success": true, "symbol": symbol, "price": strconv.FormatFloat(price, 'f', 2, 64)})
	default:
		writeJSON(w, 200, map[string]any{"success": false, "error": "Unknown provider"})
	}
}

func writeProviderError(w http.ResponseWriter, err error) {
	if he, ok := err.(*providers.HTTPError); ok {
		code := he.Status
		if code < 400 {
			code = 500
		}
		writeJSON(w, code, map[string]any{"error": he.Message})
		return
	}
	writeJSON(w, 500, map[string]any{"error": err.Error()})
}

func parseUnix(raw string, fallback int64) int64 {
	if raw == "" {
		return fallback
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func fmtFloat(v any) string {
	f, ok := v.(float64)
	if !ok {
		return "0.00"
	}
	return strconv.FormatFloat(f, 'f', 2, 64)
}

func (s *Server) handleAutoConfig(w http.ResponseWriter, r *http.Request) {
	eng := s.liveEng()
	writeJSON(w, 200, map[string]any{
		"config": eng.AutoConfig(),
		"webull": eng.WebullSummary(),
		"state":  map[string]any{"running": eng.CanSubmit()},
	})
}

func (s *Server) handleAutoConfigPatch(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = readJSON(r, &body)
	cfg := s.liveEng().PatchAutoConfig(body)
	writeJSON(w, 200, map[string]any{"success": true, "config": cfg})
}

func (s *Server) handleAutoEvaluate(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.liveEng().Evaluate())
}

func (s *Server) handlePutWebullToken(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token     string `json:"token"`
		ExpiresAt string `json:"expiresAt"`
	}
	_ = readJSON(r, &body)
	if body.Token == "" {
		writeJSON(w, 400, map[string]any{"error": "token is required"})
		return
	}
	writeJSON(w, 200, s.liveEng().PutToken(body.Token, body.ExpiresAt))
}

func (s *Server) serveWeb(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		http.NotFound(w, r)
		return
	}
	p := r.URL.Path
	if p == "/" {
		p = "/index.html"
	}
	full := filepath.Join(s.WebDir, filepath.Clean(p))
	if !strings.HasPrefix(full, s.WebDir) {
		http.NotFound(w, r)
		return
	}
	if _, err := os.Stat(full); err == nil && !strings.HasSuffix(full, "/") {
		http.ServeFile(w, r, full)
		return
	}
	http.ServeFile(w, r, filepath.Join(s.WebDir, "index.html"))
}

func str(v any) string {
	if v == nil {
		return ""
	}
	s, _ := v.(string)
	return s
}
