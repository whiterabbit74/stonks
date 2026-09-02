package store

import (
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

func OpenBrokerTrade(trades []map[string]any) map[string]any {
	for _, t := range trades {
		if fmt.Sprint(t["status"]) == "open" && t["isHidden"] != true {
			return t
		}
	}
	return nil
}
