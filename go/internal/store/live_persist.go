package store

import (
	"database/sql"
	"fmt"
	"sort"
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

func (d *DB) SaveWebullToken(token, expiresAt, status string) error {
	if status == "" {
		status = "NORMAL"
	}
	_, err := d.SQL.Exec(`INSERT INTO webull_token (id, token, expires_at, last_check_status, last_check_at, updated_at)
        VALUES ('current', ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET token=excluded.token, expires_at=excluded.expires_at,
            last_check_status=excluded.last_check_status, last_check_at=excluded.last_check_at, updated_at=datetime('now')`,
		token, expiresAt, status)
	return err
}

func (d *DB) AppendAutotradeLog(message string) error {
	_, err := d.SQL.Exec(`INSERT INTO autotrade_logs (ts, message) VALUES (?, ?)`, time.Now().UTC().Format(time.RFC3339Nano), message)
	return err
}

func (d *DB) ListAutotradeLogs(limit int) ([]map[string]any, error) {
	if limit <= 0 {
		limit = 200
	}
	rows, err := d.SQL.Query(`SELECT ts, message FROM autotrade_logs ORDER BY id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var ts, msg string
		if err := rows.Scan(&ts, &msg); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"ts": ts, "message": msg})
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
	_, err := d.SQL.Exec(`INSERT INTO order_trackers (client_order_id, symbol, action, status, quantity, source, date_key, started_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(client_order_id) DO UPDATE SET status=excluded.status, quantity=excluded.quantity`,
		id, SafeTicker(fmt.Sprint(rec["symbol"])), fmt.Sprint(rec["action"]), status, rec["quantity"], rec["source"], rec["dateKey"], started)
	return err
}

func (d *DB) SetOrderTrackerStatus(clientOrderID, status string) error {
	_, err := d.SQL.Exec(`UPDATE order_trackers SET status=? WHERE client_order_id=?`, status, clientOrderID)
	return err
}

func (d *DB) FindPendingTracker(symbol, action string) map[string]any {
	rows, err := d.ListPendingTrackers()
	if err != nil {
		return nil
	}
	wantSym := SafeTicker(symbol)
	for _, row := range rows {
		if action != "" && fmt.Sprint(row["action"]) != action {
			continue
		}
		if wantSym != "" && SafeTicker(fmt.Sprint(row["symbol"])) != wantSym {
			continue
		}
		return row
	}
	return nil
}

func (d *DB) ListPendingTrackers() ([]map[string]any, error) {
	rows, err := d.SQL.Query(`SELECT client_order_id, symbol, action, status, quantity, source, date_key, started_at
        FROM order_trackers WHERE status NOT IN ('filled','cancelled','canceled','rejected','expired') ORDER BY started_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, symbol, action, status string
		var source, dateKey, started sql.NullString
		var qty sql.NullFloat64
		if err := rows.Scan(&id, &symbol, &action, &status, &qty, &source, &dateKey, &started); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"clientOrderId": id, "symbol": symbol, "action": action, "status": status,
			"quantity": nullF(qty), "source": nullS(source), "dateKey": nullS(dateKey), "startedAt": nullS(started),
		})
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
	rows, err := d.SQL.Query(`SELECT client_order_id, symbol, action, status, quantity, source, date_key, started_at
        FROM order_trackers ORDER BY started_at DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, symbol, action, status string
		var source, dateKey, started sql.NullString
		var qty sql.NullFloat64
		if err := rows.Scan(&id, &symbol, &action, &status, &qty, &source, &dateKey, &started); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"clientOrderId": id, "symbol": symbol, "action": action, "status": status,
			"quantity": nullF(qty), "source": nullS(source), "dateKey": nullS(dateKey), "startedAt": nullS(started),
		})
	}
	if out == nil {
		out = []map[string]any{}
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

// ClaimAggregateT1 sets t1_sent for this chat/date if it is still 0.
// The caller that gets true is the only one allowed to Execute for that day.
func (d *DB) ClaimAggregateT1(chatID, dateKey string) (bool, error) {
	if _, err := d.SQL.Exec(`INSERT OR IGNORE INTO aggregate_send_state (date_key, chat_id, t11_sent, t1_sent) VALUES (?, ?, 0, 0)`, dateKey, chatID); err != nil {
		return false, err
	}
	res, err := d.SQL.Exec(`UPDATE aggregate_send_state SET t1_sent=1 WHERE date_key=? AND chat_id=? AND t1_sent=0`, dateKey, chatID)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

func OpenBrokerTrade(trades []map[string]any) map[string]any {
	for _, t := range trades {
		if fmt.Sprint(t["status"]) == "open" && t["isHidden"] != true {
			return t
		}
	}
	return nil
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
