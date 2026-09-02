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
	Success bool     `json:"success"`
	Sent    bool     `json:"sent"`
	Stage   string   `json:"stage"`
	Text    string   `json:"text,omitempty"`
	Tickers []string `json:"tickers,omitempty"`
	Reason  string   `json:"reason,omitempty"`
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

func (e *Engine) Simulate(stage string) (SimulateResult, error) {
	if stage == "" {
		stage = "overview"
	}
	minutes := StageMinutes(stage)
	return e.Aggregate(minutes, true)
}

func (e *Engine) Aggregate(minutesUntilClose int, forceSend bool) (SimulateResult, error) {
	stage := "overview"
	if minutesUntilClose <= 2 {
		stage = "confirmations"
	}
	out := SimulateResult{Stage: stage}
	watches, _ := e.DB.ListWatches()
	if len(watches) == 0 {
		out.Reason = "no_watches"
		return out, nil
	}
	today := tradingdate.TodayNYSE(e.now())
	var lines []string
	label := "T-11 overview"
	if stage == "confirmations" {
		label = "T-1 confirmations"
	}
	lines = append(lines, fmt.Sprintf("%s %s", label, today))
	settings := e.DB.Settings()
	provider, _ := settings["resultsQuoteProvider"].(string)
	if provider == "" {
		provider = "finnhub"
	}
	for _, w := range watches {
		sym := fmt.Sprint(w["symbol"])
		row := e.evalWatch(sym, w, provider)
		out.Tickers = append(out.Tickers, sym)
		flag := "—"
		if row.entry {
			flag = "ENTRY"
		} else if row.exit {
			flag = "EXIT"
		}
		ibsStr := "n/a"
		if row.ok {
			ibsStr = fmt.Sprintf("%.2f", row.ibs)
		}
		lines = append(lines, fmt.Sprintf("%s IBS=%s %s", sym, ibsStr, flag))
	}
	text := strings.Join(lines, "\n")
	out.Text = text
	if err := e.Send(e.chat(), text); err != nil {
		if !forceSend {
			out.Reason = err.Error()
			return out, err
		}
		out.Reason = err.Error()
		return out, err
	}
	out.Sent = true
	out.Success = true
	return out, nil
}

type watchEval struct {
	ok, entry, exit bool
	ibs             float64
}

func (e *Engine) evalWatch(sym string, w map[string]any, provider string) watchEval {
	low, _ := w["lowIBS"].(float64)
	high, _ := w["highIBS"].(float64)
	var ibsVal float64
	ok := false
	if qs := e.quotes(); qs != nil {
		if q, err := qs.Quote(sym, provider); err == nil {
			if v, good := ibsFromQuote(q); good {
				ibsVal, ok = v, true
			}
		}
	}
	if !ok {
		bars, _, err := e.DB.GetOHLC(sym)
		if err == nil && len(bars) > 0 {
			vals := indicators.IBS(bars)
			ibsVal = vals[len(vals)-1]
			ok = true
		}
	}
	if !ok {
		return watchEval{}
	}
	return watchEval{
		ok:    true,
		ibs:   ibsVal,
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
