package live

import (
	"fmt"
	"math"
	"strings"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

// isTestSource reports whether an order came from the test-buy button rather
// than from the strategy. Such an order is real money at the broker, so it is
// journaled — but it is not a strategy trade and must stay out of the
// statistics and out of the monitoring page.
func isTestSource(source string) bool {
	s := strings.ToLower(strings.TrimSpace(source))
	return s == "test_buy" || s == "test_sell"
}

// openPositionFor finds the open position an order belongs to: by id when the
// order names one, then by ticker.
//
// There is at most one open position per ticker, both brokers included, so the
// broker hop this used to need is gone with it. It existed because Webull and
// Robinhood held separate journal rows for the same signal, and one broker's
// exit could close the other's row, swapping the recorded exit price and P&L
// between them (AUD-068). One row per position cannot swap anything.
func (e *Engine) openPositionFor(symbol, preferID, broker string) (*store.Position, error) {
	want := store.SafeTicker(symbol)
	if preferID != "" {
		p, err := e.DB.GetPosition(preferID)
		if err != nil {
			e.logAuto("journal_read_failed", "", map[string]any{"op": "get_position", "id": preferID, "error": err.Error()})
			return nil, err
		}
		if p != nil && p.Status == "open" && p.Symbol == want {
			return p, nil
		}
	}
	p, err := e.DB.OpenPositionBySymbol(want)
	if err != nil {
		e.logAuto("journal_read_failed", "", map[string]any{"op": "open_position_by_symbol", "symbol": symbol, "error": err.Error()})
		return nil, err
	}
	return p, nil
}

// recordFill journals one broker answer. It returns false when the journal
// write failed, so the caller keeps the tracker pending and the next poll
// retries instead of stamping a final status over a fill nobody recorded.
func (e *Engine) recordFill(t map[string]any, detail map[string]any, status string) bool {
	clientOrderID := fmt.Sprint(t["clientOrderId"])
	symbol := store.SafeTicker(fmt.Sprint(t["symbol"]))
	action := fmt.Sprint(t["action"])
	source := fmt.Sprint(t["source"])
	dateKey := fmt.Sprint(t["dateKey"])
	if dateKey == "" || dateKey == "<nil>" {
		dateKey = tradingdate.TodayNYSE(e.now())
	}

	e.mu.Lock()
	meta := e.orderMeta[clientOrderID]
	e.mu.Unlock()
	brokerName := fillBrokerName(t, meta)

	fillPrice := fillPriceFrom(detail)
	// reportedQty is what the broker says actually executed. Keep it separate
	// from the fallbacks below: it is the only evidence of a partial fill.
	reportedQty := fillQtyFrom(detail)
	orderedQty := asFloat(t["quantity"])
	if !(orderedQty > 0) {
		orderedQty = meta.Quantity
	}
	fillQty := reportedQty
	unconfirmedPrice := false
	if !(fillPrice > 0) {
		unconfirmedPrice = true
	}
	if !(fillQty > 0) {
		fillQty = orderedQty
	}
	var exitIBS *float64
	if meta.IBS > 0 || meta.IBS == 0 && meta.CorrelationID != "" {
		ibs := meta.IBS
		exitIBS = &ibs
	}

	recorded := map[string]any{
		"symbol": symbol, "action": action, "status": status,
		"clientOrderId": clientOrderID, "quantity": fillQty,
		"source": source, "dateKey": dateKey, "broker": brokerName,
	}
	if unconfirmedPrice {
		recorded["priceUnconfirmed"] = true
	} else {
		recorded["price"] = fillPrice
	}
	e.logAuto("local_trade_recorded", meta.CorrelationID, recorded)

	// The executed quantity is the fact; the status string is only the broker's
	// vocabulary. Record the trade whenever shares actually changed hands, even
	// under a status word we do not recognise — otherwise a real position would
	// exist with nothing in the journal and the next cycle would buy again.
	if status != "filled" && !(reportedQty > 0) {
		if status == "terminal_absent" {
			e.deletePhantom(clientOrderID, symbol, brokerName)
		}
		return true
	}
	partial := reportedQty > 0 && orderedQty > 0 && reportedQty < orderedQty-1e-9
	if partial {
		e.logAuto("order_partially_filled", meta.CorrelationID, map[string]any{
			"symbol": symbol, "action": action, "clientOrderId": clientOrderID,
			"status": status, "orderedQty": orderedQty, "filledQty": reportedQty,
			"broker": brokerName,
		})
		_ = e.Send(e.chat(), fmt.Sprintf(
			"<b>%s: частичное исполнение</b>\n%s • %s\nзаказано: %v\nисполнено: %v\nstatus: %s",
			brokerLabel(brokerName), symbol, action, orderedQty, reportedQty, status))
		if action == "exit" {
			return e.reduceOpenQuantity(symbol, clientOrderID, brokerName, dateKey, reportedQty, fillPrice, exitIBS, meta.CorrelationID)
		}
	} else if status != "filled" {
		e.logAuto("order_filled_under_unknown_status", meta.CorrelationID, map[string]any{
			"symbol": symbol, "action": action, "clientOrderId": clientOrderID,
			"status": status, "filledQty": reportedQty,
		})
	}

	if !unconfirmedPrice {
		e.warnOnSlippage(symbol, action, clientOrderID, meta, fillPrice, brokerName)
	} else {
		e.logAuto("fill_price_unconfirmed", meta.CorrelationID, map[string]any{
			"symbol": symbol, "action": action, "clientOrderId": clientOrderID,
		})
	}

	if action == "entry" {
		return e.recordEntryFill(symbol, clientOrderID, brokerName, source, dateKey, fillQty, fillPrice, unconfirmedPrice, meta)
	}
	if action == "exit" {
		return e.recordExitFill(symbol, clientOrderID, brokerName, dateKey, fillQty, fillPrice, exitIBS, meta)
	}
	return true
}

// recordEntryFill folds one broker's entry into the position of that ticker,
// creating it when this is the first broker in. Both brokers executing the same
// signal used to produce two journal rows that a reconciliation pass then tried
// to match back up; now the second broker just fills in its own leg.
func (e *Engine) recordEntryFill(symbol, clientOrderID, brokerName, source, dateKey string, fillQty, fillPrice float64, unconfirmedPrice bool, meta orderMeta) bool {
	f := store.EntryFill{
		Symbol: symbol, Broker: brokerName, OrderID: clientOrderID, Qty: fillQty,
		EntryDate: dateKey, Source: source, IsTest: isTestSource(source),
	}
	// Same rule as the exit side: a strategy order always carries a
	// correlation id, so its IBS is a real reading even at exactly 0.
	if meta.IBS > 0 || meta.CorrelationID != "" {
		ibs := meta.IBS
		f.IBS = &ibs
	}
	if unconfirmedPrice {
		// 0 is not a fill. Leave the price NULL and mark the row so the journal
		// can badge it until an operator types a real one.
		f.Notes = "fill_price_unconfirmed"
	} else {
		price := fillPrice
		f.Price = &price
	}
	// A read failure here is not "no position": inserting blind would either
	// duplicate the row or raise a false persistence failure.
	if _, err := e.DB.AttachEntry(f); err != nil {
		e.logAuto("local_trade_record_failed", meta.CorrelationID, map[string]any{
			"error": err.Error(), "clientOrderId": clientOrderID,
		})
		e.raiseTrackerPersistBlock(brokerName)
		return false
	}
	return true
}

// recordExitFill closes this broker's leg, and the position itself once no
// broker holds shares any more. A position half-exited (one broker out, the
// other still in) stays open on purpose: it is still our money at risk.
func (e *Engine) recordExitFill(symbol, clientOrderID, brokerName, dateKey string, fillQty, fillPrice float64, exitIBS *float64, meta orderMeta) bool {
	p, err := e.openPositionFor(symbol, clientOrderID, brokerName)
	if err != nil {
		e.logAuto("local_trade_close_failed", meta.CorrelationID, map[string]any{
			"symbol": symbol, "clientOrderId": clientOrderID, "error": err.Error(),
		})
		e.raiseTrackerPersistBlock(brokerName)
		return false
	}
	if p == nil {
		e.exitWithoutPosition(symbol, clientOrderID, brokerName, fillQty, meta.CorrelationID)
		return true
	}

	after, booked, err := e.DB.ExitLeg(p.ID, brokerName, clientOrderID, fillQty, store.PositionExit{
		Date: dateKey, Price: fillPrice, IBS: exitIBS, Notes: "closed_from_broker_fill",
	})
	if err != nil {
		e.logAuto("local_trade_close_failed", meta.CorrelationID, map[string]any{
			"symbol": symbol, "clientOrderId": clientOrderID, "op": "close_leg", "error": err.Error(),
		})
		e.raiseTrackerPersistBlock(brokerName)
		return false
	}
	if !booked {
		e.logAuto("exit_fill_already_recorded", meta.CorrelationID, map[string]any{
			"symbol": symbol, "clientOrderId": clientOrderID, "broker": brokerName,
		})
		return true
	}
	if after.Status == "open" {
		e.logAuto("position_partially_exited", meta.CorrelationID, map[string]any{
			"symbol": symbol, "broker": brokerName, "remaining": after.ExecutedQty(),
		})
	}
	return true
}

// exitWithoutPosition handles an exit fill, full or partial, that found no
// open position to close.
func (e *Engine) exitWithoutPosition(symbol, clientOrderID, brokerName string, fillQty float64, corr string) {
	if fillQty > 0 && e.DB.RecordedFillQty(clientOrderID) >= fillQty-1e-9 {
		// This very fill is already in the journal, and the position it
		// closed is closed. A repeat of the broker answer is routine
		// (AUD-115) — not an alarm.
		e.logAuto("exit_fill_already_recorded", corr, map[string]any{
			"symbol": symbol, "clientOrderId": clientOrderID, "broker": brokerName,
		})
		return
	}
	// An exit fill with nothing to close used to return silently, so an
	// exit resolved before its own entry (the operator confirming two
	// trackers out of order) left the entry's position open forever with
	// not a word to anybody. Say it out loud instead — for a partial fill
	// too (AUD-132).
	e.logAuto("exit_fill_without_open_position", corr, map[string]any{
		"symbol": symbol, "clientOrderId": clientOrderID, "broker": brokerName,
	})
	_ = e.Send(e.chat(), fmt.Sprintf(
		"<b>%s: выход без открытой позиции</b>\n%s\nзаявка: %s\nв журнале нечего закрывать — проверьте позицию у брокера",
		brokerLabel(brokerName), symbol, clientOrderID))
}

// warnOnSlippage compares the executed price with the quote the decision was
// taken on. maxSlippageBps cannot gate the order itself — these are market
// orders and the fill must be certain — so the setting is a reporting
// threshold: it tells the operator when a fill landed further from the
// decision price than they consider normal.
func (e *Engine) warnOnSlippage(symbol, action, clientOrderID string, meta orderMeta, fillPrice float64, broker string) {
	bps := asFloat(e.AutoConfig()["maxSlippageBps"])
	if !(bps > 0) || !(fillPrice > 0) || !(meta.QuotePrice > 0) {
		return
	}
	dev := (fillPrice - meta.QuotePrice) / meta.QuotePrice
	devBps := math.Abs(dev) * 10000
	if devBps <= bps {
		return
	}
	e.logAuto("order_slippage_exceeded", meta.CorrelationID, map[string]any{
		"symbol": symbol, "action": action, "clientOrderId": clientOrderID,
		"quotePrice": meta.QuotePrice, "fillPrice": fillPrice,
		"slippageBps": devBps, "limitBps": bps, "broker": broker,
	})
	_ = e.Send(e.chat(), fmt.Sprintf(
		"<b>%s: проскальзывание %.0f bps</b>\n%s • %s\nрешение: $%.2f\nисполнено: $%.2f\nпорог: %.0f bps",
		brokerLabel(broker), devBps, symbol, action, meta.QuotePrice, fillPrice, bps))
}

func fillBrokerName(t map[string]any, meta orderMeta) string {
	name := strings.ToLower(strings.TrimSpace(meta.Broker))
	if name == "" && t != nil {
		name = strings.ToLower(strings.TrimSpace(fmt.Sprint(t["broker"])))
	}
	if name == "" || name == "<nil>" {
		return "webull"
	}
	return name
}

// reduceOpenQuantity books a partial exit fill against the open position.
//
// `filled` is the broker's total for this order, not a delta: the same answer
// arrives again after a restart, so the store decides how much of it the
// journal has not seen yet and writes that part in the same transaction as the
// claim (CORE-04, AUD-111). The sold part is closed as its own row rather than
// subtracted from the quantity, which used to erase its realised P&L (AUD-044).
func (e *Engine) reduceOpenQuantity(symbol, preferID, broker, dateKey string, filled, exitPrice float64, exitIBS *float64, corr string) bool {
	if !(filled > 0) {
		return true
	}
	p, err := e.openPositionFor(symbol, preferID, broker)
	if err != nil {
		e.logAuto("local_trade_close_failed", corr, map[string]any{
			"symbol": symbol, "clientOrderId": preferID,
			"op": "partial_exit", "error": err.Error(),
		})
		e.raiseTrackerPersistBlock(broker)
		return false
	}
	if p == nil {
		e.exitWithoutPosition(symbol, preferID, broker, filled, corr)
		return true
	}
	newly, err := e.DB.ClaimPartialExit(preferID, p.ID, broker, filled, store.PositionExit{
		Date: dateKey, Price: exitPrice, IBS: exitIBS,
	})
	if err != nil {
		e.logAuto("local_trade_close_failed", corr, map[string]any{
			"symbol": symbol, "clientOrderId": preferID,
			"op": "partial_exit_split", "error": err.Error(),
		})
		e.raiseTrackerPersistBlock(broker)
		return false
	}
	if !(newly > 0) {
		e.logAuto("order_fill_already_recorded", corr, map[string]any{
			"symbol": symbol, "clientOrderId": preferID, "filledQty": filled,
		})
	}
	return true
}

func (e *Engine) execJournalSQL(corr, broker, op, query string, args ...any) error {
	if e == nil || e.DB == nil || e.DB.SQL == nil {
		err := fmt.Errorf("journal unavailable")
		e.logJournalSQLError(corr, broker, op, err)
		return err
	}
	_, err := e.DB.SQL.Exec(query, args...)
	if err != nil {
		e.logJournalSQLError(corr, broker, op, err)
		return err
	}
	return nil
}

func (e *Engine) logJournalSQLError(corr, broker, op string, err error) {
	if e == nil || err == nil {
		return
	}
	e.logAuto("journal_update_failed", corr, map[string]any{
		"op": op, "broker": broker, "error": err.Error(),
	})
	e.raiseTrackerPersistBlock(broker)
}

func (e *Engine) raiseTrackerPersistBlock(broker string) {
	if e == nil {
		return
	}
	if broker == "" {
		broker = "webull"
	}
	e.mu.Lock()
	if e.trackerPersistFail == nil {
		e.trackerPersistFail = map[string]bool{}
	}
	e.trackerPersistFail[broker] = true
	e.mu.Unlock()
	_ = e.persistTrackerBlock(broker)
}

// deletePhantom removes the position of an order the broker says never existed.
//
// The row is shared now: its id is the client order id of whichever broker
// opened it, and the other broker's leg lives in the same row. Deleting it
// because one broker's order turned out to be a phantom would take a real
// execution with it, so a row another broker executed against is kept and its
// phantom leg cleared instead.
func (e *Engine) deletePhantom(clientOrderID, symbol, broker string) {
	if clientOrderID == "" || clientOrderID == "<nil>" {
		return
	}
	// A failed read leaves the phantom row in place; openPositionFor has
	// already logged it, so the operator sees why it survived.
	p, err := e.openPositionFor(symbol, clientOrderID, "")
	if err != nil || p == nil || p.ID != clientOrderID {
		return
	}
	// Whether the peer executed is decided by the delete itself, not by the
	// copy read a moment ago: the peer's entry lands from its own goroutine
	// (AUD-112).
	gone, err := e.DB.DeletePhantomRow(p.ID, broker)
	if err != nil {
		e.logAuto("journal_update_failed", "", map[string]any{
			"op": "delete_phantom", "id": p.ID, "broker": broker, "error": err.Error(),
		})
		return
	}
	if gone {
		return
	}
	// The peer executed against this row, so only the phantom leg goes.
	if _, err := e.DB.PatchPosition(p.ID, func(p *store.Position) error {
		p.SetLeg(broker, store.BrokerLeg{})
		p.Quantity = p.ExecutedQty()
		return nil
	}); err != nil {
		e.logAuto("journal_update_failed", "", map[string]any{
			"op": "clear_phantom_leg", "id": p.ID, "broker": broker, "error": err.Error(),
		})
	}
}

// normalizeBrokerName names the broker a fill belongs to, defaulting to Webull
// the way fillBrokerName does.
func normalizeBrokerName(b string) string {
	if strings.EqualFold(strings.TrimSpace(b), "robinhood") {
		return "robinhood"
	}
	return "webull"
}
