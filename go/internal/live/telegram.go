package live

import (
	"fmt"
	"strings"

	"mktorder.com/go/internal/ibs"
	"mktorder.com/go/internal/indicators"
	"mktorder.com/go/internal/providers"
	"mktorder.com/go/internal/tradingdate"
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
	ForceSend bool
	DryRun    bool
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
	if len(watches) == 0 {
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
	for _, w := range watches {
		sym := fmt.Sprint(w["symbol"])
		ev := e.evalWatch(sym, w, provider)
		rows = append(rows, t1Watch{sym: sym, eval: ev})
		out.Tickers = append(out.Tickers, sym)
	}
	if stage != "confirmations" {
		lines := []string{fmt.Sprintf("T-11 overview %s", today)}
		for _, r := range rows {
			flag := "—"
			if r.eval.entry {
				flag = "ENTRY"
			} else if r.eval.exit {
				flag = "EXIT"
			}
			ibsStr := "n/a"
			if r.eval.ok {
				ibsStr = fmt.Sprintf("%.2f", r.eval.ibs)
			}
			lines = append(lines, fmt.Sprintf("%s IBS=%s %s", r.sym, ibsStr, flag))
		}
		return e.finishSend(&out, strings.Join(lines, "\n"), opts)
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

	text := e.buildT1Text(today, rows, blocking, opts.DryRun, waitFill, exitRes, entryRes)
	return e.finishSend(&out, text, opts)
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

func (e *Engine) buildT1Text(today string, rows []t1Watch, blocking map[string]any, dryRun, waitFill bool, exitRes, entryRes EvalResult) string {
	_ = today
	var decision []string
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
	lines := []string{
		"<b>⏱️ 1 минута до закрытия</b>",
		"",
		"<b>🎯 РЕШЕНИЕ:</b>",
	}
	lines = append(lines, decision...)
	lines = append(lines, "")
	for _, r := range rows {
		flag := "—"
		if r.eval.entry {
			flag = "ENTRY"
		} else if r.eval.exit {
			flag = "EXIT"
		}
		ibsStr := "n/a"
		if r.eval.ok {
			ibsStr = fmt.Sprintf("%.2f", r.eval.ibs)
		}
		lines = append(lines, fmt.Sprintf("%s IBS=%s %s", r.sym, ibsStr, flag))
	}
	return strings.Join(lines, "\n")
}

type watchEval struct {
	ok, entry, exit bool
	ibs, price      float64
}

func (e *Engine) evalWatch(sym string, w map[string]any, provider string) watchEval {
	low := asFloat(w["lowIBS"])
	high := asFloat(w["highIBS"])
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
		}
	}
	if !ok || price <= 0 {
		bars, _, err := e.DB.GetOHLC(sym)
		if err == nil && len(bars) > 0 {
			last := bars[len(bars)-1]
			if !ok {
				vals := indicators.IBS(bars)
				ibsVal = vals[len(vals)-1]
				ok = true
			}
			if price <= 0 {
				price = last.Close
			}
		}
	}
	if !ok {
		return watchEval{}
	}
	return watchEval{
		ok:    true,
		ibs:   ibsVal,
		price: price,
		entry: ibs.IsEntrySignal(ibsVal, low),
		exit:  ibs.IsExitSignal(ibsVal, high),
	}
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
