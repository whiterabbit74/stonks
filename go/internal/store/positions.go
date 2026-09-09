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

// Executed reports whether this broker ever took part in this position, filled
// or already sold out of it.
func (l BrokerLeg) Executed() bool { return l.Qty > 0 || l.EntryOrderID != "" }

// Holds reports whether this broker still has shares of it. A leg that has been
// sold keeps its order ids for the record but holds nothing, and a broker that
// holds nothing has neither an exit to send nor a reason to wait.
func (l BrokerLeg) Holds() bool { return l.Qty > 0 }

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

// ExecutedQty is how many shares the brokers still hold between them. Quantity
// is the size of the position as it was opened and stays there for the P&L;
// this drops to zero as the legs are sold out.
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
	// The P&L is derived from the prices, so a hand-edited price recomputes it
	// instead of leaving the old number beside the new prices.
	p.applyPnL()
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
	// A fill nobody could price closes the position at an unknown price, not at
	// zero: zero is a 100% loss the journal never observed (AUD-040).
	if exit.Price > 0 {
		price := exit.Price
		p.ExitPrice = &price
	} else {
		p.ExitPrice = nil
	}
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
	if p.EntryPrice != nil && *p.EntryPrice > 0 && p.ExitPrice != nil && *p.ExitPrice > 0 {
		qty := p.Quantity
		if !(qty > 0) {
			qty = 1
		}
		diff := *p.ExitPrice - *p.EntryPrice
		abs := round6(diff * qty)
		pct := round6((diff / *p.EntryPrice) * 100)
		p.PnLAbsolute, p.PnLPercent = &abs, &pct
	} else {
		// The P&L is derived from the prices, so it dies with them: clearing a
		// price by hand used to leave the old profit standing next to no price
		// at all (AUD-113).
		p.PnLAbsolute, p.PnLPercent = nil, nil
	}
	if p.EntryDate != "" && p.ExitDate != "" {
		n := int64(tradingdate.DaysBetween(p.EntryDate, p.ExitDate))
		if n < 1 {
			n = 1
		}
		p.HoldingDays = &n
	} else {
		p.HoldingDays = nil
	}
}

// ExitLeg zeroes one broker's leg and records what it got, in one statement,
// then reports the position as it now stands.
//
// One statement on purpose. Both brokers exit in parallel and each used to
// read the row, zero its own leg in memory and write the whole row back: the
// second write was built on a copy taken before the first, so it restored the
// peer's leg and the position never went flat. A read-modify-write of a shared
// row is a lost update waiting for the two brokers to overlap.
func (d *DB) ExitLeg(id, broker string, exitPrice float64, exitOrderID string) (*Position, error) {
	col := "webull"
	if normalizeBroker(broker) == "robinhood" {
		col = "rh"
	}
	tx, err := d.SQL.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var price any
	if exitPrice > 0 {
		price = exitPrice
	}
	if _, err := tx.Exec(`UPDATE positions
		SET `+col+`_qty=0, `+col+`_exit_price=COALESCE(?, `+col+`_exit_price), `+col+`_exit_order_id=?
		WHERE id=? AND status='open'`, price, nullText(exitOrderID), id); err != nil {
		return nil, err
	}
	p, err := d.scanPosition(tx.QueryRow(`SELECT `+positionColumns+` FROM positions WHERE id=?`, id))
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("позиция не найдена")
	}
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &p, nil
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

// SplitPosition closes `sold` shares of an open position as a separate closed
// row and leaves the rest open. Reducing the quantity alone erased the realised
// P&L of the sold shares from the journal forever (AUD-044). Both writes are
// one transaction: half of this operation either loses shares or counts them
// twice.
//
// The sold part carries the leg of the broker that sold, so the journal still
// says who executed it.
func (d *DB) SplitPosition(id, broker string, sold, exitPrice float64, exitDate, notes string) error {
	tx, err := d.SQL.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	p, err := d.scanPosition(tx.QueryRow(`SELECT `+positionColumns+` FROM positions WHERE id=? AND status='open'`, id))
	if err == sql.ErrNoRows {
		return fmt.Errorf("открытая позиция не найдена")
	}
	if err != nil {
		return err
	}
	if !(exitPrice > 0) {
		return fmt.Errorf("exitPrice must be a positive number")
	}
	left := p.Quantity - sold
	if !(sold > 0) || left <= 1e-9 {
		return fmt.Errorf("split quantity out of range")
	}

	part := p
	part.ID = fmt.Sprintf("%s-p%d", id, time.Now().UnixNano())
	part.Quantity = sold
	part.Status = "closed"
	part.ExitDate = exitDate
	price := exitPrice
	part.ExitPrice = &price
	part.Notes = notes
	// Only the selling broker's leg moves into the closed part, capped at what
	// it actually holds.
	part.Webull, part.Robinhood = BrokerLeg{}, BrokerLeg{}
	leg := p.Leg(broker)
	if leg.Qty > sold {
		leg.Qty = sold
	}
	leg.ExitPrice = &price
	part.SetLeg(broker, leg)
	part.applyPnL()

	if err := insertMerged(tx, part); err != nil {
		return err
	}

	rest := p.Leg(broker)
	rest.Qty = rest.Qty - sold
	if rest.Qty < 0 {
		rest.Qty = 0
	}
	col := "webull"
	if normalizeBroker(broker) == "robinhood" {
		col = "rh"
	}
	res, err := tx.Exec(`UPDATE positions SET quantity=?, `+col+`_qty=? WHERE id=? AND status='open'`, left, rest.Qty, id)
	if err != nil {
		return err
	}
	if n, err := res.RowsAffected(); err != nil || n != 1 {
		return fmt.Errorf("partial close left %d open rows: %v", n, err)
	}
	return tx.Commit()
}

// Ptr returns a pointer to v. The price fields of a Position are *float64 so a
// price nobody observed stays NULL; a caller that does have the number wraps it
// here.
func Ptr[T any](v T) *T { return &v }

// EntryFill is one broker's entry execution against a ticker.
type EntryFill struct {
	Symbol    string
	Broker    string
	OrderID   string
	Qty       float64
	Price     *float64
	EntryDate string
	Source    string
	IBS       *float64
	Notes     string
	IsTest    bool
}

// AttachEntry records an entry fill on the open position of that ticker,
// creating the position when this broker is the first one in.
//
// The look-up and the write are one transaction on purpose. The two brokers run
// in parallel, so "is there an open position in this ticker" and "insert one"
// raced: both saw none and both inserted, and the ticker ended up with two open
// positions — the very thing one row per position exists to prevent.
func (d *DB) AttachEntry(f EntryFill) (*Position, error) {
	symbol := SafeTicker(f.Symbol)
	tx, err := d.SQL.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	p, err := d.scanPosition(tx.QueryRow(`SELECT `+positionColumns+
		` FROM positions WHERE symbol=? AND status='open' ORDER BY entry_date DESC, id LIMIT 1`, symbol))
	switch {
	case err == sql.ErrNoRows:
		p = Position{
			ID: f.OrderID, Symbol: symbol, Status: "open",
			EntryDate: f.EntryDate, EntryPrice: f.Price, EntryIBS: f.IBS,
			Source: f.Source, Notes: f.Notes, IsTest: f.IsTest,
		}
		if p.ID == "" {
			p.ID = fmt.Sprintf("p-%d", time.Now().UnixNano())
		}
	case err != nil:
		return nil, err
	}

	// A strategy fill on a row opened by the test-buy button makes it a
	// strategy position: is_test is what keeps a row out of the monitoring page
	// and the statistics, and a real entry left under that flag is a position
	// nobody can see.
	if !f.IsTest {
		p.IsTest = false
	}
	leg := p.Leg(f.Broker)
	if leg.EntryOrderID == f.OrderID && leg.Qty >= f.Qty {
		return &p, tx.Commit() // already recorded
	}
	if f.Qty > leg.Qty {
		leg.Qty = f.Qty
	}
	leg.EntryOrderID = f.OrderID
	if f.Price != nil {
		leg.EntryPrice = f.Price
	}
	p.SetLeg(f.Broker, leg)
	p.Quantity = p.ExecutedQty()

	if err := insertMerged(tx, p); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &p, nil
}
