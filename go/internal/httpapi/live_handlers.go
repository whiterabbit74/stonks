package httpapi

import (
	"net/http"
	"os"
	"strconv"

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
	_ = readJSON(r, &body)
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
	_ = readJSON(r, &body)
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
	_ = readJSON(r, &body)
	res, err := s.liveEng().Simulate(body.Stage)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error(), "success": false, "stage": res.Stage})
		return
	}
	writeJSON(w, 200, map[string]any{"success": res.Success, "sent": res.Sent, "stage": res.Stage, "tickers": res.Tickers, "text": res.Text})
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
	_ = readJSON(r, &body)
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
	_ = readJSON(r, &body)
	writeJSON(w, 200, s.liveEng().Reconcile(body.Mode == "apply"))
}

func (s *Server) handleAutoStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.liveEng().Status())
}

func (s *Server) handleAutoExecute(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.liveEng().Execute("manual_execute"))
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
	snap, _ := s.liveEng().Dashboard()
	writeJSON(w, 200, snap)
}

func (s *Server) handleAutoLogs(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	writeJSON(w, 200, s.liveEng().Logs(limit))
}

func (s *Server) handleWebullClose(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Symbol string `json:"symbol"`
	}
	_ = readJSON(r, &body)
	res, err := s.liveEng().ClosePosition(body.Symbol)
	if err != nil {
		writeJSON(w, 502, map[string]any{"error": err.Error(), "result": res})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "clientOrderId": res.ClientOrderID, "result": res})
}

func (s *Server) handleWebullTestBuy(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Symbol   string  `json:"symbol"`
		Quantity float64 `json:"quantity"`
	}
	_ = readJSON(r, &body)
	res, err := s.liveEng().TestBuy(body.Symbol, body.Quantity)
	if err != nil || !res.Submitted {
		reason := res.Error
		if reason == "" && err != nil {
			reason = err.Error()
		}
		writeJSON(w, 422, map[string]any{"success": false, "submitted": false, "error": reason, "result": res})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "submitted": true, "clientOrderId": res.ClientOrderID, "result": res})
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
	_ = readJSON(r, &body)
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

func (s *Server) handleCalendarSync(w http.ResponseWriter, r *http.Request) {
	out, err := s.liveEng().SyncCalendar()
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
