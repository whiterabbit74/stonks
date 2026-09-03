package live

import (
	"errors"
	"fmt"
	"math"
	"os"
	"strconv"
	"strings"
	"time"

	"mktorder.com/go/internal/ibs"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

var ErrTestBuyDisabled = errors.New("Live Webull test buy is disabled")

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
	cur = sanitizeAutoTradingConfig(updates, cur)
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
	exp := row.ExpiresAt
	if exp == "" {
		exp = os.Getenv("WEBULL_TOKEN_EXPIRES_AT")
	}
	return map[string]any{
		"hasToken":        source != "none",
		"present":         source != "none",
		"source":          source,
		"expiresAt":       exp,
		"lastCheckAt":     row.LastCheckAt,
		"lastCheckStatus": row.LastCheckStatus,
		"accountId":       os.Getenv("WEBULL_ACCOUNT_ID"),
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

func (e *Engine) TokenHealth() string {
	row := e.DB.GetWebullToken()
	token := row.Token
	if token == "" {
		token = os.Getenv("WEBULL_ACCESS_TOKEN")
	}
	if token == "" {
		return "MISSING"
	}
	if e.Broker == nil {
		return "PRESENT"
	}
	data, err := e.Broker.CheckToken(token)
	if err != nil {
		_ = e.DB.AppendAutotradeLog("token_health_failed " + err.Error())
		return "UNKNOWN"
	}
	status, _ := data["status"].(string)
	if status == "" {
		status = "NORMAL"
	}
	exp, _ := data["expiresAt"].(string)
	if exp == "" {
		exp, _ = data["expires_at"].(string)
	}
	_ = e.DB.SaveWebullToken(token, exp, status)
	if status == "NORMAL" {
		_, _ = e.Broker.Account()
	}
	return status
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
	allowExits := allowFlag(cfg, "allowExits")
	allowEntries := allowFlag(cfg, "allowNewEntries")
	watchBy := map[string]map[string]any{}
	if watches, err := e.DB.ListWatches(); err == nil {
		for _, w := range watches {
			watchBy[store.SafeTicker(fmt.Sprint(w["symbol"]))] = w
		}
	}
	brokerTrades, _ := e.DB.ListTrades("broker_trades")
	open := store.OpenBrokerTrade(brokerTrades)
	var quotes []map[string]any
	for _, sym := range symbols {
		w := watchBy[sym]
		if w == nil {
			w = map[string]any{"symbol": sym}
			if cfgHas(cfg, "lowIBS") {
				w["lowIBS"] = cfg["lowIBS"]
			}
			if cfgHas(cfg, "highIBS") {
				w["highIBS"] = cfg["highIBS"]
			}
		}
		ev := e.evalWatch(sym, w, provider)
		low, high, highInvalid := watchThresholds(w, cfg)
		quotes = append(quotes, map[string]any{
			"symbol": sym, "ok": ev.ok, "ibs": ev.ibs, "currentPrice": ev.price,
			"thresholds":     map[string]any{"lowIBS": low, "highIBS": high},
			"highIBSInvalid": highInvalid,
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
		high := liveHighOrDefault(row)
		if row != nil && asBool(row["highIBSInvalid"]) {
			decision = map[string]any{"action": "none", "reason": "invalid_high_ibs", "symbol": sym, "candidate": row}
		} else if row != nil && ibs.IsExitSignal(row["ibs"], high) {
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
			low := liveLowOrDefault(q)
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

func liveLowOrDefault(row map[string]any) float64 {
	if row == nil {
		return ibs.DefaultLowIBS
	}
	if th, ok := row["thresholds"].(map[string]any); ok && th["lowIBS"] != nil {
		return asFloat(th["lowIBS"])
	}
	return ibs.DefaultLowIBS
}

func liveHighOrDefault(row map[string]any) float64 {
	if row == nil {
		return ibs.DefaultHighIBS
	}
	if th, ok := row["thresholds"].(map[string]any); ok && th["highIBS"] != nil {
		h := asFloat(th["highIBS"])
		if h == 0 {
			return ibs.DefaultHighIBS
		}
		return h
	}
	return ibs.DefaultHighIBS
}

func (e *Engine) Execute(trigger string) EvalResult {
	corr := newCorrelationID()
	ev := e.Evaluate()
	e.mu.Lock()
	e.lastRunAt = ev.EvaluatedAt
	e.lastResult = ev
	e.mu.Unlock()
	action, _ := ev.Decision["action"].(string)
	if action == "none" {
		ev.Executed = false
		e.logAuto("execution_skipped", corr, map[string]any{"trigger": trigger, "reason": "no_signal"})
		return ev
	}
	symbol := store.SafeTicker(fmt.Sprint(ev.Decision["symbol"]))
	key := symbol + ":" + action
	if pending := e.DB.FindPendingTracker(symbol, action); pending != nil {
		ev.Broker = map[string]any{"submitted": false, "error": "pending_" + action + "_tracker_exists", "clientOrderId": pending["clientOrderId"]}
		e.logAuto("order_guarded", corr, map[string]any{"symbol": symbol, "action": action, "reason": "pending_tracker"})
		return ev
	}
	e.mu.Lock()
	if e.reservations == nil {
		e.reservations = map[string]string{}
	}
	if _, taken := e.reservations[key]; taken {
		e.mu.Unlock()
		ev.Broker = map[string]any{"submitted": false, "error": "pending_" + action + "_submission_exists"}
		e.logAuto("order_guarded", corr, map[string]any{"symbol": symbol, "action": action, "reason": "pending_submission"})
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
		e.logAuto("execution_skipped", corr, map[string]any{"symbol": symbol, "reason": "autotrading_disabled"})
		return ev
	}
	if e.Broker == nil {
		ev.Broker = map[string]any{"submitted": false, "error": "Webull credentials are missing", "mode": "off"}
		e.logAuto("execution_blocked", corr, map[string]any{"symbol": symbol, "reason": "missing_webull_credentials"})
		return ev
	}
	if trigger == "scheduler" && e.outsideExecutionWindow(ev.AutoTrading) {
		ev.Broker = map[string]any{"submitted": false, "error": "outside_execution_window"}
		e.logAuto("execution_skipped", corr, map[string]any{"symbol": symbol, "reason": "outside_execution_window"})
		return ev
	}
	price := quotePrice(ev, symbol)
	qty, qerr := e.sizeOrder(action, symbol, ev.AutoTrading, price)
	if qerr != nil {
		ev.Broker = map[string]any{"submitted": false, "error": qerr.Error()}
		e.logAuto("execution_blocked", corr, map[string]any{"symbol": symbol, "reason": qerr.Error()})
		return ev
	}
	e.logBalanceSnapshot(corr, symbol, action)
	side := "BUY"
	if action == "exit" {
		side = "SELL"
	}
	if action == "entry" && asBool(ev.AutoTrading["cancelOpenOrdersBeforeEntry"]) {
		cancelled := e.cancelOpenOrdersBeforeEntry(symbol)
		if len(cancelled) > 0 {
			e.logAuto("open_orders_cancelled", corr, map[string]any{"symbol": symbol, "cancelled_count": len(cancelled)})
		}
	}
	if asBool(ev.AutoTrading["previewBeforeSend"]) {
		e.logAuto("order_preview_skipped", corr, map[string]any{
			"symbol": symbol, "action": action, "side": side, "order_type": "MARKET",
			"quantity": qty, "broker_summary": "preview_unsupported_for_webull_us",
		})
	}
	placeCfg := PlaceMarketCfg{
		Fractional:            asBool(ev.AutoTrading["allowFractionalShares"]),
		TimeInForce:           strOr(ev.AutoTrading["timeInForce"], "DAY"),
		SupportTradingSession: strOr(ev.AutoTrading["supportTradingSession"], "CORE"),
	}
	res, err := e.placeMarket(symbol, side, qty, placeCfg)
	if err != nil {
		res.Error = err.Error()
		res.Submitted = false
	}
	ev.Broker = res
	ev.Executed = res.Submitted
	if res.Submitted {
		e.logAuto("order_submit_ok", corr, map[string]any{
			"symbol": symbol, "action": action, "side": side, "quantity": qty,
			"clientOrderId": res.ClientOrderID, "order_type": "MARKET",
		})
		_ = e.DB.SaveOrderTracker(map[string]any{
			"clientOrderId": res.ClientOrderID, "symbol": symbol, "action": action,
			"status": "submitted", "quantity": qty, "source": trigger, "dateKey": ev.TodayKey,
		})
		ibsVal := 0.0
		if cand, ok := ev.Decision["candidate"].(map[string]any); ok {
			ibsVal = asFloat(cand["ibs"])
		}
		e.rememberOrder(res.ClientOrderID, orderMeta{
			CorrelationID: corr, IBS: ibsVal, DateKey: ev.TodayKey,
			QuotePrice: price, Action: action, Symbol: symbol, Quantity: qty, Source: trigger,
		})
		e.TrackSubmitted(res.ClientOrderID)
	} else {
		e.logAuto("order_submit_failed", corr, map[string]any{
			"symbol": symbol, "action": action, "error": res.Error,
		})
	}
	e.mu.Lock()
	e.lastResult = ev
	e.mu.Unlock()
	return ev
}

func (e *Engine) placeMarket(symbol, side string, qty float64, cfg PlaceMarketCfg) (OrderResult, error) {
	if p, ok := e.Broker.(marketCfgPlacer); ok {
		return p.PlaceMarketCfg(symbol, side, qty, cfg)
	}
	return e.Broker.PlaceMarket(symbol, side, qty)
}

func (e *Engine) logBalanceSnapshot(corr, symbol, action string) {
	if e.Broker == nil {
		return
	}
	acct, err := e.Broker.Account()
	if err != nil || acct == nil {
		return
	}
	root := unwrapBalance(acct)
	asset := preferredAsset(root)
	kv := map[string]any{"symbol": symbol, "action": action}
	if asset != nil {
		kv["day_buying_power"] = asset["day_buying_power"]
		kv["overnight_buying_power"] = firstNonEmpty(asset["overnight_buying_power"], asset["night_trading_buying_power"])
		kv["cash_balance"] = asset["cash_balance"]
		kv["net_liquidation_value"] = asset["net_liquidation_value"]
	}
	e.logAuto("balance_snapshot", corr, kv)
}

func (e *Engine) outsideExecutionWindow(cfg map[string]any) bool {
	win := asFloat(cfg["executionWindowSeconds"])
	if win <= 0 {
		return false
	}
	closeMin := 16 * 60
	raw, _ := e.DB.GetCalendar()
	if len(raw) > 0 {
		// calendar parse lives in scheduler; 16:00 ET is the regular close.
		_ = raw
	}
	p := tradingdate.CurrentTimeNYSE(e.now())
	nowSec := p.Hour*3600 + p.Minute*60
	if loc, err := time.LoadLocation("America/New_York"); err == nil {
		nowSec = e.now().In(loc).Hour()*3600 + e.now().In(loc).Minute()*60 + e.now().In(loc).Second()
	}
	secondsUntilClose := closeMin*60 - nowSec
	return secondsUntilClose < 0 || float64(secondsUntilClose) > win
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
	out := map[string]any{"connection": e.WebullSummary(), "account": snap, "positions": pos}
	if bal, ok := snap["balance"]; ok {
		out["balance"] = bal
	}
	id := snap["account_id"]
	if id == nil {
		id = snap["accountId"]
	}
	if id != nil {
		out["accounts"] = []any{map[string]any{
			"account_id":     id,
			"account_number": id,
			"account_label":  "Configured Webull US account",
			"account_class":  "WEBULL_US",
		}}
	}
	return out, nil
}

func (e *Engine) Dashboard() (map[string]any, error) {
	acc, err := e.Account()
	if acc == nil {
		acc = map[string]any{"positions": []any{}, "connection": e.WebullSummary()}
	}
	var errs []any
	if err != nil {
		acc["error"] = err.Error()
		errs = append(errs, err.Error())
	}
	if account, ok := acc["account"].(map[string]any); ok && account != nil {
		if _, has := acc["balance"]; !has {
			if bal, ok := account["balance"]; ok {
				acc["balance"] = bal
			}
		}
		id := account["account_id"]
		if id == nil {
			id = account["accountId"]
		}
		if id != nil && acc["accounts"] == nil {
			acc["accounts"] = []any{map[string]any{
				"account_id":     id,
				"account_number": id,
				"account_label":  "Configured Webull US account",
				"account_class":  "WEBULL_US",
			}}
		}
	}
	if acc["fetchedAt"] == nil {
		acc["fetchedAt"] = e.now().UTC().Format(time.RFC3339)
	}
	if acc["errors"] == nil {
		if errs == nil {
			errs = []any{}
		}
		acc["errors"] = errs
	}
	open := []any{}
	hist := []any{}
	if e.Broker != nil {
		if rows, oerr := e.Broker.OpenOrders(); oerr == nil && rows != nil {
			open = rows
		} else if oerr != nil {
			acc["openOrdersError"] = oerr.Error()
		}
		today := tradingdate.TodayNYSE(e.now())
		start := tradingdate.AddDays(today, -30)
		if rows, herr := e.Broker.OrderHistory(start, today); herr == nil && rows != nil {
			hist = rows
		} else if herr != nil {
			acc["orderHistoryError"] = herr.Error()
		}
	}
	acc["openOrders"] = open
	acc["orderHistory"] = hist
	return acc, nil
}

func (e *Engine) Logs(limit int) map[string]any {
	logs, _ := e.DB.ListAutotradeLogs(limit)
	autotrade, _ := e.DB.ListAutotradeLogsKind("autotrade", limit)
	monitor, _ := e.DB.ListAutotradeLogsKind("monitor", limit)
	brokerRaw, _ := e.DB.ListAutotradeLogsKind("brokerRaw", limit)
	pending, _ := e.DB.ListPendingTrackers()
	recent, _ := e.DB.ListRecentTrackers(20)
	if logs == nil {
		logs = []map[string]any{}
	}
	if autotrade == nil {
		autotrade = []map[string]any{}
	}
	if monitor == nil {
		monitor = []map[string]any{}
	}
	if brokerRaw == nil {
		brokerRaw = []map[string]any{}
	}
	if pending == nil {
		pending = []map[string]any{}
	}
	if recent == nil {
		recent = []map[string]any{}
	}
	if len(autotrade) == 0 && len(monitor) == 0 && len(brokerRaw) == 0 {
		for _, row := range logs {
			msg := fmt.Sprint(row["message"])
			switch splitLogChannel(msg) {
			case "monitor":
				monitor = append(monitor, row)
			case "brokerRaw":
				brokerRaw = append(brokerRaw, row)
			default:
				autotrade = append(autotrade, row)
			}
		}
	}
	return map[string]any{
		"logs":      logs,
		"autotrade": autotrade,
		"monitor":   monitor,
		"brokerRaw": brokerRaw,
		"pending":   pending,
		"recent":    recent,
	}
}

func (e *Engine) ClosePosition(symbol string) (OrderResult, error) {
	symbol = store.SafeTicker(symbol)
	if e.Broker == nil {
		return OrderResult{Error: "Webull credentials are missing"}, fmt.Errorf("Webull credentials are missing")
	}
	cfg := e.AutoConfig()
	frac := asBool(cfg["allowFractionalShares"])
	pos, err := e.Broker.Positions()
	if err != nil {
		return OrderResult{Error: err.Error(), Symbol: symbol, Side: "SELL"}, err
	}
	qty := PositionQuantity(pos, symbol, frac)
	if !(qty > 0) {
		err := fmt.Errorf("No broker position found for %s", symbol)
		return OrderResult{Error: err.Error(), Symbol: symbol, Side: "SELL"}, err
	}
	res, err := e.placeMarket(symbol, "SELL", qty, PlaceMarketCfg{
		Fractional:            frac,
		TimeInForce:           strOr(cfg["timeInForce"], "DAY"),
		SupportTradingSession: strOr(cfg["supportTradingSession"], "CORE"),
	})
	e.logAuto("close_position", "", map[string]any{"symbol": symbol, "submitted": res.Submitted})
	return res, err
}

func (e *Engine) TestBuy(symbol string, qty float64) (OrderResult, error) {
	if os.Getenv("WEBULL_ENABLE_LIVE_TEST_BUY") != "true" {
		return OrderResult{Error: ErrTestBuyDisabled.Error()}, ErrTestBuyDisabled
	}
	if symbol == "" {
		symbol = "AAL"
	}
	if qty <= 0 {
		qty = 1
	}
	if qty != math.Trunc(qty) {
		return OrderResult{Error: "Test buy quantity must be a positive integer"}, fmt.Errorf("Test buy quantity must be a positive integer")
	}
	maxQty := 1.0
	if raw := strings.TrimSpace(os.Getenv("WEBULL_LIVE_TEST_BUY_MAX_QUANTITY")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			if n > 100 {
				n = 100
			}
			maxQty = float64(n)
		}
	}
	if qty > maxQty {
		msg := fmt.Sprintf("Test buy quantity must be between 1 and %.0f", maxQty)
		return OrderResult{Error: msg}, fmt.Errorf("%s", msg)
	}
	if e.Broker == nil {
		return OrderResult{Error: "Webull credentials are missing"}, fmt.Errorf("Webull credentials are missing")
	}
	cfg := e.AutoConfig()
	res, err := e.placeMarket(store.SafeTicker(symbol), "BUY", qty, PlaceMarketCfg{
		Fractional:            false,
		TimeInForce:           strOr(cfg["timeInForce"], "DAY"),
		SupportTradingSession: strOr(cfg["supportTradingSession"], "CORE"),
	})
	e.logAuto("test_buy", "", map[string]any{"symbol": symbol, "submitted": res.Submitted})
	return res, err
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func (e *Engine) cancelOpenOrdersBeforeEntry(symbol string) []string {
	if e.Broker == nil {
		return nil
	}
	rows, err := e.Broker.OpenOrders()
	if err != nil || len(rows) == 0 {
		return nil
	}
	want := store.SafeTicker(symbol)
	var cancelled []string
	for _, row := range rows {
		m, _ := row.(map[string]any)
		if m == nil {
			continue
		}
		sym := store.SafeTicker(fmt.Sprint(firstNonEmpty(m["symbol"], m["ticker"], m["display_symbol"])))
		if sym != want {
			continue
		}
		st := NormalizeOrderStatus(fmt.Sprint(firstNonEmpty(m["status"], m["order_status"], m["orderStatus"])))
		if IsFinalOrderStatus(st) {
			continue
		}
		id := strings.TrimSpace(fmt.Sprint(firstNonEmpty(m["client_order_id"], m["clientOrderId"])))
		if id == "" || id == "<nil>" {
			continue
		}
		if err := e.Broker.CancelOrder(id); err != nil {
			_ = e.DB.AppendAutotradeLog("open_order_cancel_failed " + id + " " + err.Error())
			continue
		}
		cancelled = append(cancelled, id)
		_ = e.DB.AppendAutotradeLog("open_orders_cancelled " + id + " " + want)
	}
	return cancelled
}

func (e *Engine) LastRun() (string, any) {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.lastRunAt, e.lastResult
}
