package httpapi

import (
	"errors"
	"net/http"
	"os"
	"strconv"
	"strings"

	"mktorder.com/go/internal/live"
)

func (s *Server) liveEng() *live.Engine {
	if s.Live == nil {
		s.Live = live.New(s.DB, s.Providers)
	}
	return s.Live
}

func (s *Server) handleTelegramSend(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Message string `json:"message"`
		ChatID  string `json:"chatId"`
	}
	if !s.requireJSON(w, r, &body) {
		return
	}
	if body.ChatID == "" {
		body.ChatID = os.Getenv("TELEGRAM_CHAT_ID")
	}
	if body.ChatID == "" {
		writeJSON(w, 400, map[string]any{"error": "No chat id configured"})
		return
	}
	if body.Message == "" {
		writeJSON(w, 400, map[string]any{"error": "Message is required"})
		return
	}
	if err := s.liveEng().Send(body.ChatID, body.Message); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "sent": true})
}

func (s *Server) handleTelegramTest(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Message string `json:"message"`
	}
	if !s.requireJSON(w, r, &body) {
		return
	}
	msg := body.Message
	if msg == "" {
		msg = "🧪 Test message from Trading Backtester"
	}
	if err := s.liveEng().Send("", msg); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "sent": true})
}

func (s *Server) handleTelegramSimulate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Stage string `json:"stage"`
	}
	if !s.requireJSON(w, r, &body) {
		return
	}
	res, err := s.liveEng().Simulate(body.Stage)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error(), "success": false, "stage": res.Stage})
		return
	}
	out := map[string]any{
		"success": res.Success, "sent": res.Sent, "stage": res.Stage,
		"tickers": res.Tickers, "text": res.Text, "dryRun": res.DryRun, "executed": res.Executed,
	}
	if res.Reason != "" {
		out["reason"] = res.Reason
	}
	writeJSON(w, 200, out)
}

func (s *Server) handleActualizePrices(w http.ResponseWriter, r *http.Request) {
	res := s.liveEng().Actualize(true)
	writeJSON(w, 200, res)
}

func (s *Server) handleUpdatePositions(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.liveEng().UpdatePositions())
}

func (s *Server) handleUpdateAll(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.liveEng().UpdateAll(true))
}

func (s *Server) handleTelegramCommand(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Command string `json:"command"`
		Limit   int    `json:"limit"`
	}
	if !s.requireJSON(w, r, &body) {
		return
	}
	out, err := s.liveEng().Command(body.Command, body.Limit)
	if err != nil && out == nil {
		code := 400
		if body.Command != "" {
			code = 502
		}
		writeJSON(w, code, map[string]any{"error": err.Error()})
		return
	}
	if err != nil {
		code := 400
		if fmtErr, ok := out["error"].(string); ok && fmtErr == "send_failed" {
			code = 502
		}
		writeJSON(w, code, out)
		return
	}
	writeJSON(w, 200, out)
}

func (s *Server) handleMonitorConsistency(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.liveEng().Consistency())
}

func (s *Server) handleMonitorReconcile(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Mode string `json:"mode"`
	}
	if !s.requireJSON(w, r, &body) {
		return
	}
	writeJSON(w, 200, s.liveEng().Reconcile(body.Mode == "apply"))
}

func (s *Server) handleAutoStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.liveEng().Status())
}

func (s *Server) handleAutoExecute(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.liveEng().ExecuteCtx(r.Context(), "manual_execute"))
}

func (s *Server) handleWebullAccount(w http.ResponseWriter, r *http.Request) {
	snap, err := s.liveEng().Account()
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error(), "configured": false})
		return
	}
	writeJSON(w, 200, snap)
}

func (s *Server) handleWebullDashboard(w http.ResponseWriter, r *http.Request) {
	// SPA sends ?refresh=1 from API.dashboard(true). Dashboard() has no
	// in-memory account cache to bust (unlike RobinhoodBroker.account); the
	// query is still read so the client argument is not dead.
	_ = r.URL.Query().Get("refresh")
	snap, _ := s.liveEng().Dashboard()
	writeJSON(w, 200, snap)
}

func (s *Server) handleAutoLogs(w http.ResponseWriter, r *http.Request) {
	limit := clampQueryLimit(r.URL.Query().Get("limit"), 200, autoLogsMaxLimit)
	writeJSON(w, 200, s.liveEng().Logs(limit))
}

func clampQueryLimit(raw string, def, max int) int {
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return def
	}
	if n > max {
		return max
	}
	return n
}

func (s *Server) handleWebullClose(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Symbol string `json:"symbol"`
	}
	if !s.requireJSON(w, r, &body) {
		return
	}
	res, err := s.liveEng().ClosePosition(body.Symbol)
	if err != nil {
		writeJSON(w, 502, map[string]any{"error": err.Error(), "result": res})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "clientOrderId": res.ClientOrderID, "result": res})
}

func (s *Server) handleWebullTestBuy(w http.ResponseWriter, r *http.Request) {
	if os.Getenv("WEBULL_ENABLE_LIVE_TEST_BUY") != "true" {
		writeJSON(w, 403, map[string]any{"error": "Live Webull test buy is disabled", "success": false, "submitted": false})
		return
	}
	var body struct {
		Symbol   string  `json:"symbol"`
		Quantity float64 `json:"quantity"`
	}
	if !s.requireJSON(w, r, &body) {
		return
	}
	res, err := s.liveEng().TestBuy(body.Symbol, body.Quantity)
	if err != nil || !res.Submitted {
		reason := res.Error
		if reason == "" && err != nil {
			reason = err.Error()
		}
		code := 422
		if errors.Is(err, live.ErrTestBuyDisabled) {
			code = 403
		} else if strings.Contains(reason, "Test buy quantity") {
			code = 400
		}
		writeJSON(w, code, map[string]any{"success": false, "submitted": false, "error": reason, "result": res})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "submitted": true, "clientOrderId": res.ClientOrderID, "result": res})
}

func (s *Server) handleTrackerResolve(w http.ResponseWriter, r *http.Request) {
	clientOrderID := r.PathValue("clientOrderId")
	var body struct {
		Outcome     string  `json:"outcome"`
		FilledPrice float64 `json:"filledPrice"`
		FilledQty   float64 `json:"filledQty"`
		Note        string  `json:"note"`
	}
	if !s.requireJSON(w, r, &body) {
		return
	}
	t, err := s.liveEng().ResolveTracker(clientOrderID, body.Outcome, body.Note, body.FilledPrice, body.FilledQty)
	if err != nil {
		code := 400
		if err.Error() == "tracker not found" {
			code = 404
		}
		writeJSON(w, code, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "tracker": t})
}

func (s *Server) handleTrackerPersistBlockResolve(w http.ResponseWriter, r *http.Request) {
	broker := r.PathValue("broker")
	var body struct {
		Note string `json:"note"`
	}
	if !s.requireJSON(w, r, &body) {
		return
	}
	if err := s.liveEng().ClearTrackerPersistBlock(broker, body.Note); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "broker": broker})
}

func (s *Server) handleTokenCreate(w http.ResponseWriter, r *http.Request) {
	data, err := s.liveEng().CreateToken()
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, data)
}

func (s *Server) handleTokenCheck(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token string `json:"token"`
	}
	if !s.requireJSON(w, r, &body) {
		return
	}
	data, err := s.liveEng().CheckToken(body.Token)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, data)
}

func (s *Server) handleTokenStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.liveEng().TokenStatus())
}

func (s *Server) handleCalendarFetch(w http.ResponseWriter, r *http.Request) {
	out, err := s.liveEng().FetchCalendar()
	if err != nil {
		writeJSON(w, 502, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, out)
}

func (s *Server) handleWebullRawSplits(w http.ResponseWriter, r *http.Request) {
	out, err := s.liveEng().WebullRawSplits(r.URL.Query().Get("symbol"))
	if err != nil {
		writeJSON(w, 502, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, out)
}
