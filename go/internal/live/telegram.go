package live

import (
	"fmt"
	"strings"

	"mktorder.com/go/internal/ibs"
	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

type SimulateResult struct {
	Success  bool     `json:"success"`
	Sent     bool     `json:"sent"`
	Stage    string   `json:"stage"`
	Text     string   `json:"text,omitempty"`
	Tickers  []string `json:"tickers,omitempty"`
	Reason   string   `json:"reason,omitempty"`
	DryRun   bool     `json:"dryRun,omitempty"`
	Executed bool     `json:"executed,omitempty"`
	Broker   any      `json:"broker,omitempty"`
}

func StageMinutes(stage string) int {
	if stage == "confirmations" || stage == "t1" || stage == "T-1" {
		return 1
	}
	return 11
}

func (e *Engine) Send(chatID, text string) error {
	if e.Telegram == nil {
		return fmt.Errorf("telegram not configured")
	}
	if chatID == "" {
		chatID = e.chat()
	}
	if chatID == "" {
		return fmt.Errorf("No chat id configured")
	}
	if text == "" {
		return fmt.Errorf("Message is required")
	}
	return e.Telegram.Send(chatID, text)
}

func (e *Engine) Test() error {
	return e.Send(e.chat(), "🧪 Test message from Trading Backtester")
}

func (e *Engine) Command(command string, limit int) (map[string]any, error) {
	normalized := strings.TrimSpace(strings.ToLower(command))
	if normalized == "" {
		return nil, fmt.Errorf("command_required")
	}
	if normalized != "/trades" && normalized != "trades" {
		return map[string]any{"error": "unknown_command", "command": normalized}, fmt.Errorf("unknown_command")
	}
	if limit <= 0 {
		limit = 5
	}
	if limit > 50 {
		limit = 50
	}
	text := e.tradeHistoryMessage(limit)
	if err := e.Send(e.chat(), text); err != nil {
		return map[string]any{"error": "send_failed", "command": normalized}, err
	}
	return map[string]any{"success": true, "command": normalized, "sent": true}, nil
}

type AggregateOpts struct {
	ForceSend   bool // keep going if Telegram send fails (scheduler)
	DryRun      bool
	UpdateState bool // honor/persist t11Sent/t1Sent; HTTP simulate leaves this false
}

func (e *Engine) Simulate(stage string) (SimulateResult, error) {
	if stage == "" {
		stage = "overview"
	}
	minutes := StageMinutes(stage)
	return e.Aggregate(minutes, AggregateOpts{ForceSend: true, DryRun: true})
}

func (e *Engine) Aggregate(minutesUntilClose int, opts AggregateOpts) (SimulateResult, error) {
	stage := "overview"
	if minutesUntilClose <= 2 {
		stage = "confirmations"
	}
	out := SimulateResult{Stage: stage, DryRun: opts.DryRun}
	watches, _ := e.DB.ListWatches()
	emaAlerts := e.EvaluateEMAAlerts()
	if len(watches) == 0 && len(emaAlerts) == 0 {
		out.Reason = "no_watches"
		return out, nil
	}
	today := tradingdate.TodayNYSE(e.now())
	settings := e.DB.Settings()
	provider, _ := settings["resultsQuoteProvider"].(string)
	if provider == "" {
		provider = "finnhub"
	}
	var rows []t1Watch
	var integ []IntegrityResult
	for _, w := range watches {
		sym := fmt.Sprint(w["symbol"])
		ev := e.evalWatch(sym, w, provider)
		rows = append(rows, t1Watch{sym: sym, eval: ev})
		out.Tickers = append(out.Tickers, sym)
		if ev.blocked {
			integ = append(integ, ev.warning)
		}
	}
	for _, a := range emaAlerts {
		if a.Warning.BlockSignals {
			integ = append(integ, a.Warning)
		}
	}
	if opts.UpdateState {
		t11Sent, t1Sent := e.DB.AggregateState(e.chat(), today)
		if stage != "confirmations" && t11Sent {
			out.Reason = "already_sent"
			return out, nil
		}
		if stage == "confirmations" && t1Sent {
			out.Reason = "already_sent"
			return out, nil
		}
	}
	if stage != "confirmations" {
		text := e.buildT11Text(minutesUntilClose, today, provider, rows, emaAlerts, integ)
		res, err := e.finishSend(&out, text, opts)
		if res.Sent {
			if ema := buildEmaOverviewMessage(emaAlerts); ema != "" {
				if e.Send(e.chat(), ema) == nil {
					res.Text += "\n" + ema
				}
			}
			if opts.UpdateState {
				_ = e.DB.MarkAggregateT11(e.chat(), today)
			}
			if !opts.DryRun {
				e.persistEmaAfterSend(emaAlerts, stage)
			}
		}
		return res, err
	}

	if opts.UpdateState && !opts.DryRun {
		claimed, err := e.DB.ClaimAggregateT1(e.chat(), today)
		if err != nil {
			out.Reason = err.Error()
			return out, err
		}
		if !claimed {
			out.Reason = "already_sent"
			return out, nil
		}
	}

	snap := e.Consistency()
	blocking := BlockingMismatch(snap)
	if blocking != nil {
		_ = e.DB.AppendAutotradeLog("t1_monitor_mismatch " + fmt.Sprint(blocking["code"]) + " " + fmt.Sprint(blocking["message"]))
	}
	_ = e.DB.AppendAutotradeLog("t1_execution_started")

	var exitRes, entryRes EvalResult
	waitFill := false
	if blocking == nil {
		if opts.DryRun {
			_ = e.DB.AppendAutotradeLog("t1_dry_run")
			exitRes = e.Evaluate()
		} else {
			exitRes = e.Execute("telegram_t1")
			out.Executed = exitRes.Executed
			out.Broker = exitRes.Broker
			action, _ := exitRes.Decision["action"].(string)
			if action == "exit" && e.DB.FindPendingTracker("", "exit") != nil {
				waitFill = true
				_ = e.DB.AppendAutotradeLog("t1_entry_blocked_waiting_exit_fill")
			}
			if !waitFill && action == "exit" && exitRes.Executed {
				entryRes = e.Execute("telegram_t1")
				if entryRes.Executed {
					out.Executed = true
					out.Broker = entryRes.Broker
				}
			}
		}
	}

	text := e.buildT1Text(today, rows, blocking, opts.DryRun, waitFill, exitRes, entryRes, integ)
	res, err := e.finishSend(&out, text, opts)
	if res.Sent {
		if ema := buildEmaDecisionMessage(emaAlerts); ema != "" {
			if e.Send(e.chat(), ema) == nil {
				res.Text += "\n" + ema
			}
		}
		if !opts.DryRun {
			e.persistEmaAfterSend(emaAlerts, stage)
		}
	}
	return res, err
}

func (e *Engine) finishSend(out *SimulateResult, text string, opts AggregateOpts) (SimulateResult, error) {
	out.Text = text
	if err := e.Send(e.chat(), text); err != nil {
		out.Reason = err.Error()
		if !opts.ForceSend {
			return *out, err
		}
	} else {
		out.Sent = true
		out.Success = true
	}
	return *out, nil
}

type t1Watch struct {
	sym  string
	eval watchEval
}

func (e *Engine) buildT1Text(today string, rows []t1Watch, blocking map[string]any, dryRun, waitFill bool, exitRes, entryRes EvalResult, integ []IntegrityResult) string {
	_ = today
	var decision []string
	if block := FormatIntegrityWarningBlock(integ); block != "" {
		var syms []string
		for _, w := range integ {
			if w.BlockSignals {
				syms = append(syms, w.Symbol)
			}
		}
		decision = append(decision, "• Проверка данных: сигналы заблокированы по "+strings.Join(syms, ", "))
	}
	if blocking != nil {
		decision = append(decision, "• Состояние брокера: "+fmt.Sprint(blocking["message"]))
		decision = append(decision, "• Monitor продолжает считать позиции независимо от брокера")
	}
	if waitFill {
		decision = append(decision, "• Вход заблокирован: ждём подтверждение fill по выходу")
	}
	appendExec := func(res EvalResult, dry bool) {
		action, _ := res.Decision["action"].(string)
		if action == "" || action == "none" {
			return
		}
		sym := fmt.Sprint(res.Decision["symbol"])
		price := quotePrice(res, sym)
		ibsVal := 0.0
		if cand, ok := res.Decision["candidate"].(map[string]any); ok {
			ibsVal = asFloat(cand["ibs"])
		}
		priceS := "—"
		if price > 0 {
			priceS = fmt.Sprintf("$%.2f", price)
		}
		ibsS := fmt.Sprintf("%.1f%%", ibsVal*100)
		verb := "Открываем"
		side := "BUY"
		if action == "exit" {
			verb = "Закрываем"
			side = "SELL"
		}
		decision = append(decision, fmt.Sprintf("• %s %s по %s (IBS %s)", verb, sym, priceS, ibsS))
		if dry {
			decision = append(decision, "• Webull: dry run (ордер не отправлен)")
			return
		}
		submitted := false
		qty := any("—")
		errS := ""
		switch br := res.Broker.(type) {
		case OrderResult:
			submitted = br.Submitted
			if br.Quantity > 0 {
				qty = br.Quantity
			}
			errS = br.Error
		case map[string]any:
			submitted, _ = br["submitted"].(bool)
			if br["quantity"] != nil {
				qty = br["quantity"]
			}
			if br["error"] != nil {
				errS = fmt.Sprint(br["error"])
			}
		}
		if submitted {
			decision = append(decision, fmt.Sprintf("• Webull: %s MARKET отправлен (%v шт.)", side, qty))
		} else if errS != "" {
			decision = append(decision, "• Webull ошибка: "+errS)
		}
	}
	if dryRun {
		appendExec(exitRes, true)
	} else {
		appendExec(exitRes, false)
		appendExec(entryRes, false)
	}
	if len(decision) == 0 {
		decision = append(decision, "• Действий нет")
	}
	freshN := 0
	for _, r := range rows {
		if r.eval.rtFresh {
			freshN++
		}
	}
	freshness := "Котировки: тикеры не отслеживаются"
	if n := len(rows); n > 0 {
		if freshN == n {
			freshness = "Котировки: получены ✅"
		} else if freshN == 0 {
			freshness = "Котировки: нет данных ❌"
		} else {
			freshness = fmt.Sprintf("Котировки: %d/%d ⚠️", freshN, n)
		}
	}
	position := "Позиция: нет"
	if open := e.openMonitorTrade(); open != nil {
		price := "—"
		if p := asFloat(open["entryPrice"]); p > 0 {
			price = fmt.Sprintf("$%.2f", p)
		}
		position = fmt.Sprintf("Позиция: %s (вход %s по %s)", open["symbol"], nz(fmt.Sprint(open["entryDate"])), price)
	}
	lines := []string{"<b>⏱️ 1 минута до закрытия</b>", ""}
	if block := FormatIntegrityWarningBlock(integ); block != "" {
		lines = append(lines, block, "")
	}
	lines = append(lines, "<b>🎯 РЕШЕНИЕ:</b>")
	lines = append(lines, decision...)
	lines = append(lines, "", freshness, position)
	return strings.Join(lines, "\n")
}

type watchEval struct {
	ok, entry, exit, blocked bool
	rtFresh, histFresh       bool
	nearEntry, nearExit      bool
	ibs, price, low, high    float64
	warning                  IntegrityResult
}

const nearDelta = 0.02

func (e *Engine) evalWatch(sym string, w map[string]any, provider string) watchEval {
	low := asFloat(w["lowIBS"])
	if w["lowIBS"] == nil {
		low = ibs.DefaultLowIBS
	}
	high := asFloat(w["highIBS"])
	highInvalid := false
	if w["highIBS"] == nil {
		high = ibs.DefaultHighIBS
	} else if high == 0 {
		highInvalid = true
		high = ibs.DefaultHighIBS
	}
	ev := watchEval{low: low, high: high}
	var ibsVal, price float64
	ok := false
	if qs := e.quotes(); qs != nil {
		if q, err := qs.Quote(sym, provider); err == nil {
			if v, good := ibsFromQuote(q); good {
				ibsVal, ok = v, true
			}
			if cur := asFloat(q.Quote["current"]); cur > 0 {
				price = cur
			}
			ev.rtFresh = ok && price > 0
		}
	}
	bars, adj, _ := e.DB.GetOHLC(sym)
	ev.histFresh = barsHavePrevSession(bars, tradingdate.TodayNYSE(e.now()))
	if price <= 0 && len(bars) > 0 {
		// Historical bars may fill price for display but MUST NOT set ok=true for live decisions.
		price = bars[len(bars)-1].Close
	}
	if price > 0 && len(bars) > 0 {
		splits, _ := e.DB.ListSplits(sym)
		today := tradingdate.TodayNYSE(e.now())
		integ := EvaluatePriceIntegrity(sym, bars, price, today, splits, adj)
		if integ.BlockSignals {
			ev.blocked = true
			ev.price = price
			ev.warning = integ
			return ev
		}
	}
	if !ok {
		ev.price = price
		return ev
	}
	ev.ok = true
	ev.ibs = ibsVal
	ev.price = price
	ev.entry = ibs.IsEntrySignal(ibsVal, low)
	ev.exit = !highInvalid && ibs.IsExitSignal(ibsVal, high)
	ev.nearEntry = ibsVal <= low+nearDelta
	ev.nearExit = ibsVal >= high-nearDelta
	return ev
}

func barsHavePrevSession(bars []types.OHLC, today string) bool {
	if len(bars) == 0 {
		return false
	}
	last := tradingdate.DateKey(bars[len(bars)-1].Date)
	prev := today
	for i := 0; i < 5; i++ {
		cand := tradingdate.AddDays(today, -1-i)
		if tradingdate.DayOfWeek(cand) == 0 || tradingdate.DayOfWeek(cand) == 6 {
			continue
		}
		prev = cand
		break
	}
	return last >= prev
}

func (e *Engine) openMonitorTrade() map[string]any {
	trades, _ := e.DB.ListTrades("trades")
	return store.OpenBrokerTrade(trades)
}

func ibsFromQuote(q providers.QuotePayload) (float64, bool) {
	rng := providers.NormalizeIntradayRange(q.Range, q.Quote)
	if rng == nil {
		return 0, false
	}
	low, _ := rng["low"].(float64)
	high, _ := rng["high"].(float64)
	cur, _ := q.Quote["current"].(float64)
	if high <= low {
		return 0.5, true
	}
	return (cur - low) / (high - low), true
}

func (e *Engine) tradeHistoryMessage(limit int) string {
	trades, _ := e.DB.ListTrades("trades")
	if len(trades) == 0 {
		return "Нет сделок"
	}
	var b strings.Builder
	b.WriteString("Последние сделки:\n")
	n := 0
	for _, t := range trades {
		if n >= limit {
			break
		}
		fmt.Fprintf(&b, "%s %s %v → %v\n", t["symbol"], t["status"], t["entryDate"], t["exitDate"])
		n++
	}
	return b.String()
}
