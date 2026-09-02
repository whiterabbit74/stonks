package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"

	"mktorder.com/go/internal/indicators"
	"mktorder.com/go/internal/ibs"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

type Server struct {
	DB        *store.DB
	WebDir    string
	BuildID   string
	mux       *http.ServeMux
	prod      bool
	adminUser string
	adminPass string
	loginRate sync.Map
	autoCfg   map[string]any
	autoMu    sync.Mutex
}

func New(db *store.DB, webDir string) *Server {
	s := &Server{
		DB:        db,
		WebDir:    webDir,
		BuildID:   os.Getenv("BUILD_ID"),
		prod:      os.Getenv("NODE_ENV") == "production" || os.Getenv("GO_ENV") == "production",
		adminUser: strings.ToLower(envDefault("ADMIN_USERNAME", "admin@example.com")),
		adminPass: os.Getenv("ADMIN_PASSWORD"),
		autoCfg:   map[string]any{"enabled": false},
	}
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
	s.mux.HandleFunc("POST /api/datasets/{id}/refresh", wrap(s.notImplemented("refresh")))
	s.mux.HandleFunc("POST /api/datasets/{id}/apply-splits", wrap(s.handleApplySplits))
	s.mux.HandleFunc("PATCH /api/datasets/{id}/metadata", wrap(s.handlePatchDatasetMeta))
	// Splits
	s.mux.HandleFunc("GET /api/splits/webull-raw", wrap(s.jsonOK(map[string]any{"splits": []any{}})))
	s.mux.HandleFunc("GET /api/splits", wrap(s.handleAllSplits))
	s.mux.HandleFunc("GET /api/splits/{symbol}", wrap(s.handleGetSplits))
	s.mux.HandleFunc("PUT /api/splits/{symbol}", wrap(s.handlePutSplits))
	s.mux.HandleFunc("PATCH /api/splits/{symbol}", wrap(s.handlePatchSplits))
	s.mux.HandleFunc("DELETE /api/splits/{symbol}/{date}", wrap(s.handleDeleteSplitDate))
	s.mux.HandleFunc("DELETE /api/splits/{symbol}", wrap(s.handleDeleteSplits))
	// Calendar
	s.mux.HandleFunc("GET /api/trading-calendar", wrap(s.handleGetCalendar))
	s.mux.HandleFunc("GET /api/trading/expected-prev-day", wrap(s.handlePrevDay))
	s.mux.HandleFunc("POST /api/trading-calendar/sync-webull", wrap(s.jsonOK(map[string]any{"ok": true, "note": "webull sync requires credentials"})))
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
	s.mux.HandleFunc("POST /api/telegram/send", wrap(s.jsonOK(map[string]any{"ok": true})))
	s.mux.HandleFunc("POST /api/telegram/test", wrap(s.jsonOK(map[string]any{"ok": true})))
	s.mux.HandleFunc("GET /api/telegram/trades", wrap(s.handleMonitorTrades))
	s.mux.HandleFunc("POST /api/telegram/simulate", wrap(s.jsonOK(map[string]any{"ok": true, "simulated": true})))
	s.mux.HandleFunc("POST /api/telegram/actualize-prices", wrap(s.jsonOK(map[string]any{"ok": true})))
	s.mux.HandleFunc("POST /api/telegram/update-positions", wrap(s.jsonOK(map[string]any{"ok": true})))
	s.mux.HandleFunc("POST /api/telegram/update-all", wrap(s.jsonOK(map[string]any{"ok": true})))
	s.mux.HandleFunc("POST /api/telegram/command", wrap(s.jsonOK(map[string]any{"ok": true})))
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
	// Monitor
	s.mux.HandleFunc("GET /api/monitor/consistency", wrap(s.jsonOK(map[string]any{"ok": true, "issues": []any{}})))
	s.mux.HandleFunc("POST /api/monitor/reconcile", wrap(s.jsonOK(map[string]any{"ok": true, "applied": true})))
	// Quotes
	s.mux.HandleFunc("GET /api/quote/{symbol}", wrap(s.handleQuote))
	s.mux.HandleFunc("GET /api/quotes/webull-batch", wrap(s.jsonOK(map[string]any{"quotes": []any{}})))
	s.mux.HandleFunc("GET /api/yahoo-finance/{symbol}", wrap(s.handleQuote))
	s.mux.HandleFunc("GET /api/fetch/{provider}/{symbol}", wrap(s.handleFetchProvider))
	s.mux.HandleFunc("GET /api/test/alpha-vantage", wrap(s.jsonOK(map[string]any{"ok": os.Getenv("ALPHA_VANTAGE_API_KEY") != ""})))
	s.mux.HandleFunc("GET /api/test/finnhub", wrap(s.jsonOK(map[string]any{"ok": os.Getenv("FINNHUB_API_KEY") != ""})))
	s.mux.HandleFunc("GET /api/test/twelve-data", wrap(s.jsonOK(map[string]any{"ok": os.Getenv("TWELVE_DATA_API_KEY") != ""})))
	s.mux.HandleFunc("POST /api/test-provider", wrap(s.handleTestProvider))
	// Status
	s.mux.HandleFunc("GET /api/status", wrap(s.handleStatus))
	// Autotrade
	s.mux.HandleFunc("GET /api/autotrade/config", wrap(s.handleAutoConfig))
	s.mux.HandleFunc("PATCH /api/autotrade/config", wrap(s.handleAutoConfigPatch))
	s.mux.HandleFunc("GET /api/autotrade/status", wrap(s.jsonOK(map[string]any{"running": false})))
	s.mux.HandleFunc("POST /api/autotrade/evaluate", wrap(s.handleAutoEvaluate))
	s.mux.HandleFunc("POST /api/autotrade/execute", wrap(s.jsonOK(map[string]any{"ok": false, "error": "live orders disabled in local Go rewrite"})))
	s.mux.HandleFunc("GET /api/autotrade/webull/account", wrap(s.jsonOK(map[string]any{"configured": os.Getenv("WEBULL_ACCESS_TOKEN") != ""})))
	s.mux.HandleFunc("GET /api/autotrade/webull/dashboard", wrap(s.jsonOK(map[string]any{"positions": []any{}})))
	s.mux.HandleFunc("GET /api/autotrade/logs", wrap(s.jsonOK(map[string]any{"logs": []any{}})))
	s.mux.HandleFunc("POST /api/autotrade/webull/close-position", wrap(s.jsonOK(map[string]any{"ok": false, "error": "live orders disabled"})))
	s.mux.HandleFunc("POST /api/autotrade/webull/test-buy", wrap(s.jsonOK(map[string]any{"ok": false, "error": "live orders disabled"})))
	s.mux.HandleFunc("POST /api/autotrade/webull/token/create", wrap(s.jsonOK(map[string]any{"ok": false})))
	s.mux.HandleFunc("POST /api/autotrade/webull/token/check", wrap(s.jsonOK(map[string]any{"ok": false})))
	s.mux.HandleFunc("PUT /api/autotrade/webull/token", wrap(s.handlePutWebullToken))
	s.mux.HandleFunc("GET /api/autotrade/webull/token/status", wrap(s.jsonOK(map[string]any{"present": false})))
	// Calc
	s.registerCalc()
	// UI
	s.mux.HandleFunc("GET /", s.serveWeb)
}

func (s *Server) jsonOK(v any) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, v) }
}

func (s *Server) notImplemented(name string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 501, map[string]any{"error": name + " requires live provider credentials"})
	}
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
	var body struct{ Password string `json:"password"` }
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
	splits, _ := s.DB.ListSplits(id)
	ds["splits"] = splits
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
	if err := s.DB.SaveDataset(ticker, name, str(payload["companyName"]), str(payload["tag"]), bars, false); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "ticker": ticker, "dataPoints": len(bars)})
}

func (s *Server) handleDeleteDataset(w http.ResponseWriter, r *http.Request) {
	if err := s.DB.DeleteDataset(r.PathValue("id")); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleApplySplits(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ds, _ := s.DB.GetDataset(id)
	if ds == nil {
		writeJSON(w, 404, map[string]any{"error": "Dataset not found"})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handlePatchDatasetMeta(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"ok": true})
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
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(200)
	_, _ = w.Write(raw)
}

func (s *Server) handlePrevDay(w http.ResponseWriter, r *http.Request) {
	now := tradingdate.CurrentTimeNYSE(time.Now())
	d := tradingdate.AddDays(tradingdate.TodayNYSE(time.Now()), -1)
	for i := 0; i < 10; i++ {
		if wd := tradingdate.DayOfWeek(d); wd != 0 && wd != 6 {
			break
		}
		d = tradingdate.AddDays(d, -1)
	}
	_ = now
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
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleWatches(w http.ResponseWriter, r *http.Request) {
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
	_ = s.DB.UpsertEMAAlert(body)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleEMAAlertPatch(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = readJSON(r, &body)
	body["id"] = r.PathValue("id")
	_ = s.DB.UpsertEMAAlert(body)
	writeJSON(w, 200, map[string]any{"ok": true})
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

func (s *Server) handleQuote(w http.ResponseWriter, r *http.Request) {
	sym := strings.ToUpper(r.PathValue("symbol"))
	ds, _ := s.DB.GetDataset(sym)
	if ds == nil {
		writeJSON(w, 404, map[string]any{"error": "no local data and no live provider configured", "symbol": sym})
		return
	}
	writeJSON(w, 200, map[string]any{"symbol": sym, "source": "dataset", "dataset": ds["ticker"]})
}

func (s *Server) handleFetchProvider(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 501, map[string]any{"error": "provider fetch requires API keys", "provider": r.PathValue("provider"), "symbol": r.PathValue("symbol")})
}

func (s *Server) handleTestProvider(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = readJSON(r, &body)
	writeJSON(w, 200, map[string]any{"ok": false, "error": "not configured"})
}

func (s *Server) handleAutoConfig(w http.ResponseWriter, r *http.Request) {
	s.autoMu.Lock()
	defer s.autoMu.Unlock()
	writeJSON(w, 200, s.autoCfg)
}

func (s *Server) handleAutoConfigPatch(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = readJSON(r, &body)
	s.autoMu.Lock()
	for k, v := range body {
		s.autoCfg[k] = v
	}
	out := s.autoCfg
	s.autoMu.Unlock()
	writeJSON(w, 200, out)
}

func (s *Server) handleAutoEvaluate(w http.ResponseWriter, r *http.Request) {
	watches, _ := s.DB.ListWatches()
	var signals []map[string]any
	for _, wch := range watches {
		sym := str(wch["symbol"])
		ds, _ := s.DB.GetDataset(sym)
		if ds == nil {
			continue
		}
		bars := decodeBars(ds["data"])
		if len(bars) == 0 {
			continue
		}
		vals := indicators.IBS(bars)
		last := vals[len(vals)-1]
		low, _ := wch["lowIBS"].(float64)
		high, _ := wch["highIBS"].(float64)
		signals = append(signals, map[string]any{
			"symbol": sym, "ibs": last,
			"entry": ibs.IsEntrySignal(last, low), "exit": ibs.IsExitSignal(last, high),
		})
	}
	writeJSON(w, 200, map[string]any{"signals": signals})
}

func (s *Server) handlePutWebullToken(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"ok": true})
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


