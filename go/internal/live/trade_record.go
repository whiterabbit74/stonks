package live

import (
	"fmt"
	"strings"

	"mktorder.com/go/internal/store"
	"mktorder.com/go/internal/tradingdate"
)

func tradePnl(entryPrice, exitPrice float64) (pnlAbs, pnlPct any) {
	if !(entryPrice > 0) {
		return nil, nil
	}
	diff := exitPrice - entryPrice
	pnlAbs = float64(int(diff*1e6+0.5)) / 1e6
	pnlPct = float64(int((diff/entryPrice)*100*1e6+0.5)) / 1e6
	return pnlAbs, pnlPct
}

func holdingDays(entryDate, exitDate string) int {
	if entryDate == "" || entryDate == "<nil>" || exitDate == "" || exitDate == "<nil>" {
		return 0
	}
	n := tradingdate.DaysBetween(entryDate, exitDate)
	if n < 1 {
		n = 1
	}
	return n
}

// getTrade avoids store.GetTrade on broker_trades (that query selects linked_broker_trade_id, which the table lacks).
func (e *Engine) getTrade(table, id string) map[string]any {
	if table == "trades" {
		return e.DB.GetTrade("trades", id)
	}
	rows, _ := e.DB.ListTrades(table)
	for _, t := range rows {
		if fmt.Sprint(t["id"]) == id {
			return t
		}
	}
	return nil
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
	existing := e.getTrade(table, id)
	if existing == nil {
		return
	}
	entryPrice := asFloat(existing["entryPrice"])
	pnlAbs, pnlPct := tradePnl(entryPrice, exitPrice)
	hold := holdingDays(fmt.Sprint(existing["entryDate"]), exitDate)
	prevNote := fmt.Sprint(existing["notes"])
	if prevNote == "<nil>" {
		prevNote = ""
	}
	if note != "" {
		if prevNote != "" {
			note = prevNote + "\n" + note
		}
	} else {
		note = prevNote
	}
	_ = e.DB.PatchTrade(table, id, map[string]any{
		"status": "closed", "exitDate": exitDate, "exitPrice": exitPrice, "notes": note,
	})
	if table != "trades" && table != "broker_trades" {
		return
	}
	_, _ = e.DB.SQL.Exec(`UPDATE `+table+` SET exit_ibs=?, pnl_absolute=?, pnl_percent=?, holding_days=? WHERE id=?`,
		exitIBS, pnlAbs, pnlPct, hold, id)
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
	fillQty := fillQtyFrom(detail)
	if !(fillPrice > 0) {
		fillPrice = meta.QuotePrice
	}
	if !(fillQty > 0) {
		fillQty = asFloat(t["quantity"])
		if !(fillQty > 0) {
			fillQty = meta.Quantity
		}
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

	if status != "filled" {
		e.deletePhantom(clientOrderID, symbol)
		return
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
