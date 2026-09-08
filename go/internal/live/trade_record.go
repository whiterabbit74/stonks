package live

import (
	"fmt"
	"math"
	"strings"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

// getTrade returns the row, or nil with an error. Callers that write on the
// basis of "there is no such trade" must tell the two apart: a failed read is
// not an absent trade.
func (e *Engine) getTrade(table, id string) (map[string]any, error) {
	row, err := e.DB.GetTrade(table, id)
	if err != nil {
		e.logAuto("journal_read_failed", "", map[string]any{"table": table, "op": "get_trade", "id": id, "error": err.Error()})
		return nil, err
	}
	return row, nil
}

func (e *Engine) openTradeBySymbol(table, symbol, preferID, broker string) (map[string]any, error) {
	want := store.SafeTicker(symbol)
	wantBroker := strings.ToLower(strings.TrimSpace(broker))
	sameBroker := func(got string) bool {
		got = strings.ToLower(strings.TrimSpace(got))
		if got == "<nil>" {
			got = ""
		}
		return got == wantBroker || (wantBroker == "webull" && got == "")
	}
	// A broker_trades row carries its broker itself. A monitor row does not:
	// it belongs to the broker of the trade it links to. Without that hop two
	// brokers holding the same ticker — the normal case, both pick the lowest
	// IBS — made one broker's exit close the other's monitor row, swapping the
	// recorded exit price and PnL between them (AUD-068).
	matchesBroker := func(t map[string]any) (bool, error) {
		if wantBroker == "" {
			return true, nil
		}
		if table == "broker_trades" {
			return sameBroker(fmt.Sprint(t["broker"])), nil
		}
		linked := strings.TrimSpace(fmt.Sprint(t["linkedBrokerTradeId"]))
		if linked == "" || linked == "<nil>" {
			return true, nil
		}
		b, err := e.getTrade("broker_trades", linked)
		if err != nil {
			return false, err
		}
		if b == nil {
			return true, nil
		}
		return sameBroker(fmt.Sprint(b["broker"])), nil
	}
	if preferID != "" {
		for _, id := range []string{preferID, "m-" + preferID} {
			if table == "broker_trades" && strings.HasPrefix(id, "m-") {
				continue
			}
			t, err := e.getTrade(table, id)
			if err != nil {
				return nil, err
			}
			if t == nil {
				continue
			}
			if fmt.Sprint(t["status"]) != "open" || store.SafeTicker(fmt.Sprint(t["symbol"])) != want {
				continue
			}
			ok, err := matchesBroker(t)
			if err != nil {
				return nil, err
			}
			if ok {
				return t, nil
			}
		}
	}
	rows, err := e.DB.ListTrades(table)
	if err != nil {
		e.logAuto("journal_read_failed", "", map[string]any{"table": table, "op": "open_trade_by_symbol", "symbol": symbol, "error": err.Error()})
		return nil, err
	}
	var fallback map[string]any
	for _, t := range rows {
		if fmt.Sprint(t["status"]) != "open" {
			continue
		}
		if store.SafeTicker(fmt.Sprint(t["symbol"])) != want {
			continue
		}
		id := fmt.Sprint(t["id"])
		// ListTrades does not select linked_broker_trade_id, and both the
		// broker match and the linked-id match below need it.
		if table == "trades" {
			full, err := e.getTrade("trades", id)
			if err != nil {
				return nil, err
			}
			if full != nil {
				t = full
			}
		}
		ok, err := matchesBroker(t)
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		if preferID != "" && (id == preferID || id == "m-"+preferID) {
			return t, nil
		}
		if preferID != "" && fmt.Sprint(t["linkedBrokerTradeId"]) == preferID {
			return t, nil
		}
		if fallback == nil {
			fallback = t
		}
	}
	return fallback, nil
}

// closeTradeWithPnL writes the exit into the journal. The error is returned,
// not only logged: a fill the journal did not record leaves the position open
// there forever, and the caller decides how loud that has to be — see AUD-035.
func (e *Engine) closeTradeWithPnL(table, id string, exitPrice float64, exitDate string, exitIBS any, note string) error {
	if id == "" || id == "<nil>" {
		return nil
	}
	extra := map[string]any{}
	if note != "" {
		extra["notes"] = note
	}
	if exitIBS != nil {
		extra["exitIBS"] = exitIBS
	}
	if _, err := e.DB.CloseTradeByID(table, id, exitPrice, exitDate, extra); err != nil {
		e.logAuto("local_trade_close_failed", "", map[string]any{"table": table, "id": id, "error": err.Error()})
		return err
	}
	return nil
}

func (e *Engine) recordFill(t map[string]any, detail map[string]any, status string) {
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
	exitIBS := any(nil)
	if meta.IBS > 0 || meta.IBS == 0 && meta.CorrelationID != "" {
		exitIBS = meta.IBS
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
			e.deletePhantom(clientOrderID, symbol)
		}
		return
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
			e.reduceOpenQuantity(symbol, clientOrderID, brokerName, reportedQty, fillPrice)
			return
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
		existing, err := e.getTrade("broker_trades", clientOrderID)
		if err != nil {
			// The fill is real; we just cannot see whether it is journaled.
			// Inserting blind would either duplicate the row or raise a false
			// persistence failure, so block the tracker for an operator.
			e.logAuto("local_trade_record_failed", meta.CorrelationID, map[string]any{
				"table": "broker_trades", "error": err.Error(), "clientOrderId": clientOrderID,
			})
			e.raiseTrackerPersistBlock(brokerName)
			return
		}
		if existing != nil {
			if fillQty > asFloat(existing["quantity"]) {
				_ = e.execJournalSQL(meta.CorrelationID, brokerName, "upsert_broker_qty",
					`UPDATE broker_trades SET quantity=?, filled_qty=? WHERE id=?`, fillQty, fillQty, clientOrderID)
				_ = e.execJournalSQL(meta.CorrelationID, brokerName, "upsert_monitor_qty",
					`UPDATE trades SET quantity=?, filled_qty=? WHERE id=?`, fillQty, fillQty, "m-"+clientOrderID)
			}
			return
		}
		entryRec := map[string]any{
			"id": clientOrderID, "symbol": symbol, "status": "open",
			"entryDate": dateKey, "source": source, "quantity": fillQty,
			"broker": brokerName,
		}
		if unconfirmedPrice {
			// 0 is not a fill. Leave entry_price NULL and mark the row so the
			// journal/UI can badge it until an operator types a real price.
			entryRec["notes"] = "fill_price_unconfirmed"
		} else {
			entryRec["entryPrice"] = fillPrice
		}
		if err := e.insertJournalRow("broker_trades", clientOrderID, entryRec); err != nil {
			e.logAuto("local_trade_record_failed", meta.CorrelationID, map[string]any{
				"table": "broker_trades", "error": err.Error(), "clientOrderId": clientOrderID,
			})
			e.raiseTrackerPersistBlock(brokerName)
		}
		monID := "m-" + clientOrderID
		mon, err := e.getTrade("trades", monID)
		if err != nil {
			e.logAuto("local_trade_record_failed", meta.CorrelationID, map[string]any{
				"table": "trades", "error": err.Error(), "clientOrderId": clientOrderID,
			})
			e.raiseTrackerPersistBlock(brokerName)
			return
		}
		if mon == nil {
			monRec := map[string]any{
				"id": monID, "symbol": symbol, "status": "open",
				"entryDate": dateKey, "source": source, "quantity": fillQty,
			}
			if unconfirmedPrice {
				monRec["notes"] = "fill_price_unconfirmed"
			} else {
				monRec["entryPrice"] = fillPrice
			}
			if err := e.insertJournalRow("trades", monID, monRec); err != nil {
				e.logAuto("local_trade_record_failed", meta.CorrelationID, map[string]any{
					"table": "trades", "error": err.Error(), "clientOrderId": clientOrderID,
				})
				e.raiseTrackerPersistBlock(brokerName)
			}
		}
		_ = e.execJournalSQL(meta.CorrelationID, brokerName, "link_monitor_fill",
			`UPDATE trades SET linked_broker_trade_id=?, client_order_id=?, filled_qty=?, entry_ibs=? WHERE id=?`,
			clientOrderID, clientOrderID, fillQty, meta.IBS, monID)
		_ = e.execJournalSQL(meta.CorrelationID, brokerName, "link_broker_fill",
			`UPDATE broker_trades SET client_order_id=?, filled_qty=?, entry_ibs=? WHERE id=?`,
			clientOrderID, fillQty, meta.IBS, clientOrderID)
		return
	}

	if action == "exit" {
		// A read failure here would leave the exit fill unjournaled and the
		// position looking open forever, without a single word to the
		// operator. Stop and raise the block instead.
		row, err := e.openTradeBySymbol("broker_trades", symbol, clientOrderID, brokerName)
		if err == nil && row == nil {
			row, err = e.openTradeBySymbol("broker_trades", symbol, "", brokerName)
		}
		var mon map[string]any
		if err == nil {
			// The monitor row is keyed off the entry order, not this exit
			// order: prefer the broker row we just found (its id is the entry
			// clientOrderId, the monitor row is "m-"+that).
			monPrefer := clientOrderID
			if row != nil {
				monPrefer = fmt.Sprint(row["id"])
			}
			mon, err = e.openTradeBySymbol("trades", symbol, monPrefer, brokerName)
			if err == nil && mon == nil {
				mon, err = e.openTradeBySymbol("trades", symbol, "", brokerName)
			}
		}
		if err != nil {
			e.logAuto("local_trade_close_failed", meta.CorrelationID, map[string]any{
				"symbol": symbol, "clientOrderId": clientOrderID, "error": err.Error(),
			})
			e.raiseTrackerPersistBlock(brokerName)
			return
		}
		var cerr error
		if mon != nil && store.SafeTicker(fmt.Sprint(mon["symbol"])) == symbol {
			if row != nil {
				cerr = e.DB.CloseTradePair(fmt.Sprint(mon["id"]), fmt.Sprint(row["id"]), fillPrice, dateKey, map[string]any{"exitIBS": exitIBS, "notes": "closed_from_broker_fill"})
				if cerr != nil {
					e.logAuto("local_trade_pair_close_failed", meta.CorrelationID, map[string]any{"error": cerr.Error(), "monitorId": mon["id"], "brokerId": row["id"]})
				}
			} else {
				cerr = e.closeTradeWithPnL("trades", fmt.Sprint(mon["id"]), fillPrice, dateKey, exitIBS, "closed_from_broker_fill")
			}
		} else if row != nil {
			cerr = e.closeTradeWithPnL("broker_trades", fmt.Sprint(row["id"]), fillPrice, dateKey, exitIBS, "closed_from_broker_fill")
		}
		// The write is the last step of the same path whose read failure
		// already raises the block: an unrecorded exit fill leaves the journal
		// showing an open position the broker no longer has.
		if cerr != nil {
			e.raiseTrackerPersistBlock(brokerName)
		}
	}
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

func (e *Engine) reduceOpenQuantity(symbol, preferID, broker string, sold, exitPrice float64) {
	if !(sold > 0) {
		return
	}
	for _, table := range []string{"broker_trades", "trades"} {
		t, err := e.openTradeBySymbol(table, symbol, preferID, broker)
		if err != nil {
			e.logAuto("local_trade_close_failed", "", map[string]any{
				"table": table, "symbol": symbol, "clientOrderId": preferID,
				"op": "partial_exit", "error": err.Error(),
			})
			e.raiseTrackerPersistBlock(broker)
			return
		}
		if t == nil {
			continue
		}
		cur := asFloat(t["quantity"])
		left := cur - sold
		if left <= 1e-9 {
			if err := e.closeTradeWithPnL(table, fmt.Sprint(t["id"]), exitPrice, tradingdate.TodayNYSE(e.now()), nil, "partial_exit_flat"); err != nil {
				e.raiseTrackerPersistBlock(broker)
			}
			continue
		}
		// Проданную часть надо закрыть отдельной сделкой: одно лишь
		// уменьшение quantity стирало реализованный PnL по этим акциям из
		// журнала навсегда (AUD-044).
		if err := e.DB.SplitCloseTrade(table, fmt.Sprint(t["id"]), sold, exitPrice,
			tradingdate.TodayNYSE(e.now()), map[string]any{"notes": "partial_exit"}); err != nil {
			e.logAuto("local_trade_close_failed", "", map[string]any{
				"table": table, "symbol": symbol, "clientOrderId": preferID,
				"op": "partial_exit_split", "error": err.Error(),
			})
			e.raiseTrackerPersistBlock(broker)
			return
		}
	}
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

// insertJournalRow writes the fill row, treating "it is already there" as
// success. recordFill can legitimately run twice for one order — a manual
// ResolveTracker alongside the automatic poll, or a poll after a restart —
// and the id is the client order id, so the second insert collides on the
// primary key. Reporting that as a persistence failure would raise the
// tracker-persist block and stop the broker's entries until an operator
// clears it, for an order that is in fact journaled exactly once.
func (e *Engine) insertJournalRow(table, id string, rec map[string]any) error {
	err := e.DB.InsertTrade(table, rec)
	if err != nil {
		if row, gerr := e.getTrade(table, id); gerr == nil && row != nil {
			return nil
		}
	}
	return err
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

func (e *Engine) deletePhantom(clientOrderID, symbol string) {
	if clientOrderID == "" || clientOrderID == "<nil>" {
		return
	}
	for _, table := range []string{"broker_trades", "trades"} {
		for _, id := range []string{clientOrderID, "m-" + clientOrderID} {
			// A failed read leaves the phantom row in place; getTrade has
			// already logged it, so the operator sees why it survived.
			if t, err := e.getTrade(table, id); err == nil && t != nil && fmt.Sprint(t["status"]) == "open" {
				_ = e.DB.DeleteTrade(table, id)
			}
		}
	}
}
