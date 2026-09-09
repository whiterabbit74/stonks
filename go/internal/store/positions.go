package store

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"mktorder.com/go/internal/tradingdate"
)

// BrokerLeg is what one broker actually did with a position. Every field is
// execution fact: the quantity that changed hands and the prices it changed
// hands at, not the signal the decision was taken on. A leg with Qty == 0 means
// this broker did not execute the position at all — the journal row still
// exists, which is a normal state (a monitor-only signal), not a discrepancy.
type BrokerLeg struct {
	Qty          float64  `json:"qty"`
	EntryPrice   *float64 `json:"entryPrice"`
	ExitPrice    *float64 `json:"exitPrice"`
	EntryOrderID string   `json:"entryOrderId"`
	ExitOrderID  string   `json:"exitOrderId"`
}

// Executed reports whether this broker has anything of this position.
func (l BrokerLeg) Executed() bool { return l.Qty > 0 || l.EntryOrderID != "" }

// Position is one position, once. It carries the signal that opened and closed
// it (the journal) and, side by side, what each broker executed against that
// signal.
//
// This replaces the pair of `trades` + `broker_trades` rows the engine used to
// write for a single fill — one keyed by the client order id, the other by
// "m-"+that id, linked by linked_broker_trade_id and then re-checked against
// each other by a whole reconciliation subsystem. The same fact recorded twice
// can disagree; recorded once it cannot.
type Position struct {
	ID     string `json:"id"`
	Symbol string `json:"symbol"`
	Status string `json:"status"`

	// The signal. EntryPrice/ExitPrice here are the prices the decision was
	// taken on, which is not necessarily what the broker filled at — that
	// lives in the legs below.
	EntryDate         string   `json:"entryDate"`
	EntryPrice        *float64 `json:"entryPrice"`
	EntryIBS          *float64 `json:"entryIBS"`
	EntryDecisionTime string   `json:"entryDecisionTime"`
	ExitDate          string   `json:"exitDate"`
	ExitPrice         *float64 `json:"exitPrice"`
	ExitIBS           *float64 `json:"exitIBS"`
	ExitDecisionTime  string   `json:"exitDecisionTime"`

	Quantity    float64  `json:"quantity"`
	PnLPercent  *float64 `json:"pnlPercent"`
	PnLAbsolute *float64 `json:"pnlAbsolute"`
	HoldingDays *int64   `json:"holdingDays"`

	Source   string `json:"source"`
	Notes    string `json:"notes"`
	IsHidden bool   `json:"isHidden"`
	IsTest   bool   `json:"isTest"`

	Webull    BrokerLeg `json:"webull"`
	Robinhood BrokerLeg `json:"robinhood"`
}

// Leg returns the leg of the named broker. An unknown name gets an empty leg
// rather than a panic: broker names arrive from config and from stored rows.
func (p *Position) Leg(broker string) BrokerLeg {
	switch normalizeBroker(broker) {
	case "robinhood":
		return p.Robinhood
	default:
		return p.Webull
	}
}

// SetLeg writes the leg of the named broker.
func (p *Position) SetLeg(broker string, leg BrokerLeg) {
	switch normalizeBroker(broker) {
	case "robinhood":
		p.Robinhood = leg
	default:
		p.Webull = leg
	}
}

// ExecutedQty is how many shares are actually held across brokers. The journal
// Quantity is what the signal asked for; this is what the brokers did.
func (p *Position) ExecutedQty() float64 { return p.Webull.Qty + p.Robinhood.Qty }

func normalizeBroker(b string) string {
	switch strings.ToLower(strings.TrimSpace(b)) {
	case "robinhood", "rh":
		return "robinhood"
	default:
		return "webull"
	}
}

const positionColumns = `id, symbol, status,
	entry_date, entry_price, entry_ibs, entry_decision_time,
	exit_date, exit_price, exit_ibs, exit_decision_time,
	quantity, pnl_percent, pnl_absolute, holding_days,
	source, notes, is_hidden, is_test,
	webull_qty, webull_entry_price, webull_exit_price, webull_entry_order_id, webull_exit_order_id,
	rh_qty, rh_entry_price, rh_exit_price, rh_entry_order_id, rh_exit_order_id`

func (d *DB) scanPosition(s rowScanner) (Position, error) {
	var p Position
	var entryDate, exitDate, entryDecision, exitDecision, source, notes sql.NullString
	var wEntryID, wExitID, rEntryID, rExitID sql.NullString
	var entryP, exitP, entryI, exitI, pnlP, pnlA, qty sql.NullFloat64
	var wQty, wEntryP, wExitP, rQty, rEntryP, rExitP sql.NullFloat64
	var hold, hidden, test sql.NullInt64
	err := s.Scan(&p.ID, &p.Symbol, &p.Status,
		&entryDate, &entryP, &entryI, &entryDecision,
		&exitDate, &exitP, &exitI, &exitDecision,
		&qty, &pnlP, &pnlA, &hold,
		&source, &notes, &hidden, &test,
		&wQty, &wEntryP, &wExitP, &wEntryID, &wExitID,
		&rQty, &rEntryP, &rExitP, &rEntryID, &rExitID)
	if err != nil {
		return Position{}, err
	}
	p.EntryDate, p.ExitDate = entryDate.String, exitDate.String
	p.EntryDecisionTime, p.ExitDecisionTime = entryDecision.String, exitDecision.String
	p.EntryPrice, p.ExitPrice = floatPtr(entryP), floatPtr(exitP)
	p.EntryIBS, p.ExitIBS = floatPtr(entryI), floatPtr(exitI)
	p.PnLPercent, p.PnLAbsolute = floatPtr(pnlP), floatPtr(pnlA)
	p.Quantity = qty.Float64
	if hold.Valid {
		v := hold.Int64
		p.HoldingDays = &v
	}
	p.Source, p.Notes = source.String, notes.String
	p.IsHidden, p.IsTest = hidden.Int64 == 1, test.Int64 == 1
	p.Webull = BrokerLeg{Qty: wQty.Float64, EntryPrice: floatPtr(wEntryP), ExitPrice: floatPtr(wExitP),
		EntryOrderID: wEntryID.String, ExitOrderID: wExitID.String}
	p.Robinhood = BrokerLeg{Qty: rQty.Float64, EntryPrice: floatPtr(rEntryP), ExitPrice: floatPtr(rExitP),
		EntryOrderID: rEntryID.String, ExitOrderID: rExitID.String}
	return p, nil
}

func floatPtr(v sql.NullFloat64) *float64 {
	if !v.Valid {
		return nil
	}
	out := v.Float64
	return &out
}

// ListPositions returns every position, newest entry first.
func (d *DB) ListPositions() ([]Position, error) {
	rows, err := d.SQL.Query(`SELECT ` + positionColumns + ` FROM positions ORDER BY entry_date DESC, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Position{}
	for rows.Next() {
		p, err := d.scanPosition(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// GetPosition returns one position, or nil when there is no such id.
func (d *DB) GetPosition(id string) (*Position, error) {
	p, err := d.scanPosition(d.SQL.QueryRow(`SELECT `+positionColumns+` FROM positions WHERE id=?`, id))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// OpenPositionBySymbol returns the open position in a ticker, or nil. There can
// be at most one: the strategy holds a position until it is fully closed.
func (d *DB) OpenPositionBySymbol(symbol string) (*Position, error) {
	p, err := d.scanPosition(d.SQL.QueryRow(`SELECT `+positionColumns+
		` FROM positions WHERE symbol=? AND status='open' ORDER BY entry_date DESC, id LIMIT 1`, SafeTicker(symbol)))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// OpenPositions returns every open position, newest first.
func (d *DB) OpenPositions() ([]Position, error) {
	rows, err := d.SQL.Query(`SELECT ` + positionColumns + ` FROM positions WHERE status='open' ORDER BY entry_date DESC, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Position{}
	for rows.Next() {
		p, err := d.scanPosition(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// SavePosition inserts or replaces a position by id.
func (d *DB) SavePosition(p Position) error {
	if strings.TrimSpace(p.ID) == "" {
		p.ID = fmt.Sprintf("p-%d", time.Now().UnixNano())
	}
	p.Symbol = SafeTicker(p.Symbol)
	if p.Status == "" {
		p.Status = "open"
	}
	_, err := d.SQL.Exec(`INSERT INTO positions (`+positionColumns+`)
		VALUES (?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
			symbol=excluded.symbol, status=excluded.status,
			entry_date=excluded.entry_date, entry_price=excluded.entry_price,
			entry_ibs=excluded.entry_ibs, entry_decision_time=excluded.entry_decision_time,
			exit_date=excluded.exit_date, exit_price=excluded.exit_price,
			exit_ibs=excluded.exit_ibs, exit_decision_time=excluded.exit_decision_time,
			quantity=excluded.quantity, pnl_percent=excluded.pnl_percent,
			pnl_absolute=excluded.pnl_absolute, holding_days=excluded.holding_days,
			source=excluded.source, notes=excluded.notes,
			is_hidden=excluded.is_hidden, is_test=excluded.is_test,
			webull_qty=excluded.webull_qty, webull_entry_price=excluded.webull_entry_price,
			webull_exit_price=excluded.webull_exit_price,
			webull_entry_order_id=excluded.webull_entry_order_id,
			webull_exit_order_id=excluded.webull_exit_order_id,
			rh_qty=excluded.rh_qty, rh_entry_price=excluded.rh_entry_price,
			rh_exit_price=excluded.rh_exit_price,
			rh_entry_order_id=excluded.rh_entry_order_id,
			rh_exit_order_id=excluded.rh_exit_order_id`,
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

// DeletePosition removes a position permanently.
func (d *DB) DeletePosition(id string) error {
	_, err := d.SQL.Exec(`DELETE FROM positions WHERE id=?`, id)
	return err
}

func nullText(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// PositionExit is the exit of a position: the signal side of it. Price is the
// price the exit decision was taken on; a broker's actual fill goes into its
// leg through CloseLeg.
type PositionExit struct {
	Date         string
	Price        float64
	IBS          *float64
	DecisionTime string
	Notes        string
}

// ClosePosition writes the exit into the journal and computes P&L the same way
// the two-table journal did: pnl_absolute is money (per-share difference times
// quantity), pnl_percent is percent, holding days is at least one.
//
// It refuses to close a position that is already closed, so a fill delivered
// twice (a poll after a restart) cannot overwrite a recorded exit — the check
// and the write are one transaction.
func (d *DB) ClosePosition(id string, exit PositionExit) (*Position, error) {
	tx, err := d.SQL.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	p, err := d.scanPosition(tx.QueryRow(`SELECT `+positionColumns+` FROM positions WHERE id=?`, id))
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("позиция не найдена")
	}
	if err != nil {
		return nil, err
	}
	if p.Status != "open" {
		return nil, fmt.Errorf("позиция уже закрыта")
	}

	p.Status = "closed"
	p.ExitDate = exit.Date
	price := exit.Price
	p.ExitPrice = &price
	if exit.IBS != nil {
		p.ExitIBS = exit.IBS
	}
	if exit.DecisionTime != "" {
		p.ExitDecisionTime = exit.DecisionTime
	}
	if exit.Notes != "" {
		p.Notes = exit.Notes
	}
	p.applyPnL()

	if _, err := tx.Exec(`UPDATE positions SET status=?, exit_date=?, exit_price=?, exit_ibs=?,
		exit_decision_time=?, pnl_percent=?, pnl_absolute=?, holding_days=?, notes=?
		WHERE id=? AND status='open'`,
		p.Status, nullText(p.ExitDate), p.ExitPrice, p.ExitIBS, nullText(p.ExitDecisionTime),
		p.PnLPercent, p.PnLAbsolute, p.HoldingDays, nullText(p.Notes), id); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &p, nil
}

// applyPnL recomputes the journal P&L from the entry and exit prices. An entry
// price that was never confirmed leaves P&L NULL rather than claiming a profit
// measured from zero.
func (p *Position) applyPnL() {
	if p.EntryPrice != nil && *p.EntryPrice > 0 && p.ExitPrice != nil {
		qty := p.Quantity
		if !(qty > 0) {
			qty = 1
		}
		diff := *p.ExitPrice - *p.EntryPrice
		abs := round6(diff * qty)
		pct := round6((diff / *p.EntryPrice) * 100)
		p.PnLAbsolute, p.PnLPercent = &abs, &pct
	}
	if p.EntryDate != "" && p.ExitDate != "" {
		n := int64(tradingdate.DaysBetween(p.EntryDate, p.ExitDate))
		if n < 1 {
			n = 1
		}
		p.HoldingDays = &n
	}
}

// CloseLeg records what one broker actually got for its exit. It is separate
// from ClosePosition because the two answer different questions: the journal
// closes on the signal, a leg closes on a fill, and a position can be closed by
// signal with no broker leg at all.
func (d *DB) CloseLeg(id, broker string, exitPrice float64, exitOrderID string) error {
	col := "webull"
	if normalizeBroker(broker) == "robinhood" {
		col = "rh"
	}
	_, err := d.SQL.Exec(`UPDATE positions SET `+col+`_exit_price=?, `+col+`_exit_order_id=? WHERE id=?`,
		exitPrice, nullText(exitOrderID), id)
	return err
}

// OpenPositionForBroker returns the open position this broker actually holds,
// or nil. A position open in the journal with no leg at this broker is not this
// broker's to exit — and is not a discrepancy either, just a signal nobody
// executed here.
func (d *DB) OpenPositionForBroker(broker string) (*Position, error) {
	col := "webull"
	if normalizeBroker(broker) == "robinhood" {
		col = "rh"
	}
	p, err := d.scanPosition(d.SQL.QueryRow(`SELECT ` + positionColumns +
		` FROM positions WHERE status='open' AND is_hidden=0 AND ` + col + `_qty > 0` +
		` ORDER BY entry_date DESC, id LIMIT 1`))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}
