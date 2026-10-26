package live

import (
	"context"
	"fmt"
	"html"
	"log"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

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
		return fmt.Errorf("Не настроен chat id")
	}
	if text == "" {
		return fmt.Errorf("Нужен текст сообщения")
	}
	e.mu.Lock()
	if e.holdNotices {
		e.heldNotices = append(e.heldNotices, [2]string{chatID, text})
		e.mu.Unlock()
		return nil
	}
	e.mu.Unlock()
	return e.deliver(chatID, text)
}

// holdNoticesUntilDecision holds every notification back until
// releaseNotices. The T-1 cycle uses it so a fill that lands while the other
// broker is still submitting cannot reach the chat before the decision that
// caused it: on 2026-10-09 Robinhood's fill came two seconds before Webull had
// even sent its order.
func (e *Engine) holdNoticesUntilDecision() {
	e.mu.Lock()
	e.holdNotices = true
	e.mu.Unlock()
}

// releaseNotices sends what the hold kept, in order, and then ends it. The
// hold stays on while it flushes: a notice sent meanwhile queues behind the
// held ones instead of overtaking them (a trade result before its "продано").
// Safe to call twice.
func (e *Engine) releaseNotices() {
	for {
		e.mu.Lock()
		held := e.heldNotices
		e.heldNotices = nil
		if len(held) == 0 {
			e.holdNotices = false
			e.mu.Unlock()
			return
		}
		e.mu.Unlock()
		for _, m := range held {
			_ = e.deliver(m[0], m[1])
		}
	}
}

// deliver sends now, past any hold.
func (e *Engine) deliver(chatID, text string) error {
	err := e.Telegram.Send(chatID, text)
	if err != nil {
		// Almost every caller drops this error (`_ = e.Send`), so an alert
		// Telegram refused used to vanish without a trace.
		first, _, _ := strings.Cut(text, "\n")
		if r := []rune(first); len(r) > 80 {
			first = string(r[:80])
		}
		e.logAuto("notify_failed", "", map[string]any{"error": err.Error(), "text": first})
	}
	return err
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
	// Ctx bounds the T-1 cycle. nil means context.Background.
	Ctx context.Context
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
	switch {
	case minutesUntilClose >= 10 && minutesUntilClose <= 11:
		stage = "overview"
	case minutesUntilClose >= 0 && minutesUntilClose <= 1:
		stage = "confirmations"
	default:
		return SimulateResult{Stage: "wrong_time", DryRun: opts.DryRun, Reason: "wrong_time"}, nil
	}
	out := SimulateResult{Stage: stage, DryRun: opts.DryRun}
	today := tradingdate.TodayNYSE(e.now())
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
	watches, err := e.DB.ListWatches()
	if err != nil {
		out.Reason = "journal_unavailable"
		return out, err
	}
	// An empty watch list must not swallow a day on which the monitoring holds
	// a position: its exit still has to be decided and reported.
	open, err := e.openPosition()
	if err != nil {
		out.Reason = "journal_unavailable"
		return out, err
	}
	if len(watches) == 0 && open == nil {
		emaAlerts, err := e.EvaluateEMAAlerts()
		if err != nil {
			out.Reason = "journal_unavailable"
			return out, err
		}
		if len(emaAlerts) == 0 {
			out.Reason = "no_watches"
			return out, nil
		}
	}
	cfg := e.AutoConfig()
	providerChain := quoteProviderChain(cfg)
	var watchSyms []string
	for _, w := range watches {
		watchSyms = append(watchSyms, fmt.Sprint(w["symbol"]))
	}
	e.prefetchQuotes(watchSyms, providerChain, backgroundWindow())
	emaAlerts, err := e.EvaluateEMAAlerts()
	if err != nil {
		out.Reason = "journal_unavailable"
		return out, err
	}
	if len(watches) == 0 && len(emaAlerts) == 0 && open == nil {
		out.Reason = "no_watches"
		return out, nil
	}
	var rows []t1Watch
	var integ []IntegrityResult
	for _, w := range watches {
		sym := fmt.Sprint(w["symbol"])
		ev := e.evalWatch(sym, w, cfg, providerChain)
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
	if stage != "confirmations" {
		text := e.buildT11Text(minutesUntilClose, today, providersUsed(rows, providerChain), rows, emaAlerts, integ)
		res, err := e.finishSend(&out, text, opts)
		if res.Sent {
			if ema := buildEmaOverviewMessage(emaAlerts); ema != "" {
				if e.Send(e.chat(), ema) == nil {
					res.Text += "\n" + ema
				}
			}
			if opts.UpdateState {
				e.stampSendMarker("t11", e.DB.MarkAggregateT11(e.chat(), today))
			}
			if !opts.DryRun {
				e.persistEmaAfterSend(emaAlerts, stage)
			}
		}
		return res, err
	}

	execDone := false
	if opts.UpdateState && !opts.DryRun {
		att, err := e.DB.BeginT1Attempt(e.chat(), today, e.now(), T1LeaseTTL)
		if err != nil {
			out.Reason = err.Error()
			return out, err
		}
		if att.Skip {
			out.Reason = att.Reason
			return out, nil
		}
		execDone = att.ExecutionDone
	}

	var cycle EvalResult
	early := "" // the monitoring's half, when it already went out mid-cycle
	var earlyDone chan struct{}
	if execDone {
		// The cycle ran before a restart and only its report is missing: the
		// journal already holds what it decided.
		cycle = e.Evaluate()
		cycle.Monitor = &MonitorStep{Held: cycle.OpenTrade, Reason: "already_executed"}
	} else {
		// The whole T-1 cycle shares one deadline computed here, at the top of
		// the minute: closeTime(ET) minus T1DeadlineSafetyMargin.
		w := e.t1Window(opts.Ctx)
		_ = e.DB.AppendAutotradeLog("t1_execution_started")
		if opts.DryRun {
			_ = e.DB.AppendAutotradeLog("t1_dry_run")
		} else {
			e.holdNoticesUntilDecision()
			defer e.releaseNotices()
		}
		cycle = e.runCycle(w, "telegram_t1", opts.DryRun, func(ev EvalResult) {
			// The monitoring's decision goes out before any broker is asked,
			// off the trading path: waiting on Telegram here would eat the
			// brokers' share of the closing minute.
			if opts.DryRun || !autotradeOn(ev.AutoTrading) || !ev.Monitor.acted() {
				return
			}
			text := e.buildT1MonitorText(minutesUntilClose, rows, ev, integ, false)
			earlyDone = make(chan struct{})
			go func() {
				defer close(earlyDone)
				if e.deliver(e.chat(), text) == nil {
					early = text
				}
				e.releaseNotices()
			}()
		})
		if earlyDone != nil {
			<-earlyDone
		}
		out.Executed = cycle.Executed
		out.Broker = cycle.Runs
		if opts.UpdateState && !opts.DryRun {
			e.stampSendMarker("t1_execution", e.DB.MarkT1ExecutionFinished(e.chat(), today))
		}
	}

	auto := t1AutoText(cycle, opts.DryRun)
	var res SimulateResult
	if early == "" {
		text := e.buildT1MonitorText(minutesUntilClose, rows, cycle, integ, opts.DryRun)
		if auto != "" {
			text += "\n\n" + auto
		}
		res, err = e.finishSend(&out, text, opts)
	} else {
		res, err = e.finishSend(&out, auto, opts)
		res.Text = early + "\n\n" + auto
	}
	if res.Sent {
		if ema := buildEmaDecisionMessage(emaAlerts); ema != "" {
			if e.Send(e.chat(), ema) == nil {
				res.Text += "\n" + ema
			}
		}
		if !opts.DryRun {
			e.persistEmaAfterSend(emaAlerts, stage)
		}
		if opts.UpdateState && !opts.DryRun {
			e.stampSendMarker("t1_report", e.DB.MarkT1ReportSent(e.chat(), today))
		}
	}
	return res, err
}

func (e *Engine) stampSendMarker(op string, err error) {
	if err == nil {
		return
	}
	e.logAuto("marker_save_failed", "", map[string]any{"op": op, "error": err.Error()})
}

// T1LeaseTTL is how long a T-1 attempt holds the day against a parallel tick.
var T1LeaseTTL = 2 * time.Minute

func (e *Engine) finishSend(out *SimulateResult, text string, opts AggregateOpts) (SimulateResult, error) {
	out.Text = text
	err := e.Send(e.chat(), text)
	if err != nil {
		out.Reason = err.Error()
		if !opts.ForceSend {
			return *out, err
		}
	} else {
		out.Sent = true
		out.Success = true
	}
	if err != nil {
		return *out, fmt.Errorf("telegram send failed: %w", err)
	}
	return *out, nil
}

type t1Watch struct {
	sym  string
	eval watchEval
}

// buildT1MonitorText is the monitoring's half of the T-1 report: its decision,
// its position after the cycle and the quality of the readings. No broker
// appears here (CORE §16).
func (e *Engine) buildT1MonitorText(minutes int, rows []t1Watch, ev EvalResult, integ []IntegrityResult, dryRun bool) string {
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
	decision = append(decision, monitorLines(ev, dryRun)...)
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
	// The header states the minute the readings were taken on, so a T-1 that
	// ran late cannot claim a minute it no longer had.
	head := "<b>⏱️ 1 минута до закрытия</b>"
	if minutes != 1 {
		head = fmt.Sprintf("<b>⏱️ %d мин до закрытия</b>", minutes)
	}
	lines := []string{head, ""}
	if block := FormatIntegrityWarningBlock(integ); block != "" {
		lines = append(lines, block, "")
	}
	lines = append(lines, "<b>🎯 МОНИТОРИНГ:</b>")
	lines = append(lines, decision...)
	lines = append(lines, "", freshness, e.t1PositionLine())
	return strings.Join(lines, "\n")
}

// monitorLines states what the monitoring did: its exit and entry with the
// readings they were taken on, and why it did nothing when it did nothing.
func monitorLines(ev EvalResult, dryRun bool) []string {
	mon := ev.Monitor
	if mon == nil {
		reason, _ := ev.Decision["reason"].(string)
		mon = &MonitorStep{Held: ev.OpenTrade, Reason: reason}
	}
	var out []string
	if mon.Failed != "" {
		out = append(out, "• Журнал не записан — решение не принято: "+html.EscapeString(mon.Failed))
	}
	if q := mon.Exit; q != nil {
		line := fmt.Sprintf("• Выход %s по %s (IBS %.1f%%)", q.Symbol, formatMoneyDash(q.CurrentPrice), q.IBS*100)
		if c := mon.Closed; c != nil && c.PnLPercent != nil {
			line += " · " + signedPct(*c.PnLPercent)
		}
		out = append(out, line)
	}
	if q := mon.Entry; q != nil {
		out = append(out, fmt.Sprintf("• Вход %s по %s (IBS %.1f%%)", q.Symbol, formatMoneyDash(q.CurrentPrice), q.IBS*100))
	}
	if mon.Reason != "" {
		out = append(out, "• "+monitorReasonText(mon.Reason, ev.Decision))
	}
	if dryRun && mon.acted() {
		out = append(out, "• dry run — журнал не изменён, заявок нет")
	}
	if len(out) == 0 {
		out = append(out, "• Действий нет")
	}
	return out
}

func monitorReasonText(reason string, dec map[string]any) string {
	sym := store.SafeTicker(fmt.Sprint(dec["symbol"]))
	switch reason {
	case "exit_threshold_not_reached":
		if q, _ := dec["candidate"].(*LiveQuote); q != nil {
			_, high := q.resolvedThresholds()
			return fmt.Sprintf("Держим %s: IBS %.1f%% не выше порога выхода %.0f%%", q.Symbol, q.IBS*100, high*100)
		}
		return "Держим " + sym
	case "open_position_quote_unavailable":
		return "Нет котировки по " + sym + " — выход не проверен"
	case "no_signal":
		return "Сигнала на вход нет"
	case "empty_symbol_universe":
		return "Список тикеров пуст"
	case "watchlist_unavailable":
		return "Список тикеров не читается — решение не принято"
	case "journal_unavailable":
		return "Журнал сделок недоступен — решение не принято"
	case "already_executed":
		return "Решение этого дня уже исполнено — повторный отчёт"
	case "cycle_cancelled":
		return "Цикл прерван остановкой сервера — решение не принято"
	}
	return reason
}

// t1AutoText is the autotrade half of the T-1 report: off in one line, or what
// each broker sent and why it did not (CORE §16).
func t1AutoText(ev EvalResult, dryRun bool) string {
	switch {
	case dryRun || ev.Monitor != nil && (ev.Monitor.Reason == "already_executed" || ev.Monitor.Reason == "cycle_cancelled"):
		// Nothing ran in this cycle to report on.
		return ""
	case !autotradeOn(ev.AutoTrading):
		return "🤖 Автоторговля: выключена"
	case !ev.Monitor.acted():
		return "🤖 Автоторговля: сигнала мониторинга нет — заявок нет"
	}
	lines := []string{"<b>🤖 АВТОТОРГОВЛЯ:</b>"}
	names := make([]string, 0, len(ev.Runs))
	for name := range ev.Runs {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		run, label := ev.Runs[name], brokerLabel(name)
		for _, o := range run.Sells {
			lines = append(lines, orderLine(label, o))
		}
		if run.Buy != nil {
			lines = append(lines, orderLine(label, *run.Buy))
		}
		if run.Reason != "" {
			lines = append(lines, "• "+label+": "+autoReasonText(run, ev.Monitor))
		} else if len(run.Sells) == 0 && run.Buy == nil {
			lines = append(lines, "• "+label+": счёт пуст — продавать нечего")
		}
	}
	if len(names) == 0 {
		lines = append(lines, "• брокер не настроен")
	}
	return strings.Join(lines, "\n")
}

func orderLine(label string, o OrderResult) string {
	switch {
	case o.Submitted:
		return fmt.Sprintf("• %s: %s %s MARKET отправлен (%v шт.)", label, o.Side, o.Symbol, o.Quantity)
	case o.Ambiguous:
		return fmt.Sprintf("• %s: %s %s — статус отправки неизвестен", label, o.Side, o.Symbol)
	}
	return fmt.Sprintf("• %s: %s %s не отправлен: %s", label, o.Side, o.Symbol, html.EscapeString(o.Error))
}

func autoReasonText(run *BrokerRun, mon *MonitorStep) string {
	entry := ""
	if mon != nil && mon.Entry != nil {
		entry = mon.Entry.Symbol
	}
	syms := strings.Join(run.Symbols, ", ")
	switch run.Reason {
	case "broker_disabled":
		return "брокер выключен в настройках"
	case HealthNeedsReauth:
		return "брокер требует повторной авторизации"
	case HealthMissing:
		return "у брокера нет токена"
	case "exits_disabled":
		return "выходы выключены — счёт не очищен"
	case "entries_disabled":
		return "входы выключены — вход " + entry + " пропущен"
	case "broker_positions_unavailable":
		return "позиции брокера не читаются — заявок нет"
	case "symbol_order_in_flight":
		return "по " + syms + " уже висит незакрытая заявка — новая не отправлена"
	case "open_orders_unavailable":
		return "открытые заявки не читаются — вход " + entry + " пропущен"
	case "open_order_symbol_unknown":
		return "висит заявка без тикера — вход " + entry + " пропущен"
	case "sells_not_settled":
		return "продажи не подтвердились до закрытия — вход " + entry + " пропущен"
	case "broker_not_flat":
		return "вход " + entry + " пропущен — на счёте остаток: " + syms
	case "broker_panic":
		return "сбой в адаптере брокера — заявки не отправлены"
	}
	return run.Reason
}

// t1PositionLine states the monitoring's position after the cycle.
func (e *Engine) t1PositionLine() string {
	open, err := e.openPosition()
	if err != nil {
		return "Позиция: неизвестна (журнал сделок недоступен)"
	}
	if open == nil {
		return "Позиция: нет"
	}
	price := "—"
	if p := legacyEntryPrice(open); p > 0 {
		price = fmt.Sprintf("$%.2f", p)
	}
	return fmt.Sprintf("Позиция: %s (вход %s по %s)", open.Symbol, nz(tradingdate.FormatDisplay(open.EntryDate, "")), price)
}

func brokerLabel(name string) string {

	switch name {
	case "webull":
		return "Webull"
	case "robinhood":
		return "Robinhood"
	}
	return name
}

// bestEntryRow returns the ticker the T-1 readings would have entered: the
// lowest IBS strictly below its entry threshold, the same pick the engine makes.
func bestEntryRow(rows []t1Watch) (string, float64, bool) {
	best := ""
	bestIBS := 0.0
	for _, r := range rows {
		if !r.eval.entry {
			continue
		}
		if best == "" || r.eval.ibs < bestIBS {
			best, bestIBS = r.sym, r.eval.ibs
		}
	}
	return best, bestIBS, best != ""
}

type watchEval struct {
	ok, entry, exit, blocked bool
	rtFresh, histFresh       bool
	ibs, price, low, high    float64
	provider                 string
	warning                  IntegrityResult
}

func (e *Engine) evalWatch(sym string, w, cfg map[string]any, providerChain []string) watchEval {
	low, high := watchThresholds(w, cfg)
	ev := watchEval{low: low, high: high}
	var ibsVal, price float64
	ok := false
	if q, used, err := e.liveQuote(sym, providerChain); err == nil {
		if v, good := ibsFromQuote(q); good {
			ibsVal, ok = v, true
		}
		if cur := asFloat(q.Quote["current"]); cur > 0 {
			price = cur
		}
		ev.provider = used
		ev.rtFresh = ok && price > 0
	}
	bars, adj, _ := e.DB.GetOHLCLast(sym, 8)
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
	ev.exit = ibs.IsExitSignal(ibsVal, high)
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

// openPosition returns the position the journal has open, or nil.
// An unreadable journal must not be reported as "no open position": the
// T-11/T-1 messages would label an open ticker FLAT and tag it ENTRY.
func (e *Engine) openPosition() (*store.Position, error) {
	rows, err := e.DB.OpenPositions()
	if err != nil {
		return nil, err
	}
	for i, p := range rows {
		if !p.IsHidden && !p.IsTest {
			return &rows[i], nil
		}
	}
	return nil, nil
}

func ibsFromQuote(q providers.QuotePayload) (float64, bool) {
	cur := asFloat(q.Quote["current"])
	if !(cur > 0) {
		return 0, false
	}
	rng := providers.NormalizeIntradayRange(q.Range, q.Quote)
	if rng == nil {
		return 0, false
	}
	low := asFloat(rng["low"])
	high := asFloat(rng["high"])
	if !(high > low) {
		return 0, false
	}
	// Node clamps to [0,1] (autotrade.js:575). An extended-hours `current`
	// outside the regular-session range must not skew candidate ranking.
	return math.Max(0, math.Min(1, (cur-low)/(high-low))), true
}

func (e *Engine) tradeHistoryMessage(limit int) string {
	trades, err := e.DB.ListPositions()
	if err != nil {
		return "Журнал сделок недоступен"
	}
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
		if t.IsTest || t.IsHidden {
			continue
		}
		fmt.Fprintf(&b, "%s %s %s → %s\n", t.Symbol, t.Status, t.EntryDate, t.ExitDate)
		n++
	}
	return b.String()
}

// quoteAttempts is the number of tries per provider before moving to the next,
// matching Node fetchTodayRangeAndQuote (1 try + 2 retries).
const quoteAttempts = 3

var quoteRetryStep = 350 * time.Millisecond

// liveQuote walks the provider chain and returns the first usable intraday
// quote plus the provider that served it. A quote is the one input without
// which no live decision is possible, so a single provider outage must not
// cancel the day. High, low and current always come from the SAME provider:
// mixing them across sources would produce a meaningless IBS.
const (
	quoteCacheTTL = 20 * time.Second
	maxQuoteCache = 256
)

func quoteCacheKey(symbol string, chain []string) string {
	return store.SafeTicker(symbol) + "|" + strings.Join(chain, ",")
}

func (e *Engine) liveQuote(symbol string, chain []string) (providers.QuotePayload, string, error) {
	if len(chain) == 0 {
		chain = realtimeQuoteProviders
	}
	key := quoteCacheKey(symbol, chain)
	// Cache age is wall-clock freshness of network data, so it is measured on
	// the real clock — never on e.now(), which a caller may pin to a fixed
	// instant and would then make every entry look eternally fresh.
	if e != nil {
		e.mu.Lock()
		if e.quoteCache != nil {
			if c, ok := e.quoteCache[key]; ok && time.Since(c.at) < quoteCacheTTL {
				e.mu.Unlock()
				return c.payload, c.provider, c.err
			}
		}
		e.mu.Unlock()
	}
	payload, provider, err := e.fetchLiveQuote(symbol, chain)
	if e != nil {
		e.mu.Lock()
		if e.quoteCache == nil {
			e.quoteCache = map[string]quoteCacheEntry{}
		}
		e.quoteCache[key] = quoteCacheEntry{payload: payload, provider: provider, err: err, at: time.Now()}
		capQuoteCache(e.quoteCache, key)
		e.mu.Unlock()
	}
	return payload, provider, err
}

// quoteBatcher is the optional batch side of a QuoteSource: one provider call
// for many symbols. Kept a type assertion so a QuoteSource (tests included)
// that has no batch endpoint needs no changes.
type quoteBatcher interface {
	QuoteBatch(symbols []string, provider string) (map[string]providers.QuotePayload, error)
}

// prefetchQuotes warms the quote cache for symbols. On the T-1 path it waits
// no longer than the window leaves after T1PlacementReserve: one hung provider
// (three attempts, each up to the 30 s HTTP timeout) used to hold the whole
// closing minute, and the order then found its window gone (AUD-147). A symbol
// still in flight at that point is cached as unavailable, so evalWatch does not
// start the same slow fetch again; the late answer replaces it when it lands.
func (e *Engine) prefetchQuotes(symbols []string, chain []string, w execWindow) {
	if len(symbols) == 0 {
		return
	}
	if len(chain) == 0 {
		chain = realtimeQuoteProviders
	}
	started := time.Now()
	var mu sync.Mutex
	pending := map[string]bool{}
	for _, s := range symbols {
		pending[s] = true
	}
	all := make(chan struct{})
	go func() {
		defer close(all)
		e.prefetchBatch(symbols, chain)
		sem := make(chan struct{}, 8)
		done := make(chan struct{}, len(symbols))
		for _, sym := range symbols {
			sem <- struct{}{}
			go func(s string) {
				defer func() { <-sem; done <- struct{}{} }()
				defer func() {
					if rec := recover(); rec != nil {
						log.Printf("live: prefetchQuotes panic symbol=%s: %v", s, rec)
					}
				}()
				_, _, _ = e.liveQuote(s, chain)
				mu.Lock()
				delete(pending, s)
				mu.Unlock()
			}(sym)
		}
		for range symbols {
			<-done
		}
	}()
	if w.deadline.IsZero() {
		<-all
		return
	}
	timer := time.NewTimer(max(e.timeLeft(w)-T1PlacementReserve, 0))
	defer timer.Stop()
	select {
	case <-all:
		return
	case <-timer.C:
	}
	mu.Lock()
	late := len(pending)
	e.mu.Lock()
	if e.quoteCache == nil {
		e.quoteCache = map[string]quoteCacheEntry{}
	}
	for sym := range pending {
		key := quoteCacheKey(sym, chain)
		if c, ok := e.quoteCache[key]; ok && c.err == nil && c.at.After(started) {
			continue // landed just now
		}
		e.quoteCache[key] = quoteCacheEntry{err: fmt.Errorf("quote not received before the T-1 deadline"), at: time.Now()}
		capQuoteCache(e.quoteCache, key)
	}
	e.mu.Unlock()
	mu.Unlock()
	e.logAuto("quote_prefetch_deadline", "", map[string]any{"symbols": late})
}

// prefetchBatch asks every provider in the chain that has a batch endpoint for
// all symbols still missing a fresh quote from it, and files each answer under
// that provider's own cache key. fetchLiveQuote reads those keys before it
// calls out, so the chain is still walked in order, per symbol, with the same
// logging — the calls are simply already paid for. Whatever a batch does not
// answer (an unsupported provider, a failed call, an unusable range) is left to
// the per-symbol path, so this can only save requests, never lose a quote.
func (e *Engine) prefetchBatch(symbols []string, chain []string) {
	if e == nil {
		return
	}
	if len(chain) == 0 {
		chain = realtimeQuoteProviders
	}
	b, ok := e.quotes().(quoteBatcher)
	if !ok {
		return
	}
	// Кэш общий на цепочку: символ, который уже дал первый провайдер, у
	// следующих не спрашивается. Раньше опрашивался каждый провайдер цепочки
	// целиком, и медленный резервный Webull задерживал торговлю при полностью
	// готовых котировках первого (CORE-07).
	covered := map[string]bool{}
	for _, p := range chain {
		var missing []string
		for _, sym := range symbols {
			if covered[sym] {
				continue
			}
			if _, cached := e.cachedProviderQuote(sym, p); !cached {
				missing = append(missing, sym)
				continue
			}
			covered[sym] = true
		}
		if len(missing) < 2 {
			continue
		}
		res, err := b.QuoteBatch(missing, p)
		if err != nil {
			e.logAuto("quote_batch_failed", "", map[string]any{
				"provider": p, "symbols": len(missing), "error": err.Error(),
			})
		}
		for sym, payload := range res {
			if _, good := ibsFromQuote(payload); !good {
				// An unusable range must not be cached: the per-symbol path still
				// has to try this provider properly, then the rest of the chain.
				continue
			}
			if why := e.quoteStaleness(payload); why != "" {
				// Устаревший снимок не кэшируем: пусть символ достанется
				// следующему провайдеру (CORE-06).
				e.logQuoteProblem(sym, p, 0, why)
				continue
			}
			e.putProviderQuote(sym, p, payload)
			covered[sym] = true
		}
	}
}

// cachedProviderQuote reads a quote already fetched from one specific provider
// (as opposed to "whatever the chain served"), which is what a batch produces.
func (e *Engine) cachedProviderQuote(symbol, provider string) (providers.QuotePayload, bool) {
	if e == nil {
		return providers.QuotePayload{}, false
	}
	key := quoteCacheKey(symbol, []string{provider})
	e.mu.Lock()
	defer e.mu.Unlock()
	c, ok := e.quoteCache[key]
	if !ok || time.Since(c.at) >= quoteCacheTTL {
		return providers.QuotePayload{}, false
	}
	return c.payload, true
}

func (e *Engine) putProviderQuote(symbol, provider string, payload providers.QuotePayload) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.quoteCache == nil {
		e.quoteCache = map[string]quoteCacheEntry{}
	}
	key := quoteCacheKey(symbol, []string{provider})
	e.quoteCache[key] = quoteCacheEntry{
		payload: payload, provider: provider, at: time.Now(),
	}
	capQuoteCache(e.quoteCache, key)
}

func capQuoteCache(m map[string]quoteCacheEntry, keep string) {
	for k := range m {
		if len(m) <= maxQuoteCache {
			return
		}
		if k == keep {
			continue
		}
		delete(m, k)
	}
}

func (e *Engine) fetchLiveQuote(symbol string, chain []string) (providers.QuotePayload, string, error) {
	qs := e.quotes()
	if qs == nil {
		return providers.QuotePayload{}, "", fmt.Errorf("no quote source configured")
	}
	var lastErr error
	for i, p := range chain {
		for attempt := 1; attempt <= quoteAttempts; attempt++ {
			q, batched := e.cachedProviderQuote(symbol, p)
			var err error
			if !batched {
				q, err = qs.Quote(symbol, p)
			}
			if err == nil {
				if _, good := ibsFromQuote(q); !good {
					lastErr = fmt.Errorf("%s: no usable intraday range", p)
					e.logQuoteProblem(symbol, p, i, lastErr.Error())
					break
				}
				if why := e.quoteStaleness(q); why != "" {
					// Свежесть ответа провайдера — не свежесть котировки:
					// зависший снимок с правильными числами становился
					// сегодняшним сигналом (CORE-06). Идём к следующему
					// провайдеру цепочки.
					lastErr = fmt.Errorf("%s: %s", p, why)
					e.logQuoteProblem(symbol, p, i, lastErr.Error())
					break
				}
				if i > 0 {
					e.logAuto("quote_provider_fallback_used", "", map[string]any{
						"symbol": symbol, "provider": p, "position": i,
					})
				}
				return q, p, nil
			}
			lastErr = err
			e.logQuoteProblem(symbol, p, i, err.Error())
			if attempt < quoteAttempts {
				e.sleep(time.Duration(attempt) * quoteRetryStep)
			}
		}
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("quote unavailable for %s", symbol)
	}
	return providers.QuotePayload{}, "", lastErr
}

// MaxQuoteAge is how old a provider's own trade timestamp may be before the
// quote stops counting as a live reading. The strategy trades the largest US
// names in the regular session, where a real quote is seconds old; anything
// this far behind is a frozen feed, not a slow one.
var MaxQuoteAge = 10 * time.Minute

// quoteStaleness explains why this quote must not decide a trade, or "" when
// it may. A provider that gives no timestamp cannot be judged and is used: a
// wrong staleness verdict would stop trading entirely, which is worse than the
// gap it would close.
func (e *Engine) quoteStaleness(q providers.QuotePayload) string {
	if q.AsOf.IsZero() {
		return ""
	}
	now := e.now()
	if session := tradingdate.TodayNYSE(q.AsOf); session != tradingdate.TodayNYSE(now) {
		return "quote is from session " + session
	}
	age := now.Sub(q.AsOf)
	if age > MaxQuoteAge {
		return fmt.Sprintf("quote is %s old", age.Truncate(time.Second))
	}
	return ""
}

// logQuoteProblem records why a provider was skipped. Without it, the reason a
// decision diverged from the backtest is unrecoverable after the fact.
func (e *Engine) logQuoteProblem(symbol, provider string, position int, reason string) {
	e.logAuto("quote_provider_failed", "", map[string]any{
		"symbol": symbol, "provider": provider, "position": position, "reason": reason,
	})
}

// providersUsed names the provider(s) that actually served this cycle, so the
// T-11 message does not claim the configured one after a fallback.
func providersUsed(rows []t1Watch, chain []string) string {
	var seen []string
	for _, r := range rows {
		if r.eval.provider == "" {
			continue
		}
		dup := false
		for _, s := range seen {
			if s == r.eval.provider {
				dup = true
				break
			}
		}
		if !dup {
			seen = append(seen, r.eval.provider)
		}
	}
	if len(seen) == 0 {
		if len(chain) > 0 {
			return chain[0]
		}
		return "finnhub"
	}
	return strings.Join(seen, "+")
}

// legacyEntryPrice is the price to show for a position: the signal price when
// there is one, otherwise whatever a broker actually paid.
func legacyEntryPrice(p *store.Position) float64 {
	if p == nil {
		return 0
	}
	if p.EntryPrice != nil {
		return *p.EntryPrice
	}
	for _, leg := range []store.BrokerLeg{p.Webull, p.Robinhood} {
		if leg.EntryPrice != nil {
			return *leg.EntryPrice
		}
	}
	return 0
}
