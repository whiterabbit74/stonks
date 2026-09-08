package live

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"mktorder.com/go/internal/ibs"
	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/webull"
)

var ErrTestBuyDisabled = errors.New("Тестовая покупка через Webull отключена")

// ErrExecutionDeadlineExceeded is returned by placeMarket/retryBrokerReadWindow
// when the T-1 close-of-session budget ran out before another attempt could
// be started. See P1-1 in AUTOTRADE_ROADMAP.md.
var ErrExecutionDeadlineExceeded = errors.New("execution deadline exceeded")

// ErrOpenOrderCancelFailed is returned by cancelOpenOrdersBeforeEntry when our
// own working order on the entry symbol could not be cancelled. The entry must
// not be sent next to it. See AUD-025.
var ErrOpenOrderCancelFailed = errors.New("open_order_cancel_failed")

func (e *Engine) AutoConfig() map[string]any {
	settings := e.DB.Settings()
	cfg, _ := settings["autoTrading"].(map[string]any)
	if cfg == nil {
		cfg = map[string]any{"enabled": false}
	}
	return cfg
}

func (e *Engine) PatchAutoConfig(updates map[string]any) map[string]any {
	cur, _ := e.PatchAutoConfigChecked(updates)
	return cur
}

func (e *Engine) PatchAutoConfigChecked(updates map[string]any) (map[string]any, error) {
	// This is a read-modify-write of the whole autoTrading object. Settings()
	// answers a failed read with the defaults, so saving on top of it would
	// quietly reset thresholds, broker flags and the enabled state to
	// factory values.
	settings, err := e.DB.SettingsErr()
	if err != nil {
		return map[string]any{}, err
	}
	cur, _ := settings["autoTrading"].(map[string]any)
	if cur == nil {
		cur = map[string]any{}
	}
	cur, err = sanitizeAutoTradingConfig(updates, cur, e.now())
	if err != nil {
		return cur, err
	}
	err = e.DB.SetSettingsKeys(map[string]any{"autoTrading": cur})
	return cur, err
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
	// Report the token requests actually carry. Saying "db" while a pending
	// stored token is being passed over for the environment one would send the
	// operator hunting the wrong token when calls start failing.
	effective := e.DB.WebullAccessToken()
	source := "none"
	switch {
	case effective == "":
	case effective == row.Token:
		source = "db"
	case effective == envTok:
		source = "env"
	default:
		source = "db"
	}
	exp := row.ExpiresAt
	if exp == "" {
		exp = os.Getenv("WEBULL_TOKEN_EXPIRES_AT")
	}
	return map[string]any{
		"hasToken":  source != "none",
		"present":   source != "none",
		"source":    source,
		"expiresAt": exp,
		// The SPA token card prints "осталось: N дн." off this field.
		"daysLeft":        daysLeftUntil(exp, e.now()),
		"lastCheckAt":     row.LastCheckAt,
		"lastCheckStatus": row.LastCheckStatus,
		"accountId":       os.Getenv("WEBULL_ACCOUNT_ID"),
	}
}

func (e *Engine) PutToken(token, expiresAt string) map[string]any {
	// The column holds the classified vocabulary now, so a hand-entered token
	// must be classified too - otherwise the raw word lands in last_check_status
	// and both the submit gate and the SPA read it as an unknown status.
	if norm := normalizeExpiryString(expiresAt); norm != "" {
		expiresAt = norm
	}
	classified, _ := ClassifyWebullHealth(token, "NORMAL", expiresAt, e.now())
	_ = e.DB.SaveWebullTokenChecked(token, expiresAt, classified, "NORMAL")
	return map[string]any{"success": true, "expiresAt": expiresAt, "hasToken": token != ""}
}

func (e *Engine) CreateToken() (map[string]any, error) {
	x := e.webullExtras()
	if x == nil {
		return nil, fmt.Errorf("Не заданы ключи Webull")
	}
	data, err := x.CreateToken()
	if err != nil {
		return nil, err
	}
	tok := webullTokenValue(data)
	exp := webullTokenExpiry(data)
	persisted := tok != ""
	if persisted {
		classified, _ := ClassifyWebullHealth(tok, "PENDING", exp, e.now())
		_ = e.DB.SaveWebullTokenChecked(tok, exp, classified, "PENDING")
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
	x := e.webullExtras()
	if x == nil {
		return "PRESENT"
	}
	data, err := x.CheckToken(token)
	if err != nil {
		_ = e.DB.AppendAutotradeLog("token_health_failed " + err.Error())
		return "UNKNOWN"
	}
	status := webullTokenStatus(data)
	if status == "" {
		status = "NORMAL"
	}
	exp := webullTokenExpiry(data)
	if exp == "" {
		e.logUnknownExpiry(data)
	}
	// P0-4: last_check_status must carry the classified verdict
	// (OK/NEEDS_REAUTH/...) that CanSubmit/executeAll gate on, not the raw
	// Webull word — that goes to last_check_raw instead, symmetric with how
	// Robinhood's health job already stores a classified status.
	classified, _ := ClassifyWebullHealth(token, status, exp, e.now())
	_ = e.DB.SaveWebullTokenChecked(token, exp, classified, status)
	if status == "NORMAL" && e.Broker != nil {
		_, _ = e.Broker.Account()
	}
	return status
}

// CheckToken confirms a token with Webull and records the verdict. A token the
// user has just created is PENDING until they approve the SMS, and only this
// check can promote it to NORMAL — which is what makes it eligible for the
// authenticated calls, quotes included.
func (e *Engine) CheckToken(token string) (map[string]any, error) {
	if token == "" {
		token = e.DB.GetWebullToken().Token
	}
	x := e.webullExtras()
	if x == nil {
		return map[string]any{"status": "UNKNOWN"}, nil
	}
	data, err := x.CheckToken(token)
	if err != nil {
		return nil, err
	}
	status := webullTokenStatus(data)
	if status == "" {
		status = "NORMAL"
	}
	exp := webullTokenExpiry(data)
	if exp == "" {
		e.logUnknownExpiry(data)
	}
	if token != "" {
		classified, _ := ClassifyWebullHealth(token, status, exp, e.now())
		_ = e.DB.SaveWebullTokenChecked(token, exp, classified, status)
	}
	return data, nil
}

// CanSubmit reports whether any attached broker could place an order — the
// "running" flag the UI shows. Asking only about Webull answered for the whole
// system with one broker's token: a Robinhood-only setup read as stopped while
// it was trading (same class as AUD-017).
func (e *Engine) CanSubmit() bool {
	cfg := e.AutoConfig()
	enabled, _ := cfg["enabled"].(bool)
	if !enabled {
		return false
	}
	for _, nb := range e.brokerSnapshot() {
		if on, _, _ := brokerFlags(cfg, nb.name); on && e.brokerHasWorkingToken(nb.name) {
			return true
		}
	}
	return false
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
	Submitted   bool             `json:"submitted,omitempty"`
	Phase       string           `json:"phase,omitempty"`
	Live        bool             `json:"live"`
	Broker      any              `json:"broker,omitempty"`
	// DecisionBroker names the broker whose book Decision was computed on, so
	// the UI does not read one broker's showcase decision as another's.
	DecisionBroker string `json:"decisionBroker,omitempty"`
	// BrokerDecisions holds the per-broker decision (action/reason/candidate),
	// keyed by broker name. Decision (above) stays the single-book showcase
	// value Evaluate() computes for UI/Telegram; this is the real per-broker
	// picture executeAll acted on, so the UI does not show one broker's
	// decision as if it applied to all of them.
	BrokerDecisions map[string]map[string]any `json:"brokerDecisions,omitempty"`
}

func (e *Engine) Evaluate() EvalResult {
	return e.EvaluateWindow(backgroundWindow())
}

func (e *Engine) EvaluateWindow(w execWindow) EvalResult {
	cfg := e.AutoConfig()
	today := tradingdate.TodayNYSE(e.now())
	providerChain := quoteProviderChain(cfg)
	allowExits := anyAllow(cfg, "allowExits")
	allowEntries := anyAllow(cfg, "allowNewEntries")
	// One read feeds both the universe and the per-symbol thresholds. An
	// unreadable watchlist is not an empty one: reporting it as
	// empty_symbol_universe would hide a broken store behind a normal-looking
	// "no tickers" day, and would silently swap per-watch thresholds for the
	// global defaults.
	watches, watchErr := e.DB.ListWatches()
	// The showcase book must belong to a broker that is actually attached and
	// enabled. Hardcoding webull answered for the whole system with one
	// broker's book: a Robinhood-only setup saw an empty position and an entry
	// candidate while Robinhood held the trade (AUD-021, the AUD-017 class).
	showcase, showcaseBr := e.showcaseBroker(cfg)
	blocked := func(reason string, symbols []string) EvalResult {
		return EvalResult{
			EvaluatedAt: e.now().UTC().Format(time.RFC3339Nano),
			TodayKey:    today,
			AutoTrading: cfg,
			Symbols:     symbols,
			Decision:    map[string]any{"action": "none", "reason": reason, "symbol": nil, "candidate": nil},
			Live:        e.evalLive(cfg),

			DecisionBroker: showcase,
		}
	}
	if watchErr != nil {
		return blocked("watchlist_unavailable", nil)
	}
	symbols := configuredSymbols(watches)
	watchBy := map[string]map[string]any{}
	for _, w := range watches {
		watchBy[store.SafeTicker(fmt.Sprint(w["symbol"]))] = w
	}
	brokerTrades, journalErr := e.DB.ListTrades("broker_trades")
	if journalErr != nil {
		return blocked("journal_unavailable", symbols)
	}
	open, held, heldErr := e.booksFor(showcase, showcaseBr, brokerTrades, w)
	quoteSymbols := append([]string{}, symbols...)
	addQuote := func(sym string) {
		sym = store.SafeTicker(sym)
		if sym == "" {
			return
		}
		for _, s := range quoteSymbols {
			if s == sym {
				return
			}
		}
		quoteSymbols = append(quoteSymbols, sym)
	}
	if open != nil {
		addQuote(fmt.Sprint(open["symbol"]))
	}
	for _, row := range brokerTrades {
		if fmt.Sprint(row["status"]) != "open" {
			continue
		}
		addQuote(fmt.Sprint(row["symbol"]))
	}
	e.prefetchQuotes(quoteSymbols, providerChain)
	var quotes []map[string]any
	for _, sym := range quoteSymbols {
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
		ev := e.evalWatch(sym, w, cfg, providerChain)
		low, high, highInvalid := watchThresholds(w, cfg)
		quotes = append(quotes, map[string]any{
			"symbol": sym, "ok": ev.ok, "ibs": ev.ibs, "currentPrice": ev.price,
			"thresholds":     map[string]any{"lowIBS": low, "highIBS": high},
			"highIBSInvalid": highInvalid,
		})
	}
	decision := decideLiveAction(quotes, symbols, held, heldErr, open, allowEntries, allowExits)
	if reason, _ := decision["reason"].(string); reason == "empty_symbol_universe" || reason == "broker_position_mismatch" {
		e.logAuto("execution_skipped", "", map[string]any{"symbol": decision["symbol"], "reason": reason})
	}
	return EvalResult{
		EvaluatedAt: e.now().UTC().Format(time.RFC3339Nano),
		TodayKey:    today,
		AutoTrading: cfg,
		Symbols:     symbols,
		Quotes:      quotes,
		OpenTrade:   open,
		Decision:    decision,
		Live:        e.evalLive(cfg),

		DecisionBroker: showcase,
	}
}

// showcaseBroker picks the broker the single-book Decision speaks for: the
// first enabled one in snapshot order (webull, robinhood, extras), so a
// multi-broker setup keeps showing webull and a single-broker setup shows
// itself.
func (e *Engine) showcaseBroker(cfg map[string]any) (string, Broker) {
	snaps := e.brokerSnapshot()
	for _, nb := range snaps {
		if on, _, _ := brokerFlags(cfg, nb.name); on {
			return nb.name, nb.br
		}
	}
	if len(snaps) > 0 {
		return snaps[0].name, snaps[0].br
	}
	return "webull", e.defaultBroker()
}

func decideLiveAction(quotes []map[string]any, symbols []string, held map[string]float64, heldErr error, open map[string]any, allowEntries, allowExits bool) map[string]any {
	none := func(reason string, symbol any, cand any) map[string]any {
		return map[string]any{"action": "none", "reason": reason, "symbol": symbol, "candidate": cand}
	}
	if open != nil && allowExits {
		sym := store.SafeTicker(fmt.Sprint(open["symbol"]))
		// A position the broker holds is closed on its exit signal whether or
		// not the journal knows about it: an unrecorded position is still our
		// money at risk, and refusing to exit it left it open forever.
		if heldErr == nil {
			if _, ok := held[sym]; !ok {
				// Nothing of this ticker at the broker: there is nothing to
				// sell, so no order — the journal row stays open for the
				// operator to reconcile.
				return none("broker_position_mismatch", sym, nil)
			}
		}
		var row map[string]any
		for _, q := range quotes {
			if q["symbol"] == sym && q["ok"] == true {
				row = q
				break
			}
		}
		high := liveHighOrDefault(row)
		if row != nil && asBool(row["highIBSInvalid"]) {
			return none("invalid_high_ibs", sym, row)
		}
		if row != nil && ibs.IsExitSignal(row["ibs"], high) {
			return map[string]any{"action": "exit", "reason": "ibs_exit", "symbol": sym, "candidate": row}
		}
		reason := "open_position_quote_unavailable"
		if row != nil {
			reason = "exit_threshold_not_reached"
		}
		return none(reason, sym, row)
	}
	if open != nil && !allowExits {
		return none("exits_disabled", store.SafeTicker(fmt.Sprint(open["symbol"])), nil)
	}
	if len(symbols) == 0 {
		return none("empty_symbol_universe", nil, nil)
	}
	if open == nil && !allowEntries {
		return none("entries_disabled", nil, nil)
	}
	if open == nil && allowEntries {
		if heldErr != nil {
			return none("broker_positions_unavailable", nil, nil)
		}
		if len(held) > 0 {
			return none("broker_position_exists", nil, nil)
		}
		// quotes carries more than the watchlist: EvaluateWindow adds the
		// symbol of every open broker trade (another broker's included) and of
		// a live position without a journal row, so they can be priced and
		// exited. An entry may only be opened in a monitored ticker, so the
		// candidate loop is restricted to the configured universe.
		watched := map[string]bool{}
		for _, s := range symbols {
			watched[store.SafeTicker(s)] = true
		}
		var best map[string]any
		bestIBS := 2.0
		for _, q := range quotes {
			if q["ok"] != true {
				continue
			}
			if !watched[store.SafeTicker(fmt.Sprint(q["symbol"]))] {
				continue
			}
			if asBool(q["highIBSInvalid"]) {
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
			return map[string]any{"action": "entry", "reason": "lowest_ibs_signal", "symbol": best["symbol"], "candidate": best}
		}
	}
	return none("no_signal", nil, nil)
}

func (e *Engine) booksFor(name string, br Broker, rows []map[string]any, w execWindow) (open map[string]any, held map[string]float64, heldErr error) {
	held, heldErr = e.heldSymbolsOn(br, w)
	open = store.OpenBrokerTradeFor(rows, name)
	if open == nil && heldErr == nil && len(held) > 0 {
		// The journal is flat but the broker is not. Exit that position on its
		// own signal. With several tickers held the pick is the alphabetically
		// first, so successive runs are deterministic rather than map-random.
		// ponytail: one position per broker per cycle; a real multi-position
		// book would need decideLiveAction to return a list.
		syms := make([]string, 0, len(held))
		for sym := range held {
			syms = append(syms, sym)
		}
		sort.Strings(syms)
		sym := syms[0]
		open = map[string]any{"symbol": sym, "quantity": held[sym], "status": "open", "source": "live_broker", "broker": name}
	}
	return open, held, heldErr
}

func (e *Engine) liveHeldSymbols() (map[string]float64, error) {
	byBroker, err := e.heldSymbolsByBroker()
	held := map[string]float64{}
	for _, one := range byBroker {
		for sym, qty := range one {
			held[sym] = qty
		}
	}
	return held, err
}

// heldSymbolsByBroker reads live positions from every attached broker
// (BrokerNamed / Brokers), not only defaultBroker.
func (e *Engine) heldSymbolsByBroker() (map[string]map[string]float64, error) {
	out := map[string]map[string]float64{}
	var firstErr error
	for _, nb := range e.brokerSnapshot() {
		held, err := e.heldSymbolsOn(nb.br, backgroundWindow())
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		out[nb.name] = held
	}
	return out, firstErr
}

// heldSymbolsOn reads the broker's live positions. The read is retried like
// every other broker read on the T-1 path: a single transient failure here
// turns the day's decision into broker_positions_unavailable and drops the
// entry, even though the same call succeeded seconds earlier in
// t1BrokerReconcile. w bounds the retries by the close-of-session budget when
// the caller has one.
func (e *Engine) heldSymbolsOn(br Broker, w execWindow) (map[string]float64, error) {
	if br == nil {
		return map[string]float64{}, nil
	}
	pos, err := retryBrokerReadWindow(e, w, "positions", func(ctx context.Context) ([]any, error) {
		return brokerPositions(ctx, br)
	})
	if err != nil {
		return nil, err
	}
	held := map[string]float64{}
	for _, row := range pos {
		m := mapOf(row)
		if m == nil {
			continue
		}
		sym := store.SafeTicker(firstString(m, "symbol", "ticker", "display_symbol"))
		if sym == "" {
			continue
		}
		q := firstPositive(m["quantity"], m["qty"], m["position"], m["holding"], m["total_qty"], m["totalQuantity"])
		if q > 0 {
			held[sym] = q
		}
	}
	return held, nil
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
		return asFloat(th["highIBS"])
	}
	return ibs.DefaultHighIBS
}

// Execute evaluates the current signal and submits it, with no T-1
// close-of-session deadline of its own (manual/API triggers use this path).
// Use ExecuteWindow directly when a deadline applies.
func (e *Engine) Execute(trigger string) EvalResult {
	return e.ExecuteCtx(context.Background(), trigger)
}

// ExecuteCtx is Execute with an externally supplied context (e.g. an HTTP
// request's) and no additional deadline of its own.
func (e *Engine) ExecuteCtx(ctx context.Context, trigger string) EvalResult {
	return e.executeWindow(windowFromCtx(ctx), trigger)
}

// ExecuteWindow is Execute under a caller-supplied execWindow (ctx + T-1
// deadline). Only this package builds an execWindow (via t1Window), so it
// stays unexported; ExecuteCtx/Execute are the public entry points for
// everyone else.
func (e *Engine) executeWindow(w execWindow, trigger string) EvalResult {
	corr := newCorrelationID()
	ev := e.EvaluateWindow(w)
	e.mu.Lock()
	e.lastRunAt = ev.EvaluatedAt
	e.lastResult = ev
	e.mu.Unlock()
	snaps := e.brokerSnapshot()
	// Always go through executeAll, including zero and one broker: every broker
	// has its own flags, health status, and book, and only executeAll checks
	// them. See P0-1 in AUTOTRADE_ROADMAP.md.
	return e.executeAll(w, ev, trigger, corr, snaps)
}

func (e *Engine) placeMarketOnce(ctx context.Context, symbol, side string, qty float64, cfg PlaceMarketCfg, br Broker) (OrderResult, error) {
	if br == nil {
		return OrderResult{Error: "Не заданы ключи Webull"}, fmt.Errorf("Не заданы ключи Webull")
	}
	cfg.Ctx = ctx
	if p, ok := br.(marketCfgPlacer); ok {
		return p.PlaceMarketCfg(symbol, side, qty, cfg)
	}
	return br.PlaceMarket(symbol, side, qty)
}

// submitAttempts bounds retries of a single order submission. The decision was
// taken at T-1 and must land before the close, so the budget is small and the
// pauses short.
const submitAttempts = 3

var submitRetryStep = 750 * time.Millisecond

// placeMarket submits one order, retrying a failed submission without ever
// risking a duplicate. The client order id is chosen here, so after a failure
// we can ask the broker whether that exact order landed anyway — the case a
// blind resend would turn into two positions. Only when the broker does not
// know the id do we try again, with a fresh one.
//
// w bounds the whole loop: when w carries a T-1 deadline, an attempt that
// would not fit in the remaining budget (per deadlineExceeded) is not
// started — the broker is not left mid-request past the close, and the
// operator is told why via execution_deadline_exceeded instead of a silent
// stop. See P1-1 in AUTOTRADE_ROADMAP.md.
func (e *Engine) placeMarket(w execWindow, symbol, side string, qty float64, cfg PlaceMarketCfg, br Broker) (OrderResult, error) {
	var res OrderResult
	var err error
	var lastDur time.Duration
	for attempt := 1; attempt <= submitAttempts; attempt++ {
		if e.deadlineExceeded(w, lastDur) {
			return e.abortPlaceForDeadline(symbol, side, qty, attempt)
		}
		// The process is stopping. Nothing has left for this attempt, so this
		// is "certainly not sent", not the ambiguous case: without this check
		// the placement fails on the cancelled context, orderLanded fails on
		// the same context, and queryFailed turns a shutdown into
		// order_submit_status_unknown, blocking the next entry until an
		// operator resolves an order that never existed.
		if err := w.parentCtx().Err(); err != nil {
			return e.abortPlaceForCancel(symbol, side, qty, attempt, err)
		}
		try := cfg
		if try.ClientOrderID == "" || attempt > 1 {
			try.ClientOrderID = webull.NewClientOrderID()
		}
		attemptCtx, cancel := e.attemptContext(w)
		start := e.now()
		res, err = e.placeMarketOnce(attemptCtx, symbol, side, qty, try, br)
		cancel()
		if err == nil && res.Submitted {
			return res, nil
		}
		if res.Ambiguous && strings.Contains(strings.ToLower(res.Error), "unauthorized") {
			return res, nil
		}
		landed, queryFailed, detail := e.orderLanded(w, try.ClientOrderID, br)
		lastDur = e.now().Sub(start) + submitRetryStep
		if queryFailed {
			// The submission failed and the broker cannot say whether the order
			// arrived. Resending risks a second position, so stop here — but do
			// not claim success either: the caller tracks the id in case a fill
			// appears, and reports the outcome as unknown.
			e.logAuto("order_submit_status_unknown", "", map[string]any{
				"symbol": symbol, "side": side, "clientOrderId": try.ClientOrderID,
				"attempt": attempt, "error": errText(err, res.Error),
			})
			res.Submitted = false
			res.Ambiguous = true
			res.ClientOrderID = try.ClientOrderID
			res.Symbol, res.Side, res.Quantity = symbol, side, qty
			res.Error = errText(err, res.Error)
			return res, nil
		}
		if landed {
			st := NormalizeOrderStatus(orderStatusField(detail))
			// "Landed" only means the broker knows the id. An order it already
			// rejected or cancelled did reach it, but nothing was bought or
			// sold, and reporting Submitted here would tell the operator the
			// order went out. Do not resend either: the id exists at the
			// broker and the decision was the day's only one.
			if st == "rejected" || st == "cancelled" {
				e.logAuto("order_rejected_by_broker", "", map[string]any{
					"symbol": symbol, "side": side, "clientOrderId": try.ClientOrderID,
					"attempt": attempt, "status": st, "error": errText(err, res.Error),
				})
				res.Submitted = false
				res.Ambiguous = false
				res.ClientOrderID = try.ClientOrderID
				res.Symbol, res.Side, res.Quantity = symbol, side, qty
				res.Status = st
				if res.Error == "" {
					res.Error = "order " + st + " by broker"
				}
				return res, nil
			}
			e.logAuto("order_submit_landed_despite_error", "", map[string]any{
				"symbol": symbol, "side": side, "clientOrderId": try.ClientOrderID,
				"attempt": attempt, "error": errText(err, res.Error),
			})
			res.Submitted = true
			res.ClientOrderID = try.ClientOrderID
			res.Symbol, res.Side, res.Quantity = symbol, side, qty
			res.Error = ""
			if st != "" && st != "unknown" {
				res.Status = st
			}
			if p := fillPriceFrom(detail); p > 0 {
				res.FilledPrice = p
			}
			if q := fillQtyFrom(detail); q > 0 {
				res.FilledQty = q
			}
			return res, nil
		}
		if attempt == submitAttempts {
			break
		}
		e.logAuto("order_submit_retry", "", map[string]any{
			"symbol": symbol, "side": side, "attempt": attempt,
			"error": errText(err, res.Error),
		})
		e.sleep(submitRetryStep)
	}
	return res, err
}

// abortPlaceForCancel stops placeMarket when the caller's context was already
// cancelled before an attempt started — a shutdown, not a broker problem.
func (e *Engine) abortPlaceForCancel(symbol, side string, qty float64, attempt int, cause error) (OrderResult, error) {
	e.logAuto("order_submit_aborted", "", map[string]any{
		"symbol": symbol, "side": side, "quantity": qty, "attempt": attempt,
		"reason": "context_cancelled", "error": cause.Error(),
	})
	return OrderResult{
		Submitted: false, Symbol: symbol, Side: side, Quantity: qty,
		Error: cause.Error(),
	}, cause
}

// abortPlaceForDeadline stops placeMarket's retry loop when the T-1 budget
// ran out before another attempt could safely start. Nothing was sent this
// attempt (the previous one, if any, already resolved to a terminal outcome
// via orderLanded), so the result is a plain unsubmitted failure, not
// Ambiguous — logged and surfaced to the operator rather than swallowed.
func (e *Engine) abortPlaceForDeadline(symbol, side string, qty float64, attempt int) (OrderResult, error) {
	e.logAuto("execution_deadline_exceeded", "", map[string]any{
		"symbol": symbol, "side": side, "quantity": qty, "attempt": attempt, "stage": "place_market",
	})
	e.notifyDeadlineExceeded("Заявка не отправлена", symbol, side, qty)
	return OrderResult{
		Submitted: false, Symbol: symbol, Side: side, Quantity: qty,
		Error: ErrExecutionDeadlineExceeded.Error(),
	}, ErrExecutionDeadlineExceeded
}

// orderLanded reports whether the broker knows this client order id.
// queryFailed means the lookup itself failed: the caller must NOT send a
// second order. terminal-absent (ErrOrderNotFound) is safe to retry.
// listing-unavailable is treated as queryFailed — a new id would duplicate.
// The query itself runs under w's remaining budget: if the deadline already
// passed, the lookup fails fast (queryFailed=true), which is the correct,
// conservative answer — a cancelled-by-deadline submission must resolve
// Ambiguous, never "safe to retry" and never "confirmed lost". See P1-1 and
// the "Идемпотентность отправки" note in AUTOTRADE_ROADMAP.md.
func (e *Engine) orderLanded(w execWindow, clientOrderID string, br Broker) (landed, queryFailed bool, detail map[string]any) {
	if br == nil || clientOrderID == "" {
		return false, false, nil
	}
	ctx, cancel := e.attemptContext(w)
	defer cancel()
	detail, err := brokerOrderDetail(ctx, br, clientOrderID)
	if err != nil {
		if errors.Is(err, ErrOrderNotFound) {
			return false, false, nil
		}
		return false, true, nil
	}
	if detail == nil {
		return false, false, nil
	}
	if clientOrderIDOf(detail) == clientOrderID {
		return true, false, detail
	}
	return false, false, nil
}

func executionWindowApplies(trigger string) bool {
	// Node T-1 (executeWebullSignal from telegramAggregation) does not consult
	// executionWindowSeconds — that gate is only on the separate autotrade
	// scheduler tick. Gating telegram_t1 here skipped the day's only live
	// orders and left T-1 with nothing to report.
	switch trigger {
	case "manual_execute", "scheduler":
		return true
	}
	return false
}

// startTracking journals the order and starts polling it. Ambiguous counts as
// submitted here: the id was minted and may well be live at the broker, so it
// must land in the journal — otherwise the next click finds no pending tracker
// and sends a second MARKET for the same intent (AUD-024).
func (e *Engine) startTracking(res OrderResult, meta orderMeta) {
	if (!res.Submitted && !res.Ambiguous) || res.ClientOrderID == "" {
		return
	}
	broker := meta.Broker
	if broker == "" {
		broker = "webull"
	}
	if err := e.DB.SaveOrderTracker(map[string]any{
		"clientOrderId": res.ClientOrderID, "symbol": meta.Symbol, "action": meta.Action,
		"status": "submitted", "quantity": meta.Quantity, "source": meta.Source, "dateKey": meta.DateKey,
		"broker": broker, "startedAt": e.now().UTC().Format(time.RFC3339Nano),
	}); err != nil {
		e.logAuto("tracker_persist_failed", meta.CorrelationID, map[string]any{
			"clientOrderId": res.ClientOrderID, "broker": broker, "error": err.Error(),
		})
		_ = e.Send(e.chat(), fmt.Sprintf(
			"<b>Трекер не сохранён</b>\n%s • %s\nclientOrderId: %s\nВход заблокирован, заявку проверьте у брокера.",
			meta.Symbol, meta.Action, res.ClientOrderID))
		e.mu.Lock()
		if e.trackerPersistFail == nil {
			e.trackerPersistFail = map[string]bool{}
		}
		e.trackerPersistFail[broker] = true
		e.mu.Unlock()
		_ = e.persistTrackerBlock(broker)
		return
	}
	e.rememberOrder(res.ClientOrderID, meta)
	e.TrackSubmitted(res.ClientOrderID)
}

func (e *Engine) persistTrackerBlock(broker string) error {
	if e == nil || e.DB == nil {
		return nil
	}
	if broker == "" {
		broker = "webull"
	}
	settings, err := e.DB.SettingsErr()
	if err != nil {
		return err
	}
	blocks, _ := settings["trackerPersistFail"].(map[string]any)
	if blocks == nil {
		blocks = map[string]any{}
	}
	blocks[broker] = true
	if err := e.DB.SetSettingsKeys(map[string]any{"trackerPersistFail": blocks}); err != nil {
		e.logAuto("tracker_persist_block_save_failed", "", map[string]any{"broker": broker, "error": err.Error()})
		return err
	}
	return nil
}

func (e *Engine) trackerPersistBlocked(broker string) bool {
	if e == nil {
		return false
	}
	if broker == "" {
		broker = "webull"
	}
	e.mu.Lock()
	mem := e.trackerPersistFail != nil && e.trackerPersistFail[broker]
	e.mu.Unlock()
	if mem {
		return true
	}
	if e.DB == nil {
		return false
	}
	settings, err := e.DB.SettingsErr()
	if err != nil {
		return true
	}
	blocks, _ := settings["trackerPersistFail"].(map[string]any)
	return asBool(blocks[broker])
}

// ClearTrackerPersistBlock lifts the trackerPersistFail guard startTracking
// sets for a broker when SaveOrderTracker fails (P1-8): the safeguard itself
// is correct (an order went out with no local record of it, so entries must
// not continue blind), but nothing used to be able to undo it short of
// editing settings in the database by hand. note is mandatory and is
// recorded in autotrade_logs so the reason for lifting the block survives.
func (e *Engine) ClearTrackerPersistBlock(broker, note string) error {
	if e == nil {
		return fmt.Errorf("engine not configured")
	}
	broker = strings.TrimSpace(broker)
	if broker == "" {
		broker = "webull"
	}
	note = strings.TrimSpace(note)
	if note == "" {
		return fmt.Errorf("note is required")
	}
	if !e.trackerPersistBlocked(broker) {
		return fmt.Errorf("tracker persist block is not set for %s", broker)
	}
	e.mu.Lock()
	if e.trackerPersistFail != nil {
		delete(e.trackerPersistFail, broker)
	}
	e.mu.Unlock()
	if e.DB != nil {
		settings, err := e.DB.SettingsErr()
		if err != nil {
			e.mu.Lock()
			if e.trackerPersistFail == nil {
				e.trackerPersistFail = map[string]bool{}
			}
			e.trackerPersistFail[broker] = true
			e.mu.Unlock()
			return err
		}
		blocks, _ := settings["trackerPersistFail"].(map[string]any)
		if blocks == nil {
			blocks = map[string]any{}
		}
		delete(blocks, broker)
		if err := e.DB.SetSettingsKeys(map[string]any{"trackerPersistFail": blocks}); err != nil {
			e.mu.Lock()
			if e.trackerPersistFail == nil {
				e.trackerPersistFail = map[string]bool{}
			}
			e.trackerPersistFail[broker] = true
			e.mu.Unlock()
			return err
		}
	}
	e.logAuto("tracker_persist_block_cleared", "", map[string]any{"broker": broker, "note": note, "author": "operator"})
	return nil
}

// t1BrokerReconcile checks each broker's own book before the T-1 orders go
// out and reports which brokers must sit this run out. The result is per
// broker on purpose: an order still in flight at Webull is no reason for
// Robinhood to skip its exit (and vice versa). A positions read that fails
// is not reported here — decideLiveAction already turns it into that
// broker's own broker_positions_unavailable skip.
func (e *Engine) t1BrokerReconcile(w execWindow) (skip map[string]bool, waitFill bool) {
	skip = map[string]bool{}
	for _, nb := range e.brokerSnapshot() {
		if nb.br == nil {
			continue
		}
		br := nb.br
		rows, err := retryBrokerReadWindow(e, w, "open_orders", func(ctx context.Context) ([]any, error) {
			return brokerOpenOrders(ctx, br)
		})
		if err != nil {
			skip[nb.name] = true
			e.logAuto("execution_skipped", "", map[string]any{"broker": nb.name, "reason": "open_orders_unavailable", "error": err.Error()})
			continue
		}
		for _, row := range rows {
			m := mapOf(row)
			if m == nil {
				continue
			}
			st := NormalizeOrderStatus(fmt.Sprint(firstNonEmpty(m["status"], m["order_status"], m["orderStatus"])))
			if IsFinalOrderStatus(st) {
				continue
			}
			skip[nb.name] = true
			waitFill = true
			break
		}
	}
	return skip, waitFill
}

// retryBrokerRead retries a read-only broker call with no T-1 deadline of its
// own — used outside the close-of-session path (e.g. sizing's account/position
// reads), where unlimited retries within submitAttempts is the existing,
// unchanged behavior.
func retryBrokerRead[T any](e *Engine, what string, fn func() (T, error)) (T, error) {
	return retryBrokerReadWindow(e, backgroundWindow(), what, func(context.Context) (T, error) {
		return fn()
	})
}

// retryBrokerReadWindow retries a read-only broker call, bounded by w. These
// reads run before any order is sent, so a repeat is free on its own — but
// when w carries a T-1 deadline, a retry that would not fit in the remaining
// budget (per deadlineExceeded) is not started: better to report
// execution_deadline_exceeded than to still be waiting on a read after the
// close. See P1-1 in AUTOTRADE_ROADMAP.md.
func retryBrokerReadWindow[T any](e *Engine, w execWindow, what string, fn func(ctx context.Context) (T, error)) (T, error) {
	var out T
	var err error
	var lastDur time.Duration
	for attempt := 1; attempt <= submitAttempts; attempt++ {
		if e.deadlineExceeded(w, lastDur) {
			e.logAuto("execution_deadline_exceeded", "", map[string]any{
				"call": what, "attempt": attempt, "stage": "broker_read",
			})
			if err == nil {
				err = ErrExecutionDeadlineExceeded
			}
			return out, err
		}
		ctx, cancel := e.attemptContext(w)
		start := e.now()
		out, err = fn(ctx)
		cancel()
		lastDur = e.now().Sub(start)
		if err == nil {
			return out, nil
		}
		if attempt == submitAttempts {
			break
		}
		e.logAuto("broker_read_retry", "", map[string]any{
			"call": what, "attempt": attempt, "error": err.Error(),
		})
		e.sleep(submitRetryStep)
	}
	return out, err
}

func errText(err error, fallback string) string {
	if err != nil {
		return err.Error()
	}
	return fallback
}

func (e *Engine) logBalanceSnapshot(corr, symbol, action string, br Broker) {
	if br == nil {
		return
	}
	acct, err := br.Account()
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
	// Node reads the close from the trading calendar (autotrade.js:2140-2146),
	// so a short day closes at 13:00 and the window moves with it.
	closeMin, _, err := e.sessionCloseMin()
	if err != nil {
		// Unknown close means an unknown window: refuse instead of assuming 16:00.
		return true
	}
	now := e.now()
	p := tradingdate.CurrentTimeNYSE(now)
	// Seconds do not vary by zone, matching Node's nowEt.hh/mm + getUTCSeconds().
	nowSec := p.Hour*3600 + p.Minute*60 + now.Second()
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
		return nil, fmt.Errorf("Ключи Webull не настроены")
	}
	snap, err := e.Broker.Account()
	if err != nil {
		return nil, err
	}
	pos, perr := e.Broker.Positions()
	if pos == nil {
		pos = []any{}
	}
	out := map[string]any{"connection": e.WebullSummary(), "account": snap, "positions": pos}
	if perr != nil {
		// An empty list and an unreadable one look the same on the dashboard.
		out["positionsError"] = perr.Error()
	}
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

func (e *Engine) Logs(limit int) (map[string]any, error) {
	logs, err := e.DB.ListAutotradeLogs(limit)
	if err != nil {
		return nil, err
	}
	autotrade, err := e.DB.ListAutotradeLogsKind("autotrade", limit)
	if err != nil {
		return nil, err
	}
	monitor, err := e.DB.ListAutotradeLogsKind("monitor", limit)
	if err != nil {
		return nil, err
	}
	brokerRaw, err := e.DB.ListAutotradeLogsKind("brokerRaw", limit)
	if err != nil {
		return nil, err
	}
	pending, err := e.DB.ListPendingTrackers()
	if err != nil {
		return nil, err
	}
	recent, err := e.DB.ListRecentTrackers(20)
	if err != nil {
		return nil, err
	}
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
	}, nil
}

// manualOrder is the shared guarded path for operator-initiated submissions
// (close, test buy). It reuses submitEvaluated's pending-tracker, persist-block,
// and in-flight reservation checks, then always starts a tracker. Autotrading
// enablement and the T-1 execution window are automatic-path concerns and are
// not applied here.
func (e *Engine) manualOrder(br Broker, brokerName, symbol, side string, qty float64, source string) (OrderResult, error) {
	symbol = store.SafeTicker(symbol)
	side = strings.ToUpper(strings.TrimSpace(side))
	action := "exit"
	if side == "BUY" {
		action = "entry"
	}
	key := brokerName + ":" + action
	if action != "entry" {
		key = brokerName + ":" + symbol + ":" + action
	}

	var pending map[string]any
	var pendErr error
	if action == "entry" {
		pending, pendErr = e.DB.AnyPendingTrackerFor(brokerName)
	} else {
		pending, pendErr = e.DB.FindPendingTrackerBroker(symbol, action, brokerName)
	}
	if pendErr != nil {
		return OrderResult{Error: "journal_unavailable", Symbol: symbol, Side: side}, pendErr
	}
	if pending != nil {
		errKey := "pending_" + action + "_tracker_exists"
		return OrderResult{Error: errKey, Symbol: symbol, Side: side}, fmt.Errorf("%s", errKey)
	}
	if action == "entry" && e.trackerPersistBlocked(brokerName) {
		return OrderResult{Error: "execution_unknown", Symbol: symbol, Side: side}, fmt.Errorf("execution_unknown")
	}

	e.mu.Lock()
	if e.reservations == nil {
		e.reservations = map[string]string{}
	}
	if _, taken := e.reservations[key]; taken {
		e.mu.Unlock()
		errKey := "pending_" + action + "_submission_exists"
		return OrderResult{Error: errKey, Symbol: symbol, Side: side}, fmt.Errorf("%s", errKey)
	}
	e.reservations[key] = "submitting"
	e.mu.Unlock()
	defer func() {
		e.mu.Lock()
		delete(e.reservations, key)
		e.mu.Unlock()
	}()

	res, err := e.placeMarket(backgroundWindow(), symbol, side, qty, PlaceMarketCfg{}, br)
	e.startTracking(res, orderMeta{
		Source: source, Symbol: symbol, Action: action, Quantity: qty,
		Broker: brokerName, DateKey: tradingdate.TodayNYSE(e.now()),
	})
	return res, err
}

func (e *Engine) ClosePosition(brokerName, symbol string) (OrderResult, error) {
	symbol = store.SafeTicker(symbol)
	if strings.TrimSpace(brokerName) == "" {
		brokerName = "webull"
	}
	br := e.BrokerNamed(brokerName)
	if br == nil {
		return OrderResult{Error: "Не заданы ключи Webull"}, fmt.Errorf("Не заданы ключи Webull")
	}
	pos, err := retryBrokerReadWindow(e, backgroundWindow(), "positions", func(ctx context.Context) ([]any, error) {
		return brokerPositions(ctx, br)
	})
	if err != nil {
		return OrderResult{Error: err.Error(), Symbol: symbol, Side: "SELL"}, err
	}
	qty := PositionQuantity(pos, symbol)
	if !(qty > 0) {
		err := fmt.Errorf("No broker position found for %s", symbol)
		return OrderResult{Error: err.Error(), Symbol: symbol, Side: "SELL"}, err
	}
	res, err := e.manualOrder(br, brokerName, symbol, "SELL", qty, "manual_close")
	e.logAuto("close_position", "", map[string]any{"symbol": symbol, "submitted": res.Submitted, "clientOrderId": res.ClientOrderID, "broker": brokerName})
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
		return OrderResult{Error: "Количество для тестовой покупки должно быть целым положительным числом"}, fmt.Errorf("Количество для тестовой покупки должно быть целым положительным числом")
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
		msg := fmt.Sprintf("Количество для тестовой покупки должно быть от 1 до %.0f", maxQty)
		return OrderResult{Error: msg}, fmt.Errorf("%s", msg)
	}
	return e.TestBuyOn("webull", symbol, qty)
}

func (e *Engine) TestBuyOn(brokerName, symbol string, qty float64) (OrderResult, error) {
	if strings.TrimSpace(brokerName) == "" {
		brokerName = "webull"
	}
	br := e.BrokerNamed(brokerName)
	if br == nil {
		return OrderResult{Error: "Не заданы ключи Webull"}, fmt.Errorf("Не заданы ключи Webull")
	}
	res, err := e.manualOrder(br, brokerName, store.SafeTicker(symbol), "BUY", qty, "test_buy")
	e.logAuto("test_buy", "", map[string]any{"symbol": symbol, "submitted": res.Submitted, "broker": brokerName})
	return res, err
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

// cancelOpenOrdersBeforeEntry clears this engine's own unfilled orders on the
// symbol it is about to buy. Orders it did not place are left alone. w bounds
// the read by the same T-1 budget as the entry that follows it.
//
// A failed cancel is an error, not a warning: the caller must not send a new
// entry while our own working order may still be live on the same symbol —
// see AUD-025.
func (e *Engine) cancelOpenOrdersBeforeEntry(w execWindow, symbol string, br Broker) ([]string, error) {
	if br == nil || e.DB == nil {
		return nil, nil
	}
	rows, err := retryBrokerReadWindow(e, w, "open_orders", func(ctx context.Context) ([]any, error) {
		return brokerOpenOrders(ctx, br)
	})
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
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
		// Robinhood называет поля ref_id и state: по client_order_id/status
		// его заявки молча пропускались и оставались висеть на бирже
		// при отправке нового входа (AUD-045).
		st := NormalizeOrderStatus(fmt.Sprint(firstNonEmpty(m["status"], m["order_status"], m["orderStatus"], m["state"])))
		if IsFinalOrderStatus(st) {
			continue
		}
		id := clientOrderIDOf(m)
		if id == "" {
			continue
		}
		own, err := e.DB.IsOwnOrder(id)
		if err != nil {
			return cancelled, fmt.Errorf("own_order_lookup_failed %s: %v", id, err)
		}
		if !own {
			e.logAuto("foreign_order_left_open", "", map[string]any{"symbol": sym, "clientOrderId": id})
			continue
		}
		if err := br.CancelOrder(id); err != nil {
			_ = e.DB.AppendAutotradeLog("open_order_cancel_failed " + id + " " + err.Error())
			return cancelled, fmt.Errorf("%w %s: %v", ErrOpenOrderCancelFailed, id, err)
		}
		cancelled = append(cancelled, id)
		_ = e.DB.AppendAutotradeLog("open_orders_cancelled " + id + " " + want)
	}
	return cancelled, nil
}

func (e *Engine) LastRun() (string, any) {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.lastRunAt, e.lastResult
}
