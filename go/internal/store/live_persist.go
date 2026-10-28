package store

import (
	"database/sql"
	"fmt"
	"math"
	"os"
	"strings"
	"time"

	"mktorder.com/go/internal/splits"
	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

// MergeOHLC вливает сырые бары провайдера в сохранённый ряд. Сплиты, уже
// применённые к ряду, применяются и к входящим барам: иначе перекрытие
// refresh/актуализации до недавнего сплита ложилось сырым поверх
// пересчитанного, а событие оставалось applied (AUD-152).
func (d *DB) MergeOHLC(ticker string, incoming []types.OHLC) error {
	ticker = SafeTicker(ticker)
	if ticker == "" {
		return fmt.Errorf("Неверный тикер")
	}
	today := tradingdate.TodayNYSE(time.Now())
	for _, b := range incoming {
		date := tradingdate.DateKey(b.Date)
		if date == "" || date > today || !finitePositive(b.Open) || !finitePositive(b.High) || !finitePositive(b.Low) || !finitePositive(b.Close) || b.High < b.Low || b.Close < b.Low || b.Close > b.High {
			return fmt.Errorf("invalid OHLC bar for %s", date)
		}
		if b.AdjClose != nil && (!finitePositive(*b.AdjClose)) {
			return fmt.Errorf("invalid adjusted close for %s", date)
		}
	}
	tx, err := d.SQL.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	applied, err := appliedFactors(tx, ticker)
	if err != nil {
		return err
	}
	if len(applied) > 0 {
		events := make([]types.SplitEvent, 0, len(applied))
		for date, f := range applied {
			events = append(events, types.SplitEvent{Date: date, Factor: f})
		}
		incoming = splits.AdjustOHLC(incoming, events)
	}
	stmt, err := tx.Prepare(`INSERT INTO ohlc (ticker, date, open, high, low, close, adj_close, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticker, date) DO UPDATE SET open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, adj_close=excluded.adj_close, volume=excluded.volume`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, b := range incoming {
		date := tradingdate.DateKey(b.Date)
		if date == "" {
			continue
		}
		var adjC any
		if b.AdjClose != nil {
			adjC = *b.AdjClose
		}
		if _, err := stmt.Exec(ticker, date, b.Open, b.High, b.Low, b.Close, adjC, int64(b.Volume)); err != nil {
			return err
		}
	}
	var n int
	var from, to sql.NullString
	if err := tx.QueryRow(`SELECT COUNT(*), MIN(date), MAX(date) FROM ohlc WHERE ticker = ?`, ticker).Scan(&n, &from, &to); err != nil {
		return err
	}
	upload := time.Now().UTC().Format("2006-01-02")
	_, err = tx.Exec(`INSERT INTO dataset_meta (ticker, name, upload_date, data_points, date_from, date_to, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(ticker) DO UPDATE SET data_points=excluded.data_points, date_from=excluded.date_from, date_to=excluded.date_to, updated_at=datetime('now')`,
		ticker, ticker, upload, n, from, to)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func finitePositive(v float64) bool { return v > 0 && !math.IsNaN(v) && !math.IsInf(v, 0) }

// SaveWebullToken persists the token, expiry, and check status as a single
// word (mirrored into both last_check_status and last_check_raw). It is the
// low-level primitive for callers that only have one status word to record
// (a freshly created/pasted token, or a test fixture). A caller that has run
// an actual Webull check and holds both a classified verdict (OK/NEEDS_REAUTH/
// ...) and the raw response word Webull returned should use
// SaveWebullTokenChecked instead, so the two do not collapse into one column
// again (see P0-4 in AUTOTRADE_ROADMAP.md).
func (d *DB) SaveWebullToken(token, expiresAt, status string) error {
	if status == "" {
		status = "NORMAL"
	}
	return d.SaveWebullTokenChecked(token, expiresAt, status, status)
}

// SaveWebullTokenChecked persists the token/expiry along with a classified
// health status (last_check_status — the vocabulary CanSubmit and the cycle gate
// on: OK, NEEDS_REAUTH, MISSING, UNREACHABLE, EXPIRING_SOON) separately from
// the raw word Webull's CheckToken response actually carried (last_check_raw,
// e.g. "NORMAL", "PENDING"). Symmetric with how Robinhood already stores a
// classified status in robinhood_oauth.last_check_status.
//
// A blank expiry keeps the stored one only while the token is unchanged (a
// check that carried no deadline must not erase it). A *different* token
// starts with no deadline rather than inheriting the previous token's, which
// would be a date about a token that no longer exists.
func (d *DB) SaveWebullTokenChecked(token, expiresAt, status, raw string) error {
	if status == "" {
		status = "NORMAL"
	}
	if raw == "" {
		raw = status
	}
	_, err := d.SQL.Exec(`INSERT INTO webull_token (id, token, expires_at, last_check_status, last_check_raw, last_check_at, updated_at)
        VALUES ('current', ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET token=excluded.token,
            expires_at=CASE WHEN NULLIF(excluded.expires_at,'') IS NOT NULL THEN excluded.expires_at
                WHEN excluded.token = webull_token.token THEN webull_token.expires_at
                ELSE '' END,
            last_check_status=excluded.last_check_status, last_check_raw=excluded.last_check_raw,
            last_check_at=excluded.last_check_at, updated_at=datetime('now')`,
		token, expiresAt, status, raw)
	return err
}

const autotradeLogCap = 500

func (d *DB) AppendAutotradeLog(message string) error {
	return d.AppendAutotradeLogKind("", message)
}

func (d *DB) AppendAutotradeLogKind(kind, message string) error {
	_, err := d.SQL.Exec(`INSERT INTO autotrade_logs (ts, message, kind) VALUES (?, ?, ?)`, time.Now().UTC().Format(time.RFC3339Nano), message, kind)
	return err
}

// PruneAutotradeLogs drops rows older than maxAgeDays and, whatever their age,
// everything beyond the newest maxRows. The table only ever grows otherwise:
// logQuoteProblem writes a row per failed provider attempt per ticker, so a bad
// data day alone adds thousands. A non-positive bound disables that half of the
// rule; both non-positive means nothing is deleted.
func (d *DB) PruneAutotradeLogs(maxAgeDays, maxRows int) (int, error) {
	total := 0
	if maxAgeDays > 0 {
		cutoff := time.Now().UTC().AddDate(0, 0, -maxAgeDays).Format(time.RFC3339Nano)
		res, err := d.SQL.Exec(`DELETE FROM autotrade_logs WHERE ts < ?`, cutoff)
		if err != nil {
			return total, err
		}
		n, _ := res.RowsAffected()
		total += int(n)
	}
	if maxRows > 0 {
		res, err := d.SQL.Exec(`DELETE FROM autotrade_logs WHERE id NOT IN (
                        SELECT id FROM autotrade_logs ORDER BY id DESC LIMIT ?)`, maxRows)
		if err != nil {
			return total, err
		}
		n, _ := res.RowsAffected()
		total += int(n)
	}
	return total, nil
}

func (d *DB) ListAutotradeLogs(limit int) ([]map[string]any, error) {
	return d.ListAutotradeLogsKind("", limit)
}

func (d *DB) ListAutotradeLogsKind(kind string, limit int) ([]map[string]any, error) {
	if limit <= 0 || limit > autotradeLogCap {
		limit = autotradeLogCap
	}
	var rows *sql.Rows
	var err error
	if kind == "" {
		rows, err = d.SQL.Query(`SELECT ts, message, kind FROM autotrade_logs ORDER BY id DESC LIMIT ?`, limit)
	} else {
		rows, err = d.SQL.Query(`SELECT ts, message, kind FROM autotrade_logs WHERE kind = ? ORDER BY id DESC LIMIT ?`, kind, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var ts, msg, k string
		if err := rows.Scan(&ts, &msg, &k); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"ts": ts, "message": msg, "kind": k})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out, nil
}

// terminalTrackerStatuses are the statuses an order can never leave: the order
// is done and its fill, if any, is already journaled. Every write to a tracker
// status honours them — startTracking saves the tracker after placeMarket
// returns, and the scheduler's 20-second poll may have finalised the order in
// the meantime, so a plain overwrite put a filled order back in the polling
// queue and booked its fill a second time (AUD-116).
const terminalTrackerStatuses = `'filled','cancelled','canceled','rejected','expired','terminal_absent'`

// Tracker is one order_trackers row. A NULL column reads as its zero value:
// no quantity is 0, no source, trading date or start time is "". The json keys
// are what the SPA reads from /api/autotrade/logs.
type Tracker struct {
	ClientOrderID string  `json:"clientOrderId"`
	Symbol        string  `json:"symbol"`
	Action        string  `json:"action"`
	Status        string  `json:"status"`
	Quantity      float64 `json:"quantity"`
	Source        string  `json:"source"`
	DateKey       string  `json:"dateKey"`
	StartedAt     string  `json:"startedAt"`
	Attempts      int     `json:"attempts"`
	Broker        string  `json:"broker"`
	UpdatedAt     string  `json:"-"`
	RecordedQty   float64 `json:"-"`
	RecordedPrice float64 `json:"-"`
	LastFilledQty float64 `json:"-"`
	LastFillPrice float64 `json:"-"`
}

// SaveOrderTracker inserts the tracker or, for an existing id, updates its
// status, quantity and broker. Empty status means "submitted", empty start
// means now, empty broker means Webull.
func (d *DB) SaveOrderTracker(rec Tracker) error {
	if strings.TrimSpace(rec.ClientOrderID) == "" {
		return fmt.Errorf("clientOrderId required")
	}
	if rec.Status == "" {
		rec.Status = "submitted"
	}
	if rec.StartedAt == "" {
		rec.StartedAt = time.Now().UTC().Format(time.RFC3339Nano)
	}
	if rec.Broker == "" {
		rec.Broker = "webull"
	}
	_, err := d.SQL.Exec(`INSERT INTO order_trackers (client_order_id, symbol, action, broker, status, quantity, source, date_key, started_at, attempts, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(client_order_id) DO UPDATE SET
            status=CASE WHEN order_trackers.status IN (`+terminalTrackerStatuses+`) THEN order_trackers.status ELSE excluded.status END,
            quantity=excluded.quantity, broker=excluded.broker, updated_at=datetime('now')`,
		rec.ClientOrderID, SafeTicker(rec.Symbol), rec.Action, rec.Broker, rec.Status, rec.Quantity, rec.Source, rec.DateKey, rec.StartedAt, rec.Attempts)
	return err
}

// GetOrderTracker returns the tracker of this order, nil when there is none
// or it cannot be read.
func (d *DB) GetOrderTracker(clientOrderID string) *Tracker {
	if strings.TrimSpace(clientOrderID) == "" {
		return nil
	}
	rows, err := d.listTrackers(`WHERE client_order_id=?`, clientOrderID)
	if err != nil || len(rows) == 0 {
		return nil
	}
	return &rows[0]
}

func (d *DB) SetOrderTrackerStatus(clientOrderID, status string) error {
	res, err := d.SQL.Exec(`UPDATE order_trackers SET status=?, updated_at=datetime('now')
        WHERE client_order_id=? AND status NOT IN (`+terminalTrackerStatuses+`)`, status, clientOrderID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n != 1 {
		var current string
		err := d.SQL.QueryRow(`SELECT status FROM order_trackers WHERE client_order_id=?`, clientOrderID).Scan(&current)
		if err == sql.ErrNoRows {
			return nil
		}
		if err != nil {
			return err
		}
		return fmt.Errorf("tracker already resolved")
	}
	return nil
}

func (d *DB) BumpOrderTrackerAttempts(clientOrderID string) (int, error) {
	if _, err := d.SQL.Exec(`UPDATE order_trackers SET attempts=attempts+1, updated_at=datetime('now') WHERE client_order_id=?`, clientOrderID); err != nil {
		return 0, err
	}
	var n int
	err := d.SQL.QueryRow(`SELECT attempts FROM order_trackers WHERE client_order_id=?`, clientOrderID).Scan(&n)
	if err == sql.ErrNoRows {
		return 0, fmt.Errorf("tracker not found")
	}
	return n, err
}

// ExpireStaleTrackers marks non-final trackers expired when date_key is before
// todayYYYYMMDD, or attempts >= maxAttempts (when maxAttempts > 0).
func (d *DB) ExpireStaleTrackers(todayYYYYMMDD string, maxAttempts int) (int, error) {
	q := `UPDATE order_trackers SET status='expired', updated_at=datetime('now')
        WHERE status NOT IN ('filled','cancelled','canceled','rejected','expired','terminal_absent','execution_unknown')`
	var args []any
	switch {
	case todayYYYYMMDD != "" && maxAttempts > 0:
		q += ` AND ((date_key IS NOT NULL AND date_key != '' AND date_key < ?) OR attempts >= ?)`
		args = append(args, todayYYYYMMDD, maxAttempts)
	case todayYYYYMMDD != "":
		q += ` AND date_key IS NOT NULL AND date_key != '' AND date_key < ?`
		args = append(args, todayYYYYMMDD)
	case maxAttempts > 0:
		q += ` AND attempts >= ?`
		args = append(args, maxAttempts)
	default:
		return 0, nil
	}
	res, err := d.SQL.Exec(q, args...)
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	return int(n), err
}

func (d *DB) AnyPendingTracker() (*Tracker, error) {
	return d.AnyPendingTrackerFor("")
}

func (d *DB) FindPendingTracker(symbol, action string) (*Tracker, error) {
	return d.FindPendingTrackerBroker(symbol, action, "")
}

func (d *DB) listBlockingTrackers() ([]Tracker, error) {
	return d.listTrackers(`WHERE status NOT IN ('filled','cancelled','canceled','rejected','expired','terminal_absent') ORDER BY started_at DESC`)
}

// IsOwnOrder reports whether this engine placed the order. Every order it
// sends is recorded as a tracker first, so an id absent from the table belongs
// to somebody else - the user trading the same account by hand, most likely -
// and must never be cancelled on their behalf. A failed read is returned as an
// error, not as "not ours": the caller must not conclude anything about a
// working order from a journal it could not read.
func (d *DB) IsOwnOrder(clientOrderID string) (bool, error) {
	if strings.TrimSpace(clientOrderID) == "" {
		return false, nil
	}
	var n int
	if err := d.SQL.QueryRow(`SELECT COUNT(1) FROM order_trackers WHERE client_order_id=?`, clientOrderID).Scan(&n); err != nil {
		return false, err
	}
	return n > 0, nil
}

func (d *DB) ListPendingTrackers() ([]Tracker, error) {
	// execution_unknown stays in this list so PollTrackers/ResumeTrackers/
	// expireStaleTrackers keep polling it: the broker's listing usually
	// catches up and the next OrderDetail resolves the status on its own.
	// 'unresolved' is the terminal dead-end expireStaleTrackers falls back to
	// when even that never happens - it stops being polled and can only be
	// cleared through POST /api/autotrade/trackers/{clientOrderId}/resolve.
	return d.listTrackers(`WHERE status NOT IN ('filled','cancelled','canceled','rejected','expired','terminal_absent','unresolved') ORDER BY started_at DESC`)
}

// NoteTrackerFill keeps the executed quantity a broker has confirmed for a
// still-working order, with its average price (0 = not reported). The
// quantity is cumulative, so a smaller report never lowers it. A tracker that
// later ends with no broker answer — a network error on the last poll, a stale
// day — still journals these shares (AUD-135).
func (d *DB) NoteTrackerFill(clientOrderID string, qty, price float64) error {
	if !(qty > 0) {
		return nil
	}
	var p any
	if price > 0 {
		p = price
	}
	_, err := d.SQL.Exec(`UPDATE order_trackers SET
            last_fill_price = CASE WHEN ?1 > last_filled_qty THEN ?2 ELSE COALESCE(?2, last_fill_price) END,
            last_filled_qty = ?1
        WHERE client_order_id = ?3 AND ?1 >= last_filled_qty`, qty, p, clientOrderID)
	return err
}

// TrackerFill returns what NoteTrackerFill kept for this order; zeros when
// nothing was confirmed or the tracker is gone.
func (d *DB) TrackerFill(clientOrderID string) (qty, price float64, err error) {
	var q, pr sql.NullFloat64
	err = d.SQL.QueryRow(`SELECT last_filled_qty, last_fill_price FROM order_trackers WHERE client_order_id=?`, clientOrderID).Scan(&q, &pr)
	if err == sql.ErrNoRows {
		return 0, 0, nil
	}
	return q.Float64, pr.Float64, err
}

// ClaimFillQty books `filled` as the total executed quantity journaled for this
// order and returns how much of it is new. A replay of the same fill — the poll
// that runs again after a restart between writing the trade and stamping the
// tracker final — returns 0 and must journal nothing (CORE-04).
//
// Read and write are one transaction so two pollers cannot both claim the same
// shares.
func (d *DB) ClaimFillQty(clientOrderID string, filled float64) (float64, error) {
	tx, err := d.SQL.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	newly, err := claimFillTx(tx, clientOrderID, filled)
	if err != nil || newly <= 0 {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return newly, nil
}

// RecordedFillQty is how much of this order the journal has already booked. It
// answers "have I seen this fill before" for a caller that is about to write
// nothing anyway — the alarm on an exit fill with no open position to close.
// A write keyed off idempotency claims through claimFillTx instead, in the same
// transaction as the write it authorises.
func (d *DB) RecordedFillQty(clientOrderID string) float64 {
	var recorded sql.NullFloat64
	if err := d.SQL.QueryRow(`SELECT recorded_qty FROM order_trackers WHERE client_order_id=?`, clientOrderID).Scan(&recorded); err != nil {
		return 0
	}
	return recorded.Float64
}

// claimEntryFillTx is claimFillTx for a buy, which also needs the price of the
// newly claimed part. The broker reports an order's cumulative average, so the
// new shares cost what the order's cumulative cost grew by: the average alone
// priced them at the whole order's average (AUD-180). A part whose earlier
// cost is unknown has no price (invariant J).
func claimEntryFillTx(tx *sql.Tx, clientOrderID string, filled float64, price *float64) (float64, *float64, error) {
	var recQty, recPrice sql.NullFloat64
	err := tx.QueryRow(`SELECT recorded_qty, recorded_price FROM order_trackers WHERE client_order_id=?`, clientOrderID).Scan(&recQty, &recPrice)
	if err != nil && err != sql.ErrNoRows {
		return 0, nil, err
	}
	newly, err := claimFillTx(tx, clientOrderID, filled)
	if err != nil || newly <= 0 {
		return newly, nil, err
	}
	if _, err := tx.Exec(`UPDATE order_trackers SET recorded_price=? WHERE client_order_id=?`, price, clientOrderID); err != nil {
		return 0, nil, err
	}
	if price == nil || !(recQty.Float64 > 1e-9) {
		return newly, price, nil
	}
	if !recPrice.Valid {
		return newly, nil, nil
	}
	v := (filled**price - recQty.Float64*recPrice.Float64) / newly
	if !(v > 0) {
		return newly, nil, nil
	}
	return newly, &v, nil
}

// claimFillTx is ClaimFillQty inside a caller's transaction, so the claim and
// the journal write it authorises commit or roll back together.
func claimFillTx(tx *sql.Tx, clientOrderID string, filled float64) (float64, error) {
	if strings.TrimSpace(clientOrderID) == "" || !(filled > 0) {
		return 0, nil
	}
	var recorded sql.NullFloat64
	err := tx.QueryRow(`SELECT recorded_qty FROM order_trackers WHERE client_order_id=?`, clientOrderID).Scan(&recorded)
	if err == sql.ErrNoRows {
		// No tracker to key idempotency off: treat the fill as new rather than
		// dropping it, the same way the rest of this path prefers a recorded
		// trade over a silent loss.
		return filled, nil
	}
	if err != nil {
		return 0, err
	}
	newly := filled - recorded.Float64
	if newly <= 1e-9 {
		return 0, nil
	}
	if _, err := tx.Exec(`UPDATE order_trackers SET recorded_qty=? WHERE client_order_id=?`, filled, clientOrderID); err != nil {
		return 0, err
	}
	return newly, nil
}

func (d *DB) ListRecentTrackers(limit int) ([]Tracker, error) {
	if limit <= 0 {
		limit = 20
	}
	return d.listTrackers(`ORDER BY started_at DESC LIMIT ?`, limit)
}

// listTrackers reads the trackers the clause selects; never nil on success.
func (d *DB) listTrackers(clause string, args ...any) ([]Tracker, error) {
	rows, err := d.SQL.Query(`SELECT client_order_id, symbol, action, status, quantity, source, date_key, started_at,
            attempts, COALESCE(broker,'webull'), updated_at, recorded_qty, recorded_price, last_filled_qty, last_fill_price
        FROM order_trackers `+clause, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Tracker{}
	for rows.Next() {
		var t Tracker
		var source, dateKey, started, updated sql.NullString
		var qty, recorded, recordedPrice, lastQty, lastPrice sql.NullFloat64
		var attempts sql.NullInt64
		if err := rows.Scan(&t.ClientOrderID, &t.Symbol, &t.Action, &t.Status, &qty, &source, &dateKey, &started,
			&attempts, &t.Broker, &updated, &recorded, &recordedPrice, &lastQty, &lastPrice); err != nil {
			return nil, err
		}
		t.Quantity, t.Source, t.DateKey, t.StartedAt = qty.Float64, source.String, dateKey.String, started.String
		t.Attempts, t.UpdatedAt = int(attempts.Int64), updated.String
		t.RecordedQty, t.RecordedPrice = recorded.Float64, recordedPrice.Float64
		t.LastFilledQty, t.LastFillPrice = lastQty.Float64, lastPrice.Float64
		if t.Broker == "" {
			t.Broker = "webull"
		}
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (d *DB) AggregateState(chatID, dateKey string) (t11Sent, t1Sent bool) {
	var t11, t1 int
	err := d.SQL.QueryRow(`SELECT t11_sent, t1_sent FROM aggregate_send_state WHERE date_key=? AND chat_id=?`, dateKey, chatID).Scan(&t11, &t1)
	if err != nil {
		return false, false
	}
	return t11 != 0, t1 != 0
}

func (d *DB) MarkAggregateT11(chatID, dateKey string) error {
	_, err := d.SQL.Exec(`INSERT INTO aggregate_send_state (date_key, chat_id, t11_sent, t1_sent) VALUES (?, ?, 1, 0)
        ON CONFLICT(date_key, chat_id) DO UPDATE SET t11_sent=1`, dateKey, chatID)
	return err
}

// EnsureAggregateSlot reserves today's T-11/T-1 row without marking either
// stage sent. The scheduler claims the slot when it first enters the window
// (until 12 or 2) so a later miss can tell "reserved but not sent" from
// "never saw the day".
func (d *DB) EnsureAggregateSlot(chatID, dateKey string) error {
	_, err := d.SQL.Exec(`INSERT OR IGNORE INTO aggregate_send_state (date_key, chat_id, t11_sent, t1_sent) VALUES (?, ?, 0, 0)`, dateKey, chatID)
	return err
}

// ClaimAggregateT11 sets t11_sent if it is still 0. The caller that gets true
// owns the T-11 slot — either to send, or to record that the minute was missed.
func (d *DB) ClaimAggregateT11(chatID, dateKey string) (bool, error) {
	if err := d.EnsureAggregateSlot(chatID, dateKey); err != nil {
		return false, err
	}
	res, err := d.SQL.Exec(`UPDATE aggregate_send_state SET t11_sent=1 WHERE date_key=? AND chat_id=? AND t11_sent=0`, dateKey, chatID)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

// ReleaseAggregateT11 undoes a ClaimAggregateT11 whose send then failed, so a
// later tick inside the window can try again instead of losing the message.
func (d *DB) ReleaseAggregateT11(chatID, dateKey string) error {
	_, err := d.SQL.Exec(`UPDATE aggregate_send_state SET t11_sent=0 WHERE date_key=? AND chat_id=?`, dateKey, chatID)
	return err
}

// ReleaseMissedT1 is ReleaseAggregateT11 for the missed-T1 report.
func (d *DB) ReleaseMissedT1(chatID, dateKey string) error {
	_, err := d.SQL.Exec(`UPDATE aggregate_send_state SET missed_t1_reported=0 WHERE date_key=? AND chat_id=?`, dateKey, chatID)
	return err
}

// ClaimMissedT1 sets missed_t1_reported if it is still 0. The caller that
// gets true owns the missed-T1 Telegram report for that chat/date. t1_sent
// means the decision was sent, not that the miss was reported.
func (d *DB) ClaimMissedT1(chatID, dateKey string) (bool, error) {
	if err := d.EnsureAggregateSlot(chatID, dateKey); err != nil {
		return false, err
	}
	res, err := d.SQL.Exec(`UPDATE aggregate_send_state SET missed_t1_reported=1 WHERE date_key=? AND chat_id=? AND missed_t1_reported=0`, dateKey, chatID)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

type T1Attempt struct {
	Skip          bool
	Reason        string
	ExecutionDone bool
}

// BeginT1Attempt takes a time-bounded lease for today's T-1 run.
// already_sent (t1_sent) skips everything. execution_finished without a
// report lets the caller retry the Telegram send only. An unexpired lease
// skips so two ticks cannot Execute at once. An expired lease without
// execution_finished allows another attempt.
func (d *DB) BeginT1Attempt(chatID, dateKey string, now time.Time, ttl time.Duration) (T1Attempt, error) {
	if _, err := d.SQL.Exec(`INSERT OR IGNORE INTO aggregate_send_state (date_key, chat_id, t11_sent, t1_sent) VALUES (?, ?, 0, 0)`, dateKey, chatID); err != nil {
		return T1Attempt{}, err
	}
	var t1Sent, execDone int
	var lease sql.NullString
	err := d.SQL.QueryRow(`SELECT t1_sent, t1_execution_finished, t1_lease_until FROM aggregate_send_state WHERE date_key=? AND chat_id=?`, dateKey, chatID).Scan(&t1Sent, &execDone, &lease)
	if err != nil {
		return T1Attempt{}, err
	}
	if t1Sent != 0 {
		return T1Attempt{Skip: true, Reason: "already_sent"}, nil
	}
	if execDone != 0 {
		return T1Attempt{ExecutionDone: true}, nil
	}
	nowS := now.UTC().Format(time.RFC3339)
	until := now.UTC().Add(ttl).Format(time.RFC3339)
	res, err := d.SQL.Exec(`UPDATE aggregate_send_state SET t1_lease_until=? WHERE date_key=? AND chat_id=? AND t1_sent=0 AND t1_execution_finished=0 AND (t1_lease_until IS NULL OR t1_lease_until='' OR t1_lease_until < ?)`,
		until, dateKey, chatID, nowS)
	if err != nil {
		return T1Attempt{}, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return T1Attempt{}, err
	}
	if n != 1 {
		return T1Attempt{Skip: true, Reason: "lease_held"}, nil
	}
	return T1Attempt{}, nil
}

func (d *DB) MarkT1ExecutionFinished(chatID, dateKey string) error {
	_, err := d.SQL.Exec(`UPDATE aggregate_send_state SET t1_execution_finished=1 WHERE date_key=? AND chat_id=?`, dateKey, chatID)
	return err
}

func (d *DB) MarkT1ReportSent(chatID, dateKey string) error {
	_, err := d.SQL.Exec(`UPDATE aggregate_send_state SET t1_sent=1, t1_lease_until='' WHERE date_key=? AND chat_id=?`, dateKey, chatID)
	return err
}

// T1ExecutionFinished reports whether T-1 execution already finished for this
// chat/date. A missing row is false, not an error.
func (d *DB) T1ExecutionFinished(chatID, dateKey string) (bool, error) {
	var n int
	err := d.SQL.QueryRow(`SELECT t1_execution_finished FROM aggregate_send_state WHERE date_key=? AND chat_id=?`, dateKey, chatID).Scan(&n)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return n != 0, nil
}

func OpenTradeForSymbol(rows []map[string]any, symbol string) map[string]any {
	want := SafeTicker(symbol)
	if want == "" {
		return nil
	}
	for _, t := range rows {
		if fmt.Sprint(t["status"]) != "open" || t["isHidden"] == true {
			continue
		}
		if SafeTicker(fmt.Sprint(t["symbol"])) == want {
			return t
		}
	}
	return nil
}

// WebullAccessToken resolves the token every Webull request must carry.
// Precedence follows the Node client: a SQLite token is only trusted for API
// calls once a status check confirmed it NORMAL — a freshly created token is
// PENDING until the user approves the SMS in the Webull app, and sending it
// would fail every request while a perfectly good environment token sits
// unused. The unconfirmed token is still better than no header at all, so it
// is the last resort rather than being dropped.
func (d *DB) WebullAccessToken() string {
	row := d.GetWebullToken()
	// last_check_raw carries Webull's own vocabulary ("NORMAL") even after
	// P0-4 started classifying last_check_status into OK/NEEDS_REAUTH/...; the
	// raw column is what this check is actually about.
	if row.Token != "" && strings.EqualFold(row.LastCheckRaw, "NORMAL") {
		return row.Token
	}
	if env := os.Getenv("WEBULL_ACCESS_TOKEN"); env != "" {
		return env
	}
	return row.Token
}
