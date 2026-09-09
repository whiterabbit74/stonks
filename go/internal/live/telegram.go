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

// runT1Orders performs the day's exit and, when it fills, the re-entry.
// Everything retried here is retried inside this one run: the T-1 claim also
// marks the message as sent, and releasing it for a later tick would send the
// decision to Telegram twice. A later tick would in any case re-evaluate on
// newer quotes and decide something different, which is not a retry.
//
// w carries the T-1 close-of-session deadline computed once by Aggregate:
// every Execute call in this function shares it, so a slow exit does not
// leave the following re-entry with a budget that assumes it never ran. See
// P1-1 in AUTOTRADE_ROADMAP.md.
func (e *Engine) runT1Orders(w execWindow, today string) (exitRes, entryRes EvalResult, waitFill bool) {
	_ = today
	exitRes = e.executeWindow(w, "telegram_t1")
	if action, _ := effectiveDecision(exitRes)["action"].(string); action != "none" && !exitRes.Executed {
		_ = e.DB.AppendAutotradeLog("t1_submit_failed")
	}
	exited := submittedExitBrokers(exitRes)
	if len(exited) == 0 {
		return exitRes, entryRes, false
	}
	// Цепочка «выход → подтверждение → повторный вход» идёт для каждого
	// брокера отдельно и параллельно. Раньше барьер был общим: подтверждённый
	// и уже плоский Robinhood ждал, пока исполнится заявка Webull, и терял
	// свой вход на том же закрытии (CORE-01 / AUD-043).
	entryRes, entered, waiting := e.settleAndReenter(w, exited)
	if len(waiting) > 0 {
		_ = e.DB.AppendAutotradeLog("t1_entry_blocked_waiting_exit_fill " + strings.Join(waiting, ","))
		waitFill = true
	}
	if len(entered) == 0 {
		_ = e.DB.AppendAutotradeLog("t1_exit_failed")
	}
	return exitRes, entryRes, waitFill
}

// settleAndReenter waits out each broker's own exit and re-enters for it the
// moment that exit settles, without waiting for anybody else.
//
// Waiting in parallel was not enough: the results were collected behind a
// single wg.Wait() and the entry pass ran only after the slowest broker
// finished waiting, so a broker already flat still spent the rest of the
// closing minute on a peer's unfilled order (AUD-075 / CORE-01). The entries
// themselves are serialised — one broker at a time evaluates and submits — but
// no broker's entry waits on another broker's exit.
func (e *Engine) settleAndReenter(w execWindow, brokers []string) (entryRes EvalResult, entered, waiting []string) {
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, name := range brokers {
		wg.Add(1)
		go func(name string) {
			defer wg.Done()
			state := e.settleOneExit(w, name, true)
			mu.Lock()
			defer mu.Unlock()
			if state == exitPending {
				waiting = append(waiting, name)
				return
			}
			if state != exitSettled {
				return
			}
			// Снимок несогласованности снят в начале минуты. Брокер, которому
			// вход закрыла чужая позиция без журнала, к этому моменту уже
			// подтверждённо плоский — своим же выходом, — и старый флаг съел бы
			// законный повторный вход (AUD-084). Пересчёт без новых чтений:
			// причина адресная.
			if _, gone := clearedByFlatExit[w.entryBlocked[name]]; gone {
				delete(w.entryBlocked, name)
				_ = e.DB.AppendAutotradeLog("t1_entry_unblocked_after_exit " + name)
			}
			entered = append(entered, name)
			entryRes = mergeEntryResults(entryRes, e.executeWindowFor(w, "telegram_t1", []string{name}))
		}(name)
	}
	wg.Wait()
	sort.Strings(entered)
	sort.Strings(waiting)
	return entryRes, entered, waiting
}

// mergeEntryResults folds one broker's entry pass into the run's result: the
// per-broker outcomes and decisions sit side by side, and the run executed if
// any broker did. Both maps are keyed by broker name, so nothing overwrites
// anybody else's.
func mergeEntryResults(dst, src EvalResult) EvalResult {
	if dst.EvaluatedAt == "" {
		return src
	}
	out := src
	out.Broker = mergeNamed(dst.Broker, src.Broker)
	out.BrokerDecisions = mergeDecisions(dst.BrokerDecisions, src.BrokerDecisions)
	out.Executed = dst.Executed || src.Executed
	out.Submitted = dst.Submitted || src.Submitted
	if out.Executed {
		out.Phase = "submitted"
	}
	return out
}

func mergeNamed(dst, src any) any {
	a, aok := dst.(map[string]any)
	b, bok := src.(map[string]any)
	if !aok || !bok {
		if bok {
			return src
		}
		return dst
	}
	out := map[string]any{}
	for k, v := range a {
		out[k] = v
	}
	for k, v := range b {
		out[k] = v
	}
	return out
}

func mergeDecisions(dst, src map[string]map[string]any) map[string]map[string]any {
	out := map[string]map[string]any{}
	for k, v := range dst {
		out[k] = v
	}
	for k, v := range src {
		out[k] = v
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// submittedExitBrokers names the brokers whose exit this run actually sent.
// A broker that only decided to exit and then failed to submit has nothing to
// wait for, and must not hold the re-entry of anyone else.
func submittedExitBrokers(res EvalResult) []string {
	outcomes := execOutcomes(res.Broker)
	var out []string
	for _, name := range exitingBrokers(res) {
		if one, ok := outcomes[name]; ok && one.Submitted {
			out = append(out, name)
		}
	}
	sort.Strings(out)
	return out
}

type exitState int

const (
	exitSettled exitState = iota
	exitPending
	exitFailed
)

func (e *Engine) settleOneExit(w execWindow, name string, mayRetry bool) exitState {
	scope := []string{name}
	if e.awaitFlatAfterExit(scope) {
		// Журнал закрыт — но лента позиций брокера ещё может отдавать
		// проданные акции, и тогда второй проход продал бы их снова
		// вместо входа (AUD-071).
		e.awaitBrokerBooksFlat(w, scope)
		return exitSettled
	}
	pending, err := e.pendingExitFor(scope)
	if err != nil || pending != nil {
		return exitPending
	}
	if !mayRetry {
		return exitFailed
	}
	// Терминальный статус, не закрывший сделку (отклонена, отменена): один
	// повтор выхода, и только для этого брокера.
	_ = e.DB.AppendAutotradeLog("t1_exit_rejected_retry " + name)
	retry := e.executeWindowFor(w, "telegram_t1", scope)
	if len(submittedExitBrokers(retry)) == 0 {
		return exitFailed
	}
	return e.settleOneExit(w, name, false)
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
	// An empty watch list must not swallow a day that already has an open
	// broker position: that position still needs its exit decided and
	// reported, watches or not. See P0-5 in AUTOTRADE_ROADMAP.md.
	openPos, err := e.DB.OpenPositions()
	if err != nil {
		out.Reason = "journal_unavailable"
		return out, err
	}
	hasOpenBrokerTrade := len(openPos) > 0
	if len(watches) == 0 && !hasOpenBrokerTrade {
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
	e.prefetchQuotes(watchSyms, providerChain)
	emaAlerts, err := e.EvaluateEMAAlerts()
	if err != nil {
		out.Reason = "journal_unavailable"
		return out, err
	}
	if len(watches) == 0 && len(emaAlerts) == 0 && !hasOpenBrokerTrade {
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

	var exitRes, entryRes EvalResult
	waitFill := false
	var blocking map[string]any
	if execDone {
		exitRes = e.Evaluate()
	} else {
		// The whole T-1 cycle — reconcile reads, exit, re-entry — shares one
		// deadline computed here, at the top of the minute: closeTime(ET) minus
		// T1DeadlineSafetyMargin. See P1-1 in AUTOTRADE_ROADMAP.md.
		w := e.t1Window(opts.Ctx)
		snap := e.consistencyWindow(w)
		// A mismatch is reported, never a global stop: it holds back new
		// entries at the broker it names, and an open position is still
		// closed on its exit signal. Webull's state never decides for
		// Robinhood.
		blocking = BlockingMismatch(snap)
		if blocking != nil {
			_ = e.DB.AppendAutotradeLog("t1_monitor_mismatch " + fmt.Sprint(blocking["code"]) + " " + fmt.Sprint(blocking["message"]))
		}
		w.entryBlocked = e.entryBlockedBrokers(snap)
		busy, entryOnly, skipReasons := e.t1BrokerReconcile(w)
		w.busySymbols = busy
		for name := range entryOnly {
			w.entryBlocked[name] = "preflight"
		}
		w.skipReasons = skipReasons
		_ = e.DB.AppendAutotradeLog("t1_execution_started")
		if opts.DryRun {
			_ = e.DB.AppendAutotradeLog("t1_dry_run")
			exitRes = e.Evaluate()
		} else {
			exitRes, entryRes, waitFill = e.runT1Orders(w, today)
			out.Executed = exitRes.Executed || entryRes.Executed
			// Оба прохода отчитываются отдельно: одно поле на обоих теряло
			// результаты выхода, стоило входу отправиться (AUD-085).
			out.Broker = map[string]any{"exit": exitRes.Broker, "entry": entryRes.Broker}
		}
		if opts.UpdateState && !opts.DryRun {
			e.stampSendMarker("t1_execution", e.DB.MarkT1ExecutionFinished(e.chat(), today))
		}
	}

	text := e.buildT1Text(minutesUntilClose, rows, blocking, opts.DryRun, waitFill, exitRes, entryRes, integ)
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
		if opts.UpdateState && !opts.DryRun {
			e.stampSendMarker("t1_report", e.DB.MarkT1ReportSent(e.chat(), today))
		}
	}
	return res, err
}

// brokerSideSymbol answers what this broker itself did in the run, falling
// back to the run's headline decision when it has no decision of its own.
func brokerSideSymbol(res EvalResult, name, side, sym string) (string, string) {
	d := res.BrokerDecisions[name]
	if d == nil {
		return side, sym
	}
	switch action, _ := d["action"].(string); action {
	case "exit":
		side = "SELL"
	case "entry":
		side = "BUY"
	}
	if s := fmt.Sprint(d["symbol"]); s != "" && s != "<nil>" {
		sym = s
	}
	return side, sym
}

func execOutcomes(broker any) map[string]OrderResult {
	out := map[string]OrderResult{}
	br, ok := broker.(map[string]any)
	if !ok {
		return out
	}
	if _, hasSubmitted := br["submitted"]; hasSubmitted && br["robinhood"] == nil && br["webull"] == nil {
		return out
	}
	for name, v := range br {
		switch one := v.(type) {
		case OrderResult:
			out[name] = one
		case map[string]any:
			or := OrderResult{}
			or.Submitted, _ = one["submitted"].(bool)
			or.Quantity = asFloat(one["quantity"])
			if one["error"] != nil {
				or.Error = fmt.Sprint(one["error"])
			}
			out[name] = or
		}
	}
	return out
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

func (e *Engine) buildT1Text(minutes int, rows []t1Watch, blocking map[string]any, dryRun, waitFill bool, exitRes, entryRes EvalResult, integ []IntegrityResult) string {
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
		// Это предупреждение, а не остановка: выход по сигналу уходит в любом
		// случае, придержан только новый вход у названного брокера. Текст
		// раньше читался как «торговля встала».
		who := strings.TrimSpace(fmt.Sprint(blocking["broker"]))
		scope := "новый вход придержан"
		if who != "" && who != "<nil>" {
			scope = "новый вход придержан у " + brokerLabel(who)
		}
		decision = append(decision, "• Проверка состояния: "+fmt.Sprint(blocking["message"]))
		decision = append(decision, "• "+scope+"; выход по сигналу уходит как обычно")
	}
	if waitFill {
		decision = append(decision, "• Вход заблокирован: ждём подтверждение fill по выходу")
	}
	acted := false
	appendExec := func(res EvalResult, dry bool) {
		dec := effectiveDecision(res)
		action, _ := dec["action"].(string)
		if action == "" || action == "none" {
			return
		}
		sym := fmt.Sprint(dec["symbol"])
		price := quotePrice(res, sym)
		ibsVal := candidateIBS(dec)
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
		head := fmt.Sprintf("• %s %s по %s (IBS %s)", verb, sym, priceS, ibsS)
		if dry {
			decision = append(decision, head, "• dry run (ордер не отправлен)")
			return
		}
		var outcomes []string
		results := execOutcomes(res.Broker)
		names := make([]string, 0, len(results))
		for name := range results {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			one := results[name]
			label := brokerLabel(name)
			if one.Submitted {
				qty := any("—")
				if one.Quantity > 0 {
					qty = one.Quantity
				}
				// Каждая строка говорит за своего брокера. Прогон, где один
				// брокер выходит, а другой входит, печатал направление и тикер
				// общей шапки: покупка NVDA у Robinhood уезжала строкой
				// «SELL … отправлен» под «Закрываем AAPL» (AUD-085).
				bside, bsym := brokerSideSymbol(res, name, side, sym)
				outcomes = append(outcomes, fmt.Sprintf("• %s: %s %s MARKET отправлен (%v шт.)", label, bside, bsym, qty))
			} else if one.Error != "" {
				outcomes = append(outcomes, fmt.Sprintf("• %s ошибка: %s", label, html.EscapeString(one.Error)))
			}
		}
		if len(outcomes) == 0 {
			// With every broker skipped effectiveDecision falls back to the
			// showcase decision EvaluateWindow computes on the webull book;
			// executeAll then decided per broker and skipped every one of them (no token, disabled, unreadable journal). Then
			// nothing was submitted, and the bare "Открываем X" above reads as a
			// filled order. Say so, and name the per-broker reason.
			acted = true
			decision = append(decision, head+" — заявка не отправлена")
			decision = append(decision, brokerReasonLines(res)...)
			return
		}
		acted = true
		decision = append(decision, head)
		decision = append(decision, outcomes...)
		// Брокеры, которые ничего не отправили, тоже обязаны объяснить себя:
		// раньше их причина исчезала, стоило другому брокеру сработать.
		decision = append(decision, brokerReasonLines(res)...)
	}
	if dryRun {
		appendExec(exitRes, true)
	} else {
		appendExec(exitRes, false)
		appendExec(entryRes, false)
	}
	// A warning line (mismatch, waiting for a fill) is not an action: without
	// this the per-broker reason was dropped whenever any warning had already
	// been printed, and a run that submitted nothing looked handled (AUD-069).
	if !acted {
		decision = append(decision, t1NoActionLines(exitRes, entryRes, rows)...)
	}
	decision = dedupeLines(decision)
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
	open, tradesErr := e.openPosition()
	if tradesErr != nil {
		position = "Позиция: неизвестна (журнал сделок недоступен)"
	} else if open != nil {
		price := "—"
		if p := legacyEntryPrice(open); p > 0 {
			price = fmt.Sprintf("$%.2f", p)
		}
		position = fmt.Sprintf("Позиция: %s (вход %s по %s)", open.Symbol, nz(open.EntryDate), price)
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
	lines = append(lines, "<b>🎯 РЕШЕНИЕ:</b>")
	lines = append(lines, decision...)
	lines = append(lines, "", freshness, position)
	return strings.Join(lines, "\n")
}

// dedupeLines drops repeated lines while keeping order: the exit and the entry
// pass can name the same broker's skip reason.
func dedupeLines(lines []string) []string {
	seen := map[string]bool{}
	out := lines[:0]
	for _, l := range lines {
		if seen[l] {
			continue
		}
		seen[l] = true
		out = append(out, l)
	}
	return out
}

// t1NoActionLines explains a T-1 cycle that placed no order. A bare
// "Действий нет" right after a T-11 message that announced an ENTRY reads as a
// broken bot: the engine already computed a reason per broker, and that reason
// is exactly what the operator needs at the close. The entry signal of the
// minute is repeated too, so "сигнал был, но не исполнен" is visible without
// digging through autotrade_logs.
func t1NoActionLines(exitRes, entryRes EvalResult, rows []t1Watch) []string {
	seen := map[string]bool{}
	var out []string
	add := func(line string) {
		if line == "" || seen[line] {
			return
		}
		seen[line] = true
		out = append(out, line)
	}
	for _, res := range []EvalResult{exitRes, entryRes} {
		for _, line := range brokerReasonLines(res) {
			add(line)
		}
	}
	if len(out) == 0 {
		out = append(out, "• Действий нет")
	}
	if sym, ibsVal, ok := bestEntryRow(rows); ok {
		out = append(out, fmt.Sprintf("• Сигнал входа был: %s (IBS %.1f%%) — заявка не отправлена", sym, ibsVal*100))
	}
	return out
}

// brokerReasonLines explains, one line per broker, why that broker placed no
// order. It falls back to the showcase Decision only when executeAll never got
// as far as deciding per broker.
func brokerReasonLines(res EvalResult) []string {
	if len(res.BrokerDecisions) == 0 {
		if line := noActionLine("", res.Decision); line != "" {
			return []string{line}
		}
		return nil
	}
	names := make([]string, 0, len(res.BrokerDecisions))
	for name := range res.BrokerDecisions {
		names = append(names, name)
	}
	sort.Strings(names)
	var out []string
	for _, name := range names {
		if line := noActionLine(brokerLabel(name), res.BrokerDecisions[name]); line != "" {
			out = append(out, line)
		}
	}
	return out
}

func noActionLine(label string, decision map[string]any) string {
	if decision == nil {
		return ""
	}
	if action, _ := decision["action"].(string); action != "" && action != "none" {
		return ""
	}
	reason, _ := decision["reason"].(string)
	if reason == "" {
		return ""
	}
	sym := ""
	if decision["symbol"] != nil {
		sym = store.SafeTicker(fmt.Sprint(decision["symbol"]))
	}
	text := noActionReasonText(reason, sym)
	if label != "" {
		return "• " + label + ": " + text
	}
	return "• " + text
}

func noActionReasonText(reason, symbol string) string {
	sym := symbol
	if sym == "" {
		sym = "позиция"
	}
	switch reason {
	case "symbol_order_in_flight":
		return "по " + sym + " уже висит незакрытая заявка — новая не отправлена"
	case "open_orders_unavailable":
		return "открытые заявки брокера не читаются — новый вход заблокирован, выход идёт как обычно"
	case "open_order_symbol_unknown":
		return "у брокера висит заявка без тикера — новый вход заблокирован"
	case "consistency_mismatch":
		return "расхождение журнала и брокера — новый вход заблокирован"
	case "broker_position_exists":
		return "у брокера уже есть позиция — вход заблокирован"
	case "broker_position_mismatch":
		return "журнал держит " + sym + ", а у брокера её нет — вход заблокирован"
	case "broker_positions_unavailable":
		return "позиции брокера не читаются — вход заблокирован"
	case "journal_unavailable":
		return "журнал сделок недоступен"
	case "watchlist_unavailable":
		return "список тикеров не читается — вход заблокирован"
	case "broker_panic":
		return "сбой в адаптере брокера — заявки не отправлены"
	case "no_broker_configured":
		return "брокер не настроен"
	case "broker_disabled":
		return "брокер выключен в настройках"
	case HealthNeedsReauth:
		return "брокер требует повторной авторизации"
	case HealthMissing:
		return "у брокера нет токена"
	case "entries_disabled":
		return "новые входы выключены в настройках"
	case "exits_disabled":
		return "выходы выключены в настройках"
	case "empty_symbol_universe":
		return "список тикеров пуст"
	case "exit_threshold_not_reached":
		return "держим " + sym + ": IBS ниже порога выхода"
	case "open_position_quote_unavailable":
		return "нет котировки по открытой " + sym + " — выход не проверен"
	case "invalid_high_ibs":
		return "у " + sym + " не задан порог выхода"
	case "no_signal":
		return "нет сигнала на вход"
	}
	return reason
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
	low, high, highInvalid := watchThresholds(w, cfg)
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
	ev.exit = !highInvalid && ibs.IsExitSignal(ibsVal, high)
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

func (e *Engine) prefetchQuotes(symbols []string, chain []string) {
	if len(symbols) == 0 {
		return
	}
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
		}(sym)
	}
	for range symbols {
		<-done
	}
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
