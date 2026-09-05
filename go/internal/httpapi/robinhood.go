package httpapi

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"

	"mktorder.com/go/internal/live"
	"mktorder.com/go/internal/robinhood"
)

func (s *Server) rh() *robinhood.Service {
	return robinhood.New(s.DB)
}

func (s *Server) handleRobinhoodOAuthStart(w http.ResponseWriter, r *http.Request) {
	url, err := s.rh().StartOAuth()
	if err != nil {
		writeJSON(w, 502, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"authorizationUrl": url, "redirectUri": robinhood.RedirectURI})
}

func (s *Server) handleRobinhoodOAuthComplete(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CallbackURL string `json:"callbackUrl"`
	}
	if !s.requireJSON(w, r, &body) {
		return
	}
	if err := s.rh().CompleteFromCallbackURL(body.CallbackURL); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	s.attachRobinhood()
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleRobinhoodOAuthDisconnect(w http.ResponseWriter, r *http.Request) {
	_ = s.rh().Revoke()
	if s.Live != nil {
		s.Live.DetachBroker("robinhood")
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) attachRobinhood() {
	eng := s.liveEng()
	eng.AttachBroker("robinhood", live.NewRobinhoodBroker(s.rh()))
	if s.Providers != nil {
		s.Providers.Robinhood = s.rh()
	}
}

func (s *Server) handleRobinhoodOAuthStatus(w http.ResponseWriter, r *http.Request) {
	row := s.DB.GetRobinhoodOAuth()
	writeJSON(w, 200, map[string]any{
		"connected": row.AccessToken != "",
		"clientId":  row.ClientID != "",
		"account":   row.AccountNumber != "",
		"status":    row.LastCheckStatus,
		"expiresAt": row.ExpiresAt,
	})
}

func (s *Server) handleRobinhoodAccount(w http.ResponseWriter, r *http.Request) {
	br := s.rhBroker()
	if br == nil {
		writeJSON(w, 400, map[string]any{"error": "robinhood not connected"})
		return
	}
	snap, err := br.Account()
	if err != nil {
		writeJSON(w, 502, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, snap)
}

func (s *Server) handleRobinhoodDashboard(w http.ResponseWriter, r *http.Request) {
	br := s.rhBroker()
	if br == nil {
		writeJSON(w, 200, map[string]any{"positions": []any{}, "error": "not connected"})
		return
	}
	// SPA sends ?refresh=1 from API.rhDashboard(true); drop the in-memory
	// Agentic Account so the next agenticAccount() re-resolves.
	if r.URL.Query().Get("refresh") == "1" {
		br.ResetAccount()
	}
	acct, aerr := br.Account()
	pos, perr := br.Positions()
	orders, _ := br.OpenOrders()
	out := map[string]any{"account": acct, "positions": pos, "orders": orders}
	if aerr != nil {
		out["error"] = aerr.Error()
	}
	if perr != nil && out["error"] == nil {
		out["error"] = perr.Error()
	}
	writeJSON(w, 200, out)
}

func (s *Server) handleRobinhoodTools(w http.ResponseWriter, r *http.Request) {
	raw, err := s.rh().MCP.ListTools()
	if err != nil {
		writeJSON(w, 502, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"tools": json.RawMessage(raw)})
}

func (s *Server) handleRobinhoodClose(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Symbol string `json:"symbol"`
	}
	if !s.requireJSON(w, r, &body) {
		return
	}
	if s.liveEng().BrokerNamed("robinhood") == nil {
		writeJSON(w, 400, map[string]any{"error": "robinhood not connected"})
		return
	}
	res, err := s.liveEng().ClosePosition("robinhood", body.Symbol)
	if err != nil {
		writeJSON(w, 502, map[string]any{"error": err.Error(), "result": res})
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "clientOrderId": res.ClientOrderID, "result": res})
}

func (s *Server) handleRobinhoodTestBuy(w http.ResponseWriter, r *http.Request) {
	if os.Getenv("ROBINHOOD_ENABLE_LIVE_TEST_BUY") != "true" {
		writeJSON(w, 403, map[string]any{"error": "Live Robinhood test buy is disabled", "success": false, "submitted": false})
		return
	}
	var body struct {
		Symbol   string  `json:"symbol"`
		Quantity float64 `json:"quantity"`
	}
	if !s.requireJSON(w, r, &body) {
		return
	}
	br := s.rhBroker()
	if br == nil {
		writeJSON(w, 400, map[string]any{"error": "robinhood not connected", "success": false})
		return
	}
	qty, qtyErr := testBuyQuantity(body.Quantity, "ROBINHOOD_LIVE_TEST_BUY_MAX_QUANTITY")
	if qtyErr != nil {
		writeJSON(w, 400, map[string]any{"error": qtyErr.Error(), "success": false, "submitted": false})
		return
	}
	res, err := br.PlaceMarket(body.Symbol, "BUY", qty)
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

func (s *Server) handleBrokersHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.liveEng().BrokersHealth())
}

func (s *Server) rhBroker() *live.RobinhoodBroker {
	if s.Live != nil {
		if b, ok := s.Live.BrokerNamed("robinhood").(*live.RobinhoodBroker); ok && b != nil {
			return b
		}
	}
	row := s.DB.GetRobinhoodOAuth()
	if row.AccessToken == "" && row.ClientID == "" {
		return nil
	}
	return live.NewRobinhoodBroker(s.rh())
}

// testBuyQuantity mirrors live.Engine.TestBuy's ceiling for the Robinhood test
// buy: a whole number of shares, 1 by default, raised only through the env var
// and never above the hard limit of 100. This endpoint sends a real market
// order, so it must not be looser than the Webull one.
func testBuyQuantity(raw float64, envKey string) (float64, error) {
	qty := raw
	if qty <= 0 {
		qty = 1
	}
	if qty != math.Trunc(qty) {
		return 0, fmt.Errorf("Test buy quantity must be a positive integer")
	}
	maxQty := 1.0
	if v := strings.TrimSpace(os.Getenv(envKey)); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			if n > 100 {
				n = 100
			}
			maxQty = float64(n)
		}
	}
	if qty > maxQty {
		return 0, fmt.Errorf("Test buy quantity must be between 1 and %.0f", maxQty)
	}
	return qty, nil
}
