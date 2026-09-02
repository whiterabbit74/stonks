package live

import (
	"fmt"
	"os"
	"strings"
	"time"

	"mktorder.com/go/internal/ibs"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

func (e *Engine) AutoConfig() map[string]any {
	settings := e.DB.Settings()
	cfg, _ := settings["autoTrading"].(map[string]any)
	if cfg == nil {
		cfg = map[string]any{"enabled": false}
	}
	return cfg
}

func (e *Engine) PatchAutoConfig(updates map[string]any) map[string]any {
	settings := e.DB.Settings()
	cur, _ := settings["autoTrading"].(map[string]any)
	if cur == nil {
		cur = map[string]any{}
	}
	for k, v := range updates {
		if k == "config" {
			if inner, ok := v.(map[string]any); ok {
				for ik, iv := range inner {
					cur[ik] = iv
				}
				continue
			}
		}
		cur[k] = v
	}
	cur["lastModifiedAt"] = e.now().UTC().Format(time.RFC3339Nano)
	settings["autoTrading"] = cur
	_ = e.DB.SaveSettings(settings)
	return cur
}

func (e *Engine) WebullSummary() map[string]any {
	row := e.DB.GetWebullToken()
	envTok := os.Getenv("WEBULL_ACCESS_TOKEN")
	has := row.Token != "" || envTok != ""
	return map[string]any{
		"configured":     os.Getenv("WEBULL_APP_KEY") != "" || has,
		"hasAccessToken": has,
		"hasAccountId":   os.Getenv("WEBULL_ACCOUNT_ID") != "",
		"host":           envOr("WEBULL_API_HOST", "api.webull.com"),
	}
}

func (e *Engine) TokenStatus() map[string]any {
	row := e.DB.GetWebullToken()
	envTok := os.Getenv("WEBULL_ACCESS_TOKEN")
	source := "none"
	if row.Token != "" {
		source = "db"
	} else if envTok != "" {
		source = "env"
	}
	return map[string]any{
		"hasToken":        source != "none",
		"present":         source != "none",
		"source":          source,
		"expiresAt":       nil,
		"lastCheckStatus": row.LastCheckStatus,
	}
}

func (e *Engine) PutToken(token, expiresAt string) map[string]any {
	_ = e.DB.SaveWebullToken(token, expiresAt, "NORMAL")
	return map[string]any{"success": true, "expiresAt": expiresAt, "hasToken": token != ""}
}

func (e *Engine) CreateToken() (map[string]any, error) {
	if e.Broker == nil {
		return nil, fmt.Errorf("Webull credentials are missing")
	}
	data, err := e.Broker.CreateToken()
	if err != nil {
		return nil, err
	}
	tok, _ := data["token"].(string)
	if tok == "" {
		tok, _ = data["access_token"].(string)
	}
	exp, _ := data["expiresAt"].(string)
	persisted := tok != ""
	if persisted {
		_ = e.DB.SaveWebullToken(tok, exp, "PENDING")
	}
	data["persisted"] = persisted
	return data, nil
}

func (e *Engine) CheckToken(token string) (map[string]any, error) {
	if token == "" {
		token = e.DB.GetWebullToken().Token
	}
	if e.Broker == nil {
		return map[string]any{"status": "UNKNOWN"}, nil
	}
	data, err := e.Broker.CheckToken(token)
	if err != nil {
		return nil, err
	}
	status, _ := data["status"].(string)
	if status == "" {
		status = "NORMAL"
	}
	if token != "" {
		_ = e.DB.SaveWebullToken(token, "", status)
	}
	return data, nil
}

func (e *Engine) CanSubmit() bool {
	cfg := e.AutoConfig()
	enabled, _ := cfg["enabled"].(bool)
	if !enabled {
		return false
	}
	if e.Broker == nil {
		return false
	}
	st := e.TokenStatus()
	has, _ := st["hasToken"].(bool)
	return has
}

type EvalResult struct {
	EvaluatedAt string           `json:"evaluatedAt"`
	TodayKey    string           `json:"todayKey"`
	AutoTrading map[string]any   `json:"autoTrading"`
	Symbols     []string         `json:"symbols"`
	Quotes      []map[string]any `json:"quotes"`
	OpenTrade   map[string]any   `json:"openTrade"`
	Decision    map[string]any   `json:"decision"`
	Executed    bool             `json:"executed"`
	Live        bool             `json:"live"`
	Broker      any              `json:"broker,omitempty"`
}

func (e *Engine) Evaluate() EvalResult {
	cfg := e.AutoConfig()
	today := tradingdate.TodayNYSE(e.now())
	symbols := configuredSymbols(cfg, e)
	provider, _ := cfg["provider"].(string)
	if provider == "" {
		provider = "finnhub"
	}
	low, _ := cfg["lowIBS"].(float64)
	high, _ := cfg["highIBS"].(float64)
	allowExits, _ := cfg["allowExits"].(bool)
	if _, ok := cfg["allowExits"]; !ok {
		allowExits = true
	}
	allowEntries, _ := cfg["allowNewEntries"].(bool)
	if _, ok := cfg["allowNewEntries"]; !ok {
		allowEntries = true
	}
	brokerTrades, _ := e.DB.ListTrades("broker_trades")
	open := store.OpenBrokerTrade(brokerTrades)
	var quotes []map[string]any
	for _, sym := range symbols {
		w := map[string]any{"symbol": sym, "lowIBS": low, "highIBS": high}
		ev := e.evalWatch(sym, w, provider)
		quotes = append(quotes, map[string]any{
			"symbol": sym, "ok": ev.ok, "ibs": ev.ibs,
			"thresholds": map[string]any{"lowIBS": low, "highIBS": high},
		})
	}
	decision := map[string]any{"action": "none", "reason": "no_signal", "symbol": nil, "candidate": nil}
	if open != nil && allowExits {
		sym := store.SafeTicker(fmt.Sprint(open["symbol"]))
		var row map[string]any
		for _, q := range quotes {
			if q["symbol"] == sym && q["ok"] == true {
				row = q
				break
			}
		}
		if row != nil && ibs.IsExitSignal(row["ibs"], high) {
			decision = map[string]any{"action": "exit", "reason": "ibs_exit", "symbol": sym, "candidate": row}
		} else {
			reason := "open_position_quote_unavailable"
			if row != nil {
				reason = "exit_threshold_not_reached"
			}
			decision = map[string]any{"action": "none", "reason": reason, "symbol": sym, "candidate": row}
		}
	} else if open == nil && allowEntries {
		var best map[string]any
		bestIBS := 2.0
		for _, q := range quotes {
			if q["ok"] != true {
				continue
			}
			v, _ := q["ibs"].(float64)
			if ibs.IsEntrySignal(v, low) && v < bestIBS {
				bestIBS = v
				best = q
			}
		}
		if best != nil {
			decision = map[string]any{"action": "entry", "reason": "lowest_ibs_signal", "symbol": best["symbol"], "candidate": best}
		}
	}
	enabled, _ := cfg["enabled"].(bool)
	return EvalResult{
		EvaluatedAt: e.now().UTC().Format(time.RFC3339Nano),
		TodayKey:    today,
		AutoTrading: cfg,
		Symbols:     symbols,
		Quotes:      quotes,
		OpenTrade:   open,
		Decision:    decision,
		Live:        enabled,
	}
}

func (e *Engine) Execute(trigger string) EvalResult {
	ev := e.Evaluate()
	e.mu.Lock()
	e.lastRunAt = ev.EvaluatedAt
	e.lastResult = ev
	e.mu.Unlock()
	action, _ := ev.Decision["action"].(string)
	if action == "none" {
		ev.Executed = false
		_ = e.DB.AppendAutotradeLog("execution_skipped " + trigger + " no_signal")
		return ev
	}
	symbol := store.SafeTicker(fmt.Sprint(ev.Decision["symbol"]))
	key := symbol + ":" + action
	e.mu.Lock()
	if e.reservations == nil {
		e.reservations = map[string]string{}
	}
	if _, taken := e.reservations[key]; taken {
		e.mu.Unlock()
		ev.Broker = map[string]any{"submitted": false, "error": "pending_" + action + "_submission_exists"}
		_ = e.DB.AppendAutotradeLog("order_guarded " + key)
		return ev
	}
	e.reservations[key] = "submitting"
	e.mu.Unlock()
	defer func() {
		e.mu.Lock()
		delete(e.reservations, key)
		e.mu.Unlock()
	}()

	enabled, _ := ev.AutoTrading["enabled"].(bool)
	if !enabled {
		ev.Broker = map[string]any{"submitted": false, "simulated": false, "error": "Autotrading is disabled", "mode": "off"}
		_ = e.DB.AppendAutotradeLog("execution_skipped autotrading_disabled " + symbol)
		return ev
	}
	if e.Broker == nil {
		ev.Broker = map[string]any{"submitted": false, "error": "Webull credentials are missing", "mode": "off"}
		_ = e.DB.AppendAutotradeLog("execution_blocked missing_webull_credentials " + symbol)
		return ev
	}
	qty := 1.0
	if v, ok := ev.AutoTrading["fixedQuantity"].(float64); ok && v > 0 {
		qty = v
	}
	side := "BUY"
	if action == "exit" {
		side = "SELL"
	}
	res, err := e.Broker.PlaceMarket(symbol, side, qty)
	if err != nil {
		res.Error = err.Error()
		res.Submitted = false
	}
	ev.Broker = res
	ev.Executed = res.Submitted
	_ = e.DB.AppendAutotradeLog(fmt.Sprintf("order_%s %s %s submitted=%v id=%s", action, symbol, side, res.Submitted, res.ClientOrderID))
	if res.Submitted {
		if action == "entry" {
			_ = e.DB.InsertTrade("broker_trades", map[string]any{
				"id": res.ClientOrderID, "symbol": symbol, "status": "open",
				"entryDate": ev.TodayKey, "entryPrice": 0, "source": trigger, "quantity": qty,
			})
		} else if ev.OpenTrade != nil {
			_ = e.DB.PatchTrade("broker_trades", fmt.Sprint(ev.OpenTrade["id"]), map[string]any{
				"status": "closed", "exitDate": ev.TodayKey,
			})
		}
	}
	e.mu.Lock()
	e.lastResult = ev
	e.mu.Unlock()
	return ev
}

func (e *Engine) Status() map[string]any {
	ev := e.Evaluate()
	e.mu.Lock()
	last := e.lastRunAt
	res := e.lastResult
	e.mu.Unlock()
	return map[string]any{
		"evaluation": ev,
		"webull":     e.WebullSummary(),
		"state":      map[string]any{"lastRunAt": last, "lastResult": res, "running": e.CanSubmit()},
	}
}

func (e *Engine) Account() (map[string]any, error) {
	if e.Broker == nil {
		return nil, fmt.Errorf("Webull credentials are not configured")
	}
	snap, err := e.Broker.Account()
	if err != nil {
		return nil, err
	}
	pos, _ := e.Broker.Positions()
	if pos == nil {
		pos = []any{}
	}
	return map[string]any{"connection": e.WebullSummary(), "account": snap, "positions": pos}, nil
}

func (e *Engine) Dashboard() (map[string]any, error) {
	acc, err := e.Account()
	if err != nil {
		return map[string]any{"positions": []any{}, "connection": e.WebullSummary(), "error": err.Error()}, nil
	}
	return acc, nil
}

func (e *Engine) Logs(limit int) map[string]any {
	logs, _ := e.DB.ListAutotradeLogs(limit)
	return map[string]any{"logs": logs}
}

func (e *Engine) ClosePosition(symbol string) (OrderResult, error) {
	symbol = store.SafeTicker(symbol)
	if e.Broker == nil {
		return OrderResult{Error: "Webull credentials are missing"}, fmt.Errorf("Webull credentials are missing")
	}
	res, err := e.Broker.CloseMarket(symbol)
	_ = e.DB.AppendAutotradeLog("close_position " + symbol + " submitted=" + fmt.Sprint(res.Submitted))
	return res, err
}

func (e *Engine) TestBuy(symbol string, qty float64) (OrderResult, error) {
	if symbol == "" {
		symbol = "AAL"
	}
	if qty <= 0 {
		qty = 1
	}
	if e.Broker == nil {
		return OrderResult{Error: "Webull credentials are missing"}, fmt.Errorf("Webull credentials are missing")
	}
	res, err := e.Broker.PlaceMarket(store.SafeTicker(symbol), "BUY", qty)
	_ = e.DB.AppendAutotradeLog("test_buy " + symbol + " submitted=" + fmt.Sprint(res.Submitted))
	return res, err
}

func configuredSymbols(cfg map[string]any, e *Engine) []string {
	onlyWatches := true
	if v, ok := cfg["onlyFromTelegramWatches"].(bool); ok {
		onlyWatches = v
	}
	var out []string
	seen := map[string]struct{}{}
	add := func(s string) {
		s = store.SafeTicker(s)
		if s == "" {
			return
		}
		if _, ok := seen[s]; ok {
			return
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	if raw, ok := cfg["symbols"].(string); ok && raw != "" {
		for _, p := range strings.Split(raw, ",") {
			add(p)
		}
	}
	if onlyWatches || len(out) == 0 {
		watches, _ := e.DB.ListWatches()
		for _, w := range watches {
			add(fmt.Sprint(w["symbol"]))
		}
	}
	return out
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func (e *Engine) LastRun() (string, any) {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.lastRunAt, e.lastResult
}
