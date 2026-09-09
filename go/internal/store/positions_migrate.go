package store

import (
	"database/sql"
	"strings"
)

// mergeLegacyJournals folds the old `trades` + `broker_trades` pair into one
// `positions` row per position.
//
// The engine used to write both for a single fill: the broker row keyed by the
// client order id, the monitor row keyed by "m-"+that id, joined through
// linked_broker_trade_id. Everything after that — the pairing by link, then by
// ticker, then the leftovers reported as a discrepancy — existed only because
// one fact lived in two rows that could drift apart. On the production database
// they had drifted: 35 monitor rows against 9 broker rows, with one Webull row
// spanning two separate monitor trades.
//
// Matching order, most reliable first:
//
//  1. trades.linked_broker_trade_id names the broker row;
//  2. the "m-" prefix convention (monitor id == "m-" + broker id);
//  3. same ticker and same entry date.
//
// A broker row that matches nothing becomes a position of its own: it is a real
// execution and must not be dropped. The legacy tables are left in place and
// simply stop being written — an unreadable merge should be recoverable by
// hand, not by restoring a backup.
func mergeLegacyJournals(e schemaExecer) error {
	if !hasColumn(e, "trades", "id") {
		return nil
	}
	monitors, err := legacyRows(e, "trades")
	if err != nil {
		return err
	}
	brokers, err := legacyRows(e, "broker_trades")
	if err != nil {
		return err
	}

	byID := map[string]legacyRow{}
	for _, b := range brokers {
		byID[b.id] = b
	}
	used := map[string]bool{}

	claim := func(m legacyRow) (legacyRow, bool) {
		if id := strings.TrimSpace(m.linked); id != "" {
			if b, ok := byID[id]; ok && !used[id] {
				return b, true
			}
		}
		if id := strings.TrimPrefix(m.id, "m-"); id != m.id {
			if b, ok := byID[id]; ok && !used[id] {
				return b, true
			}
		}
		for _, b := range brokers {
			if used[b.id] || b.symbol != m.symbol || b.entryDate != m.entryDate {
				continue
			}
			return b, true
		}
		return legacyRow{}, false
	}

	for _, m := range monitors {
		p := m.position()
		if b, ok := claim(m); ok {
			used[b.id] = true
			p.SetLeg(b.broker, b.leg())
			// The broker row is the only place a fill price was ever recorded
			// for legacy rows that never got one on the monitor side.
			if p.EntryPrice == nil {
				p.EntryPrice = b.entryPrice
			}
			if p.ExitPrice == nil {
				p.ExitPrice = b.exitPrice
			}
		}
		if err := insertMerged(e, p); err != nil {
			return err
		}
	}
	for _, b := range brokers {
		if used[b.id] {
			continue
		}
		p := b.position()
		p.SetLeg(b.broker, b.leg())
		if err := insertMerged(e, p); err != nil {
			return err
		}
	}
	return nil
}

type legacyRow struct {
	id, symbol, status          string
	entryDate, exitDate         string
	entryDecision, exitDecision string
	entryPrice, exitPrice       *float64
	entryIBS, exitIBS           *float64
	pnlPct, pnlAbs              *float64
	holdingDays                 *int64
	quantity                    float64
	source, notes, broker       string
	linked                      string
	hidden, test                bool
}

func (r legacyRow) position() Position {
	return Position{
		ID: r.id, Symbol: r.symbol, Status: r.status,
		EntryDate: r.entryDate, EntryPrice: r.entryPrice, EntryIBS: r.entryIBS,
		EntryDecisionTime: r.entryDecision,
		ExitDate:          r.exitDate, ExitPrice: r.exitPrice, ExitIBS: r.exitIBS,
		ExitDecisionTime: r.exitDecision,
		Quantity:         r.quantity, PnLPercent: r.pnlPct, PnLAbsolute: r.pnlAbs,
		HoldingDays: r.holdingDays,
		Source:      r.source, Notes: r.notes, IsHidden: r.hidden, IsTest: r.test,
	}
}

func (r legacyRow) leg() BrokerLeg {
	return BrokerLeg{
		Qty: r.quantity, EntryPrice: r.entryPrice, ExitPrice: r.exitPrice,
		EntryOrderID: r.id,
	}
}

func legacyRows(e schemaExecer, table string) ([]legacyRow, error) {
	linked := "''"
	broker := "''"
	if table == "trades" {
		linked = "COALESCE(linked_broker_trade_id, '')"
	} else {
		broker = "COALESCE(broker, 'webull')"
	}
	rows, err := e.Query(`SELECT id, symbol, status, entry_date, exit_date,
		entry_decision_time, exit_decision_time, entry_price, exit_price,
		entry_ibs, exit_ibs, pnl_percent, pnl_absolute, holding_days, quantity,
		COALESCE(source,''), COALESCE(notes,''), is_hidden, is_test, ` + linked + `, ` + broker +
		` FROM ` + table + ` ORDER BY entry_date, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []legacyRow
	for rows.Next() {
		var r legacyRow
		var entryDate, exitDate, entryDec, exitDec sql.NullString
		var entryP, exitP, entryI, exitI, pnlP, pnlA, qty sql.NullFloat64
		var hold sql.NullInt64
		var hidden, test sql.NullInt64
		if err := rows.Scan(&r.id, &r.symbol, &r.status, &entryDate, &exitDate,
			&entryDec, &exitDec, &entryP, &exitP, &entryI, &exitI,
			&pnlP, &pnlA, &hold, &qty, &r.source, &r.notes, &hidden, &test,
			&r.linked, &r.broker); err != nil {
			return nil, err
		}
		r.symbol = SafeTicker(r.symbol)
		r.entryDate, r.exitDate = entryDate.String, exitDate.String
		r.entryDecision, r.exitDecision = entryDec.String, exitDec.String
		r.entryPrice, r.exitPrice = floatPtr(entryP), floatPtr(exitP)
		r.entryIBS, r.exitIBS = floatPtr(entryI), floatPtr(exitI)
		r.pnlPct, r.pnlAbs = floatPtr(pnlP), floatPtr(pnlA)
		r.quantity = qty.Float64
		if hold.Valid {
			v := hold.Int64
			r.holdingDays = &v
		}
		r.hidden, r.test = hidden.Int64 == 1, test.Int64 == 1
		out = append(out, r)
	}
	return out, rows.Err()
}

// insertMerged writes a merged row through the same column list SavePosition
// uses, but on the migration's own executor (inside the schema transaction).
func insertMerged(e schemaExecer, p Position) error {
	_, err := e.Exec(`INSERT OR REPLACE INTO positions (`+positionColumns+`)
		VALUES (?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?,?,?,?)`,
		p.ID, p.Symbol, p.Status,
		nullText(p.EntryDate), p.EntryPrice, p.EntryIBS, nullText(p.EntryDecisionTime),
		nullText(p.ExitDate), p.ExitPrice, p.ExitIBS, nullText(p.ExitDecisionTime),
		p.Quantity, p.PnLPercent, p.PnLAbsolute, p.HoldingDays,
		nullText(p.Source), nullText(p.Notes), boolInt(p.IsHidden), boolInt(p.IsTest),
		p.Webull.Qty, p.Webull.EntryPrice, p.Webull.ExitPrice,
		nullText(p.Webull.EntryOrderID), nullText(p.Webull.ExitOrderID),
		p.Robinhood.Qty, p.Robinhood.EntryPrice, p.Robinhood.ExitPrice,
		nullText(p.Robinhood.EntryOrderID), nullText(p.Robinhood.ExitOrderID))
	return err
}
