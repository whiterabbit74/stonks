package store

import (
	"database/sql"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

func (d *DB) MergeOHLC(ticker string, incoming []types.OHLC) error {
	ticker = SafeTicker(ticker)
	if ticker == "" {
		return fmt.Errorf("Invalid ticker")
	}
	existing, adj, err := d.GetOHLC(ticker)
	if err != nil {
		return err
	}
	by := make(map[string]types.OHLC, len(existing)+len(incoming))
	for _, b := range existing {
		by[tradingdate.DateKey(b.Date)] = b
	}
	for _, b := range incoming {
		if b.Date == "" {
			continue
		}
		b.Date = tradingdate.DateKey(b.Date)
		by[b.Date] = b
	}
	dates := make([]string, 0, len(by))
	for date := range by {
		dates = append(dates, date)
	}
	sort.Strings(dates)
	out := make([]types.OHLC, 0, len(dates))
	for _, date := range dates {
		out = append(out, by[date])
	}
	name, company, tag := ticker, "", ""
	if ds, _ := d.GetDataset(ticker); ds != nil {
		if n, ok := ds["name"].(string); ok && n != "" {
			name = n
		}
		if c, ok := ds["companyName"].(string); ok {
			company = c
		}
		if t, ok := ds["tag"].(string); ok {
			tag = t
		}
	}
	return d.SaveDataset(ticker, name, company, tag, out, adj)
}

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
// health status (last_check_status — the vocabulary CanSubmit/executeAll gate
// on: OK, NEEDS_REAUTH, MISSING, UNREACHABLE, EXPIRING_SOON) separately from
// the raw word Webull's CheckToken response actually carried (last_check_raw,
// e.g. "NORMAL", "PENDING"). Symmetric with how Robinhood already stores a
// classified status in robinhood_oauth.last_check_status.
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
            expires_at=COALESCE(NULLIF(excluded.expires_at,''), webull_token.expires_at),
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
	if out == nil {
		out = []map[string]any{}
	}
	return out, nil
}

func (d *DB) SaveOrderTracker(rec map[string]any) error {
	id := fmt.Sprint(rec["clientOrderId"])
	if id == "" || id == "<nil>" {
		return fmt.Errorf("clientOrderId required")
	}
	status := fmt.Sprint(rec["status"])
	if status == "" || status == "<nil>" {
		status = "submitted"
	}
	started := fmt.Sprint(rec["startedAt"])
	if started == "" || started == "<nil>" {
		started = time.Now().UTC().Format(time.RFC3339Nano)
	}
	attempts := 0
	if rec["attempts"] != nil {
		attempts = int(asFloat(rec["attempts"]))
	}
	broker := fmt.Sprint(rec["broker"])
	if broker == "" || broker == "<nil>" {
		broker = "webull"
	}
	_, err := d.SQL.Exec(`INSERT INTO order_trackers (client_order_id, symbol, action, broker, status, quantity, source, date_key, started_at, attempts, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(client_order_id) DO UPDATE SET status=excluded.status, quantity=excluded.quantity, broker=excluded.broker, updated_at=datetime('now')`,
		id, SafeTicker(fmt.Sprint(rec["symbol"])), fmt.Sprint(rec["action"]), broker, status, rec["quantity"], rec["source"], rec["dateKey"], started, attempts)
	return err
}

func (d *DB) GetOrderTracker(clientOrderID string) map[string]any {
	if strings.TrimSpace(clientOrderID) == "" {
		return nil
	}
	row := d.SQL.QueryRow(`SELECT client_order_id, symbol, action, status, quantity, source, date_key, started_at, attempts, COALESCE(broker,'webull') FROM order_trackers WHERE client_order_id=?`, clientOrderID)
	m, err := scanTracker(row, true)
	if err != nil {
		return nil
	}
	return m
}

func (d *DB) SetOrderTrackerStatus(clientOrderID, status string) error {
	_, err := d.SQL.Exec(`UPDATE order_trackers SET status=?, updated_at=datetime('now') WHERE client_order_id=?`, status, clientOrderID)
	return err
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

func (d *DB) AnyPendingTracker() (map[string]any, error) {
	return d.AnyPendingTrackerFor("")
}

func (d *DB) FindPendingTracker(symbol, action string) (map[string]any, error) {
	return d.FindPendingTrackerBroker(symbol, action, "")
}

func (d *DB) listBlockingTrackers() ([]map[string]any, error) {
	rows, err := d.SQL.Query(`SELECT client_order_id, symbol, action, status, quantity, source, date_key, started_at, attempts, COALESCE(broker,'webull')
        FROM order_trackers WHERE status NOT IN ('filled','cancelled','canceled','rejected','expired','terminal_absent') ORDER BY started_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		row, err := scanTracker(rows, true)
		if err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out, nil
}

// IsOwnOrder reports whether this engine placed the order. Every order it
// sends is recorded as a tracker first, so an id absent from the table belongs
// to somebody else - the user trading the same account by hand, most likely -
// and must never be cancelled on their behalf.
func (d *DB) IsOwnOrder(clientOrderID string) bool {
	if strings.TrimSpace(clientOrderID) == "" {
		return false
	}
	var n int
	if err := d.SQL.QueryRow(`SELECT COUNT(1) FROM order_trackers WHERE client_order_id=?`, clientOrderID).Scan(&n); err != nil {
		return false
	}
	return n > 0
}

func (d *DB) ListPendingTrackers() ([]map[string]any, error) {
	// execution_unknown stays in this list so PollTrackers/ResumeTrackers/
	// expireStaleTrackers keep polling it: the broker's listing usually
	// catches up and the next OrderDetail resolves the status on its own.
	// 'unresolved' is the terminal dead-end expireStaleTrackers falls back to
	// when even that never happens - it stops being polled and can only be
	// cleared through POST /api/autotrade/trackers/{clientOrderId}/resolve.
	rows, err := d.SQL.Query(`SELECT client_order_id, symbol, action, status, quantity, source, date_key, started_at, attempts, COALESCE(broker,'webull')
        FROM order_trackers WHERE status NOT IN ('filled','cancelled','canceled','rejected','expired','terminal_absent','unresolved') ORDER BY started_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		row, err := scanTracker(rows, true)
		if err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out, nil
}

func (d *DB) ListRecentTrackers(limit int) ([]map[string]any, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := d.SQL.Query(`SELECT client_order_id, symbol, action, status, quantity, source, date_key, started_at, attempts, COALESCE(broker,'webull')
        FROM order_trackers ORDER BY started_at DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		row, err := scanTracker(rows, true)
		if err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out, nil
}

func scanTracker(s rowScanner, withAttempts bool) (map[string]any, error) {
	var id, symbol, action, status string
	var source, dateKey, started sql.NullString
	var qty sql.NullFloat64
	var attempts sql.NullInt64
	var err error
	var broker sql.NullString
	if withAttempts {
		err = s.Scan(&id, &symbol, &action, &status, &qty, &source, &dateKey, &started, &attempts, &broker)
	} else {
		err = s.Scan(&id, &symbol, &action, &status, &qty, &source, &dateKey, &started)
	}
	if err != nil {
		return nil, err
	}
	n := 0
	if attempts.Valid {
		n = int(attempts.Int64)
	}
	b := "webull"
	if broker.Valid && broker.String != "" {
		b = broker.String
	}
	return map[string]any{
		"clientOrderId": id, "symbol": symbol, "action": action, "status": status,
		"quantity": nullF(qty), "source": nullS(source), "dateKey": nullS(dateKey), "startedAt": nullS(started),
		"attempts": n, "broker": b,
	}, nil
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

// ClaimMissedT1 sets missed_t1_reported if it is still 0. The caller that
// gets true owns the missed-T1 Telegram report for that chat/date. This is
// not ClaimAggregateT1 — t1_sent means the decision was sent, not that the
// miss was reported.
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

// ClaimAggregateT1 sets t1_sent for this chat/date if it is still 0.
// The caller that gets true is the only one allowed to Execute for that day.
func (d *DB) ClaimAggregateT1(chatID, dateKey string) (bool, error) {
	if err := d.EnsureAggregateSlot(chatID, dateKey); err != nil {
		return false, err
	}
	res, err := d.SQL.Exec(`UPDATE aggregate_send_state SET t1_sent=1 WHERE date_key=? AND chat_id=? AND t1_sent=0`, dateKey, chatID)
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

func OpenBrokerTrade(trades []map[string]any) map[string]any {
	return OpenBrokerTradeFor(trades, "")
}

// OpenBrokerTradeFor returns the first open non-hidden journal row for broker.
// An empty broker matches any row. Legacy rows with a blank broker field count
// as webull so a pre-column journal still blocks that book.
func OpenBrokerTradeFor(trades []map[string]any, broker string) map[string]any {
	want := strings.ToLower(strings.TrimSpace(broker))
	for _, t := range trades {
		if fmt.Sprint(t["status"]) != "open" || t["isHidden"] == true {
			continue
		}
		if want != "" {
			got := strings.ToLower(strings.TrimSpace(fmt.Sprint(t["broker"])))
			if got == "<nil>" {
				got = ""
			}
			if got != want && !(want == "webull" && got == "") {
				continue
			}
		}
		return t
	}
	return nil
}

// OpenBrokerTrades returns every open non-hidden journal row in list order.
func OpenBrokerTrades(trades []map[string]any) []map[string]any {
	var out []map[string]any
	for _, t := range trades {
		if OpenBrokerTradeFor([]map[string]any{t}, "") != nil {
			out = append(out, t)
		}
	}
	if out == nil {
		return []map[string]any{}
	}
	return out
}

// OpenBrokerTradesByBroker groups open non-hidden rows by broker. A blank
// broker field counts as webull, matching OpenBrokerTradeFor.
func OpenBrokerTradesByBroker(trades []map[string]any) map[string][]map[string]any {
	out := map[string][]map[string]any{}
	for _, t := range OpenBrokerTrades(trades) {
		name := strings.ToLower(strings.TrimSpace(fmt.Sprint(t["broker"])))
		if name == "" || name == "<nil>" {
			name = "webull"
		}
		out[name] = append(out[name], t)
	}
	return out
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
