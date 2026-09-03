package live

import (
	"fmt"
	"strings"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

func (e *Engine) getTrade(table, id string) map[string]any {
	return e.DB.GetTrade(table, id)
}

func (e *Engine) openTradeBySymbol(table, symbol, preferID string) map[string]any {
	want := store.SafeTicker(symbol)
	if preferID != "" {
		for _, id := range []string{preferID, "m-" + preferID} {
			if table == "broker_trades" && strings.HasPrefix(id, "m-") {
				continue
			}
			t := e.getTrade(table, id)
			if t == nil {
				continue
			}
			if fmt.Sprint(t["status"]) == "open" && store.SafeTicker(fmt.Sprint(t["symbol"])) == want {
				return t
			}
		}
	}
	rows, _ := e.DB.ListTrades(table)
	var fallback map[string]any
	for _, t := range rows {
		if fmt.Sprint(t["status"]) != "open" {
			continue
		}
		if store.SafeTicker(fmt.Sprint(t["symbol"])) != want {
			continue
		}
		id := fmt.Sprint(t["id"])
		if preferID != "" && (id == preferID || id == "m-"+preferID) {
			return t
		}
		if table == "trades" {
			if full := e.DB.GetTrade("trades", id); full != nil {
				linked := fmt.Sprint(full["linkedBrokerTradeId"])
				if preferID != "" && linked == preferID {
					return full
				}
			}
		}
		if fallback == nil {
			fallback = t
		}
	}
	return fallback
}

func (e *Engine) closeTradeWithPnL(table, id string, exitPrice float64, exitDate string, exitIBS any, note string) {
	if id == "" || id == "<nil>" {
		return
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
	}
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

	fillPrice := fillPriceFrom(detail)
	// reportedQty is what the broker says actually executed. Keep it separate
	// from the fallbacks below: it is the only evidence of a partial fill.
	reportedQty := fillQtyFrom(detail)
	orderedQty := asFloat(t["quantity"])
	if !(orderedQty > 0) {
		orderedQty = meta.Quantity
	}
	fillQty := reportedQty
	if !(fillPrice > 0) {
		fillPrice = meta.QuotePrice
	}
	if !(fillQty > 0) {
		fillQty = orderedQty
	}
	exitIBS := any(nil)
	if meta.IBS > 0 || meta.IBS == 0 && meta.CorrelationID != "" {
		exitIBS = meta.IBS
	}

	e.logAuto("local_trade_recorded", meta.CorrelationID, map[string]any{
		"symbol": symbol, "action": action, "status": status,
		"clientOrderId": clientOrderID, "price": fillPrice, "quantity": fillQty,
		"source": source, "dateKey": dateKey,
	})

	// The executed quantity is the fact; the status string is only the broker's
	// vocabulary. Record the trade whenever shares actually changed hands, even
	// under a status word we do not recognise — otherwise a real position would
	// exist with nothing in the journal and the next cycle would buy again.
	if status != "filled" && !(reportedQty > 0) {
		e.deletePhantom(clientOrderID, symbol)
		return
	}
	partial := reportedQty > 0 && orderedQty > 0 && reportedQty < orderedQty-1e-9
	if partial {
		e.logAuto("order_partially_filled", meta.CorrelationID, map[string]any{
			"symbol": symbol, "action": action, "clientOrderId": clientOrderID,
			"status": status, "orderedQty": orderedQty, "filledQty": reportedQty,
		})
		_ = e.Send(e.chat(), fmt.Sprintf(
			"<b>Webull: частичное исполнение</b>\n%s • %s\nзаказано: %v\nисполнено: %v\nstatus: %s",
			symbol, action, orderedQty, reportedQty, status))
		if action == "exit" {
			e.reduceOpenQuantity(symbol, clientOrderID, reportedQty, fillPrice)
			return
		}
	} else if status != "filled" {
		e.logAuto("order_filled_under_unknown_status", meta.CorrelationID, map[string]any{
			"symbol": symbol, "action": action, "clientOrderId": clientOrderID,
			"status": status, "filledQty": reportedQty,
		})
	}

	if action == "entry" {
		if existing := e.getTrade("broker_trades", clientOrderID); existing != nil {
			return
		}
		if err := e.DB.InsertTrade("broker_trades", map[string]any{
			"id": clientOrderID, "symbol": symbol, "status": "open",
			"entryDate": dateKey, "entryPrice": fillPrice, "source": source, "quantity": fillQty,
		}); err != nil {
			e.logAuto("local_trade_record_failed", meta.CorrelationID, map[string]any{
				"table": "broker_trades", "error": err.Error(), "clientOrderId": clientOrderID,
			})
		}
		monID := "m-" + clientOrderID
		if e.DB.GetTrade("trades", monID) == nil {
			if err := e.DB.InsertTrade("trades", map[string]any{
				"id": monID, "symbol": symbol, "status": "open",
				"entryDate": dateKey, "entryPrice": fillPrice, "source": source, "quantity": fillQty,
			}); err != nil {
				e.logAuto("local_trade_record_failed", meta.CorrelationID, map[string]any{
					"table": "trades", "error": err.Error(), "clientOrderId": clientOrderID,
				})
			}
		}
		_, _ = e.DB.SQL.Exec(`UPDATE trades SET linked_broker_trade_id=?, client_order_id=?, filled_qty=?, entry_ibs=? WHERE id=?`,
			clientOrderID, clientOrderID, fillQty, meta.IBS, monID)
		_, _ = e.DB.SQL.Exec(`UPDATE broker_trades SET client_order_id=?, filled_qty=?, entry_ibs=? WHERE id=?`,
			clientOrderID, fillQty, meta.IBS, clientOrderID)
		return
	}

	if action == "exit" {
		broker := e.openTradeBySymbol("broker_trades", symbol, clientOrderID)
		if broker == nil {
			broker = e.openTradeBySymbol("broker_trades", symbol, "")
		}
		if broker != nil {
			e.closeTradeWithPnL("broker_trades", fmt.Sprint(broker["id"]), fillPrice, dateKey, exitIBS, "closed_from_broker_fill")
		}
		mon := e.openTradeBySymbol("trades", symbol, clientOrderID)
		if mon == nil {
			mon = e.openTradeBySymbol("trades", symbol, "")
		}
		if mon != nil && store.SafeTicker(fmt.Sprint(mon["symbol"])) == symbol {
			e.closeTradeWithPnL("trades", fmt.Sprint(mon["id"]), fillPrice, dateKey, exitIBS, "closed_from_broker_fill")
		}
	}
}

func (e *Engine) reduceOpenQuantity(symbol, preferID string, sold, exitPrice float64) {
	if !(sold > 0) {
		return
	}
	for _, table := range []string{"broker_trades", "trades"} {
		t := e.openTradeBySymbol(table, symbol, preferID)
		if t == nil {
			continue
		}
		cur := asFloat(t["quantity"])
		left := cur - sold
		if left <= 1e-9 {
			e.closeTradeWithPnL(table, fmt.Sprint(t["id"]), exitPrice, tradingdate.TodayNYSE(e.now()), nil, "partial_exit_flat")
			continue
		}
		_, _ = e.DB.SQL.Exec(`UPDATE `+table+` SET quantity=? WHERE id=?`, left, t["id"])
	}
}

func (e *Engine) deletePhantom(clientOrderID, symbol string) {
	if clientOrderID == "" || clientOrderID == "<nil>" {
		return
	}
	for _, table := range []string{"broker_trades", "trades"} {
		if t := e.getTrade(table, clientOrderID); t != nil && fmt.Sprint(t["status"]) == "open" {
			_ = e.DB.DeleteTrade(table, clientOrderID)
		}
		if t := e.getTrade(table, "m-"+clientOrderID); t != nil && fmt.Sprint(t["status"]) == "open" {
			_ = e.DB.DeleteTrade(table, "m-"+clientOrderID)
		}
	}
}
