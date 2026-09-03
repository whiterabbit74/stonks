package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"

	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

type DB struct {
	SQL      *sql.DB
	mu       sync.Mutex
	settings map[string]any
}

func Open(path string) (*DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	sqlDB, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(1)
	if _, err := sqlDB.Exec(`PRAGMA busy_timeout = 5000`); err != nil {
		sqlDB.Close()
		return nil, err
	}
	d := &DB{SQL: sqlDB, settings: map[string]any{}}
	if err := d.initSchema(); err != nil {
		sqlDB.Close()
		return nil, err
	}
	return d, nil
}

func (d *DB) Close() error { return d.SQL.Close() }

func (d *DB) initSchema() error {
	_, err := d.SQL.Exec(`
        CREATE TABLE IF NOT EXISTS dataset_meta (
            ticker              TEXT PRIMARY KEY,
            name                TEXT,
            company_name        TEXT,
            upload_date         TEXT,
            tag                 TEXT,
            data_points         INTEGER DEFAULT 0,
            date_from           TEXT,
            date_to             TEXT,
            adjusted_for_splits INTEGER DEFAULT 0,
            updated_at          TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS ohlc (
            ticker      TEXT NOT NULL,
            date        TEXT NOT NULL,
            open        REAL,
            high        REAL,
            low         REAL,
            close       REAL,
            adj_close   REAL,
            volume      INTEGER,
            PRIMARY KEY (ticker, date)
        );
        CREATE TABLE IF NOT EXISTS splits (
            ticker  TEXT NOT NULL,
            date    TEXT NOT NULL,
            factor  REAL NOT NULL,
            PRIMARY KEY (ticker, date)
        );
        CREATE INDEX IF NOT EXISTS idx_splits_ticker ON splits(ticker);
        CREATE TABLE IF NOT EXISTS trades (
            id                  TEXT PRIMARY KEY,
            symbol              TEXT NOT NULL,
            status              TEXT NOT NULL DEFAULT 'open',
            entry_date          TEXT,
            exit_date           TEXT,
            entry_price         REAL,
            exit_price          REAL,
            entry_ibs           REAL,
            exit_ibs            REAL,
            entry_decision_time TEXT,
            exit_decision_time  TEXT,
            pnl_percent         REAL,
            pnl_absolute        REAL,
            holding_days        INTEGER,
            notes               TEXT,
            linked_broker_trade_id TEXT,
            source TEXT DEFAULT 'auto',
            is_hidden INTEGER NOT NULL DEFAULT 0,
            is_test INTEGER NOT NULL DEFAULT 0,
            broker_order_id TEXT,
            client_order_id TEXT,
            filled_qty REAL,
            quantity REAL
        );
        CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
        CREATE INDEX IF NOT EXISTS idx_trades_entry_date ON trades(entry_date);
        CREATE TABLE IF NOT EXISTS calendar (
            id      INTEGER PRIMARY KEY CHECK (id = 1),
            data    TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token      TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
        CREATE TABLE IF NOT EXISTS broker_trades (
            id                  TEXT PRIMARY KEY,
            symbol              TEXT NOT NULL,
            status              TEXT NOT NULL DEFAULT 'open',
            entry_date          TEXT,
            exit_date           TEXT,
            entry_price         REAL,
            exit_price          REAL,
            entry_ibs           REAL,
            exit_ibs            REAL,
            entry_decision_time TEXT,
            exit_decision_time  TEXT,
            pnl_percent         REAL,
            pnl_absolute        REAL,
            holding_days        INTEGER,
            notes               TEXT,
            source              TEXT DEFAULT 'auto',
            is_hidden           INTEGER NOT NULL DEFAULT 0,
            is_test             INTEGER NOT NULL DEFAULT 0,
            broker_order_id     TEXT,
            client_order_id     TEXT,
            filled_qty          REAL,
            quantity            REAL
        );
        CREATE TABLE IF NOT EXISTS telegram_watches (
            symbol               TEXT PRIMARY KEY,
            high_ibs             REAL NOT NULL DEFAULT 0.75,
            low_ibs              REAL NOT NULL DEFAULT 0.1,
            threshold_pct        REAL NOT NULL DEFAULT 0.3,
            chat_id              TEXT,
            entry_price          REAL,
            entry_date           TEXT,
            entry_ibs            REAL,
            entry_decision_time  TEXT,
            current_trade_id     TEXT,
            is_open_position     INTEGER NOT NULL DEFAULT 0,
            sent_date_key        TEXT,
            sent_warn10          INTEGER NOT NULL DEFAULT 0,
            sent_confirm1        INTEGER NOT NULL DEFAULT 0,
            sent_entry_warn10    INTEGER NOT NULL DEFAULT 0,
            sent_entry_confirm1  INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS telegram_ema_alerts (
            id             TEXT PRIMARY KEY,
            symbol         TEXT NOT NULL,
            ema_period     INTEGER NOT NULL DEFAULT 200,
            level_pct      REAL NOT NULL DEFAULT 0,
            direction      TEXT NOT NULL DEFAULT 'above',
            buy_level_pct  REAL,
            sell_level_pct REAL,
            next_action    TEXT NOT NULL DEFAULT 'buy',
            last_triggered_action TEXT,
            last_triggered_at TEXT,
            last_triggered_deviation_pct REAL,
            threshold_pct  REAL NOT NULL DEFAULT 0.5,
            enabled        INTEGER NOT NULL DEFAULT 1,
            created_at     TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
            info_level_pct REAL,
            info_last_side TEXT,
            info_last_notified_at TEXT
        );
        CREATE TABLE IF NOT EXISTS webull_token (
            id                    TEXT PRIMARY KEY CHECK (id = 'current'),
            token                 TEXT,
            created_at            TEXT,
            expires_at            TEXT,
            last_check_status     TEXT,
            last_check_at         TEXT,
            last_health_check_date TEXT,
            last_health_check_attempt_at TEXT,
            updated_at            TEXT
        );
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS autotrade_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            message TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS order_trackers (
            client_order_id TEXT PRIMARY KEY,
            symbol          TEXT NOT NULL,
            action          TEXT NOT NULL,
            status          TEXT NOT NULL,
            quantity        REAL,
            source          TEXT,
            date_key        TEXT,
            started_at      TEXT NOT NULL,
            attempts        INTEGER NOT NULL DEFAULT 0,
            updated_at      TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_order_trackers_pending ON order_trackers(symbol, action, status);
        CREATE TABLE IF NOT EXISTS aggregate_send_state (
            date_key TEXT NOT NULL,
            chat_id  TEXT NOT NULL DEFAULT '',
            t11_sent INTEGER NOT NULL DEFAULT 0,
            t1_sent  INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (date_key, chat_id)
        );
    `)
	if err != nil {
		return err
	}
	return d.migrateSchema()
}

func (d *DB) migrateSchema() error {
	d.ensureColumn("order_trackers", "attempts", "INTEGER NOT NULL DEFAULT 0")
	d.ensureColumn("order_trackers", "updated_at", "TEXT")
	d.ensureColumn("autotrade_logs", "kind", "TEXT NOT NULL DEFAULT ''")
	return nil
}

func (d *DB) hasColumn(table, col string) bool {
	rows, err := d.SQL.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return false
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			return false
		}
		if strings.EqualFold(name, col) {
			return true
		}
	}
	return false
}

func (d *DB) ensureColumn(table, col, typ string) {
	if d.hasColumn(table, col) {
		return
	}
	_, _ = d.SQL.Exec(`ALTER TABLE ` + table + ` ADD COLUMN ` + col + ` ` + typ)
}

var tickerRe = regexp.MustCompile(`[^A-Za-z0-9.-]`)

func SafeTicker(raw string) string {
	cleaned := strings.ToUpper(tickerRe.ReplaceAllString(raw, ""))
	if len(cleaned) > 10 {
		cleaned = cleaned[:10]
	}
	return cleaned
}

type DatasetMeta struct {
	ID                string             `json:"id"`
	Name              string             `json:"name"`
	Ticker            string             `json:"ticker"`
	CompanyName       *string            `json:"companyName"`
	DataPoints        int                `json:"dataPoints"`
	DateRange         map[string]*string `json:"dateRange"`
	UploadDate        *string            `json:"uploadDate"`
	Tag               *string            `json:"tag"`
	AdjustedForSplits bool               `json:"adjustedForSplits"`
}

func (d *DB) ListDatasets() ([]DatasetMeta, error) {
	rows, err := d.SQL.Query(`SELECT ticker, name, company_name, upload_date, tag, data_points, date_from, date_to, adjusted_for_splits FROM dataset_meta ORDER BY ticker`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DatasetMeta
	for rows.Next() {
		m, err := scanMeta(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	if out == nil {
		out = []DatasetMeta{}
	}
	return out, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanMeta(s rowScanner) (DatasetMeta, error) {
	var ticker, name string
	var company, upload, tag, from, to sql.NullString
	var points, adj int
	if err := s.Scan(&ticker, &name, &company, &upload, &tag, &points, &from, &to, &adj); err != nil {
		return DatasetMeta{}, err
	}
	if name == "" {
		name = ticker
	}
	m := DatasetMeta{
		ID: ticker, Name: name, Ticker: ticker, DataPoints: points,
		DateRange:  map[string]*string{"from": nullStr(from), "to": nullStr(to)},
		UploadDate: nullStr(upload), Tag: nullStr(tag), AdjustedForSplits: adj == 1,
	}
	m.CompanyName = nullStr(company)
	return m, nil
}

func nullStr(s sql.NullString) *string {
	if !s.Valid {
		return nil
	}
	v := s.String
	return &v
}

func (d *DB) GetDataset(id string) (map[string]any, error) {
	ticker := SafeTicker(id)
	row := d.SQL.QueryRow(`SELECT ticker, name, company_name, upload_date, tag, data_points, date_from, date_to, adjusted_for_splits FROM dataset_meta WHERE ticker = ?`, ticker)
	meta, err := scanMeta(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	rows, err := d.SQL.Query(`SELECT date, open, high, low, close, adj_close, volume FROM ohlc WHERE ticker = ? ORDER BY date`, ticker)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var data []types.OHLC
	for rows.Next() {
		var b types.OHLC
		var adj sql.NullFloat64
		var vol sql.NullInt64
		if err := rows.Scan(&b.Date, &b.Open, &b.High, &b.Low, &b.Close, &adj, &vol); err != nil {
			return nil, err
		}
		if adj.Valid {
			v := adj.Float64
			b.AdjClose = &v
		}
		if vol.Valid {
			b.Volume = float64(vol.Int64)
		}
		data = append(data, b)
	}
	if data == nil {
		data = []types.OHLC{}
	}
	out := map[string]any{
		"id": meta.ID, "name": meta.Name, "ticker": meta.Ticker,
		"companyName": meta.CompanyName, "dataPoints": meta.DataPoints,
		"dateRange": meta.DateRange, "uploadDate": meta.UploadDate, "tag": meta.Tag,
		"adjustedForSplits": meta.AdjustedForSplits, "data": data,
	}
	return out, nil
}

func (d *DB) SaveDataset(ticker, name, company, tag string, bars []types.OHLC, adjusted bool) error {
	ticker = SafeTicker(ticker)
	if ticker == "" {
		return fmt.Errorf("Invalid ticker")
	}
	if name == "" {
		name = ticker
	}
	var from, to *string
	if len(bars) > 0 {
		f, t := tradingdate.DateKey(bars[0].Date), tradingdate.DateKey(bars[len(bars)-1].Date)
		from, to = &f, &t
	}
	upload := time.Now().UTC().Format("2006-01-02")
	tx, err := d.SQL.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	adj := 0
	if adjusted {
		adj = 1
	}
	_, err = tx.Exec(`INSERT INTO dataset_meta (ticker, name, company_name, upload_date, tag, data_points, date_from, date_to, adjusted_for_splits, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(ticker) DO UPDATE SET name=excluded.name, company_name=excluded.company_name, upload_date=excluded.upload_date,
            tag=excluded.tag, data_points=excluded.data_points, date_from=excluded.date_from, date_to=excluded.date_to,
            adjusted_for_splits=excluded.adjusted_for_splits, updated_at=datetime('now')`,
		ticker, name, company, upload, tag, len(bars), from, to, adj)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM ohlc WHERE ticker = ?`, ticker); err != nil {
		return err
	}
	stmt, err := tx.Prepare(`INSERT INTO ohlc (ticker, date, open, high, low, close, adj_close, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, b := range bars {
		date := tradingdate.DateKey(b.Date)
		var adjC any
		if b.AdjClose != nil {
			adjC = *b.AdjClose
		}
		if _, err := stmt.Exec(ticker, date, b.Open, b.High, b.Low, b.Close, adjC, int64(b.Volume)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (d *DB) DeleteDataset(id string) error {
	ticker := SafeTicker(id)
	tx, err := d.SQL.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM ohlc WHERE ticker = ?`, ticker); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM dataset_meta WHERE ticker = ?`, ticker); err != nil {
		return err
	}
	return tx.Commit()
}

func (d *DB) Counts() (datasets, ohlc int) {
	_ = d.SQL.QueryRow(`SELECT COUNT(*) FROM dataset_meta`).Scan(&datasets)
	_ = d.SQL.QueryRow(`SELECT COUNT(*) FROM ohlc`).Scan(&ohlc)
	return
}

func (d *DB) SessionGet(token string) (created, expires int64, ok bool) {
	err := d.SQL.QueryRow(`SELECT created_at, expires_at FROM sessions WHERE token = ?`, token).Scan(&created, &expires)
	return created, expires, err == nil
}

func (d *DB) SessionSet(token string, created, expires int64) error {
	_, err := d.SQL.Exec(`INSERT OR REPLACE INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)`, token, created, expires)
	return err
}

func (d *DB) SessionDelete(token string) {
	_, _ = d.SQL.Exec(`DELETE FROM sessions WHERE token = ?`, token)
}

func (d *DB) SessionDeleteExpired(nowMillis int64) (int64, error) {
	res, err := d.SQL.Exec(`DELETE FROM sessions WHERE expires_at < ?`, nowMillis)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (d *DB) ListSplits(symbol string) ([]types.SplitEvent, error) {
	q := `SELECT date, factor FROM splits`
	var args []any
	if symbol != "" {
		q += ` WHERE ticker = ?`
		args = append(args, SafeTicker(symbol))
	}
	q += ` ORDER BY ticker, date`
	rows, err := d.SQL.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []types.SplitEvent
	for rows.Next() {
		var e types.SplitEvent
		if err := rows.Scan(&e.Date, &e.Factor); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	if out == nil {
		out = []types.SplitEvent{}
	}
	return out, nil
}

func (d *DB) AllSplits() (map[string][]types.SplitEvent, error) {
	rows, err := d.SQL.Query(`SELECT ticker, date, factor FROM splits ORDER BY ticker, date`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string][]types.SplitEvent{}
	for rows.Next() {
		var t string
		var e types.SplitEvent
		if err := rows.Scan(&t, &e.Date, &e.Factor); err != nil {
			return nil, err
		}
		out[t] = append(out[t], e)
	}
	return out, nil
}

func (d *DB) ReplaceSplits(symbol string, events []types.SplitEvent) error {
	ticker := SafeTicker(symbol)
	tx, err := d.SQL.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM splits WHERE ticker = ?`, ticker); err != nil {
		return err
	}
	for _, e := range events {
		if _, err := tx.Exec(`INSERT INTO splits (ticker, date, factor) VALUES (?, ?, ?)`, ticker, e.Date, e.Factor); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (d *DB) UpsertSplits(symbol string, events []types.SplitEvent) error {
	ticker := SafeTicker(symbol)
	for _, e := range events {
		if _, err := d.SQL.Exec(`INSERT INTO splits (ticker, date, factor) VALUES (?, ?, ?)
            ON CONFLICT(ticker, date) DO UPDATE SET factor=excluded.factor`, ticker, e.Date, e.Factor); err != nil {
			return err
		}
	}
	return nil
}

func (d *DB) DeleteSplit(symbol, date string) error {
	_, err := d.SQL.Exec(`DELETE FROM splits WHERE ticker = ? AND date = ?`, SafeTicker(symbol), date)
	return err
}

func (d *DB) DeleteSplits(symbol string) error {
	_, err := d.SQL.Exec(`DELETE FROM splits WHERE ticker = ?`, SafeTicker(symbol))
	return err
}

// DefaultCalendarJSON is the NYSE holiday calendar used when the store is empty.
const DefaultCalendarJSON = `{
  "metadata": {"version": "1.0", "description": "US Stock Market Holiday Calendar - NYSE Trading Days", "years": ["2025", "2026"]},
  "holidays": {
    "2025": {
      "01-01": {"name": "New Year's Day", "type": "holiday"},
      "01-20": {"name": "Martin Luther King Jr. Day", "type": "holiday"},
      "02-17": {"name": "Presidents' Day", "type": "holiday"},
      "04-18": {"name": "Good Friday", "type": "holiday"},
      "05-26": {"name": "Memorial Day", "type": "holiday"},
      "06-19": {"name": "Juneteenth", "type": "holiday"},
      "07-04": {"name": "Independence Day", "type": "holiday"},
      "09-01": {"name": "Labor Day", "type": "holiday"},
      "11-27": {"name": "Thanksgiving Day", "type": "holiday"},
      "12-25": {"name": "Christmas Day", "type": "holiday"}
    },
    "2026": {
      "01-01": {"name": "New Year's Day", "type": "holiday"},
      "01-19": {"name": "Martin Luther King Jr. Day", "type": "holiday"},
      "02-16": {"name": "Presidents' Day", "type": "holiday"},
      "04-03": {"name": "Good Friday", "type": "holiday"},
      "05-25": {"name": "Memorial Day", "type": "holiday"},
      "06-19": {"name": "Juneteenth", "type": "holiday"},
      "07-03": {"name": "Independence Day", "type": "holiday"},
      "09-07": {"name": "Labor Day", "type": "holiday"},
      "11-26": {"name": "Thanksgiving Day", "type": "holiday"},
      "12-25": {"name": "Christmas Day", "type": "holiday"}
    }
  },
  "shortDays": {
    "2025": {"12-24": {"name": "Christmas Eve", "type": "short"}},
    "2026": {"12-24": {"name": "Christmas Eve", "type": "short"}}
  },
  "weekends": {"description": "Выходные дни автоматически определяются"},
  "tradingHours": {"normal": {"start": "09:30", "end": "16:00"}, "short": {"start": "09:30", "end": "13:00"}}
}`

func CalendarHolidaysEmpty(raw json.RawMessage) bool {
	var cal struct {
		Holidays map[string]json.RawMessage `json:"holidays"`
	}
	if err := json.Unmarshal(raw, &cal); err != nil {
		return true
	}
	if len(cal.Holidays) == 0 {
		return true
	}
	for _, year := range cal.Holidays {
		var days map[string]json.RawMessage
		if json.Unmarshal(year, &days) == nil && len(days) > 0 {
			return false
		}
	}
	return true
}

func (d *DB) GetCalendar() (json.RawMessage, error) {
	var data string
	err := d.SQL.QueryRow(`SELECT data FROM calendar WHERE id = 1`).Scan(&data)
	if err == sql.ErrNoRows {
		return json.RawMessage(DefaultCalendarJSON), nil
	}
	if err != nil {
		return nil, err
	}
	return json.RawMessage(data), nil
}

func (d *DB) SaveCalendar(raw json.RawMessage) error {
	_, err := d.SQL.Exec(`INSERT INTO calendar (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`, string(raw))
	return err
}

func defaultSettings() map[string]any {
	return map[string]any{
		"watchThresholdPct":                 0.3,
		"resultsQuoteProvider":              "alpha_vantage",
		"enhancerProvider":                  "finnhub",
		"resultsRefreshProvider":            "finnhub",
		"enablePostClosePriceActualization": false,
		"indicatorPanePercent":              30,
		"defaultMultiTickerSymbols":         "SPY,QQQ,IWM",
		"autoTrading": map[string]any{
			"enabled": false, "provider": "finnhub", "lowIBS": 0.1, "highIBS": 0.75,
			"executionWindowSeconds": 90, "allowNewEntries": true, "allowExits": true,
			"onlyFromTelegramWatches": true, "symbols": "", "entrySizingMode": "balance",
			"entryCapitalMode": "standard_safe", "sizingMode": "notional", "fixedQuantity": 1,
			"fixedNotionalUsd": 1000, "maxPositionUsd": 0, "allowFractionalShares": false,
			"orderType": "MARKET", "timeInForce": "DAY", "supportTradingSession": "CORE",
			"maxSlippageBps": 25, "previewBeforeSend": true, "cancelOpenOrdersBeforeEntry": false,
			"notes": "", "lastModifiedAt": nil,
		},
	}
}

func (d *DB) Settings() map[string]any {
	defs := defaultSettings()
	var data string
	err := d.SQL.QueryRow(`SELECT data FROM settings WHERE id = 1`).Scan(&data)
	if err != nil {
		return defs
	}
	stored := map[string]any{}
	if json.Unmarshal([]byte(data), &stored) != nil {
		return defs
	}
	out := mergeMaps(defs, stored)
	if at, ok := out["autoTrading"].(map[string]any); ok {
		delete(at, "dryRun")
	}
	return out
}

// mergeMaps overlays src onto dst. Nested maps are merged key-by-key so a
// partial stored object (e.g. autoTrading) cannot wipe default nested keys.
// A stored null does not replace an existing nested map. Other top-level
// keys from src still override.
func mergeMaps(dst, src map[string]any) map[string]any {
	if dst == nil {
		dst = map[string]any{}
	}
	for k, sv := range src {
		if sv == nil {
			if _, isMap := dst[k].(map[string]any); isMap {
				continue
			}
			dst[k] = nil
			continue
		}
		sm, srcMap := sv.(map[string]any)
		dm, dstMap := dst[k].(map[string]any)
		if srcMap && dstMap {
			dst[k] = mergeMaps(dm, sm)
			continue
		}
		dst[k] = sv
	}
	return dst
}

func (d *DB) SaveSettings(s map[string]any) error {
	b, _ := json.Marshal(s)
	_, err := d.SQL.Exec(`INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`, string(b))
	return err
}

func (d *DB) ListWatches() ([]map[string]any, error) {
	rows, err := d.SQL.Query(`SELECT symbol, high_ibs, low_ibs, threshold_pct, chat_id, entry_price, entry_date, entry_ibs, entry_decision_time, current_trade_id, is_open_position FROM telegram_watches ORDER BY symbol`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var symbol string
		var high, low, thr float64
		var chat, entryDate, entryDec, tradeID sql.NullString
		var entryPrice, entryIBS sql.NullFloat64
		var open int
		if err := rows.Scan(&symbol, &high, &low, &thr, &chat, &entryPrice, &entryDate, &entryIBS, &entryDec, &tradeID, &open); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"symbol": symbol, "highIBS": high, "lowIBS": low, "thresholdPct": thr,
			"chatId": chat.String, "entryPrice": nullF(entryPrice), "entryDate": nullS(entryDate),
			"entryIBS": nullF(entryIBS), "entryDecisionTime": nullS(entryDec),
			"currentTradeId": nullS(tradeID), "isOpenPosition": open == 1,
		})
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out, nil
}

func nullF(v sql.NullFloat64) any {
	if !v.Valid {
		return nil
	}
	return v.Float64
}
func nullS(v sql.NullString) any {
	if !v.Valid {
		return nil
	}
	return v.String
}

func (d *DB) UpsertWatch(w map[string]any) error {
	symbol := SafeTicker(fmt.Sprint(w["symbol"]))
	high, _ := w["highIBS"].(float64)
	if high == 0 {
		high = 0.75
	}
	low, _ := w["lowIBS"].(float64)
	if low == 0 {
		low = 0.1
	}
	thr, _ := w["thresholdPct"].(float64)
	if thr == 0 {
		thr = 0.3
	}
	open := 0
	if v, ok := w["isOpenPosition"].(bool); ok && v {
		open = 1
	}
	chat := fmt.Sprint(w["chatId"])
	if chat == "<nil>" {
		chat = ""
	}
	_, err := d.SQL.Exec(`INSERT INTO telegram_watches (symbol, high_ibs, low_ibs, threshold_pct, chat_id, is_open_position, entry_price, entry_date, current_trade_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol) DO UPDATE SET high_ibs=excluded.high_ibs, low_ibs=excluded.low_ibs, threshold_pct=excluded.threshold_pct,
            chat_id=excluded.chat_id, is_open_position=excluded.is_open_position, entry_price=excluded.entry_price, entry_date=excluded.entry_date, current_trade_id=excluded.current_trade_id`,
		symbol, high, low, thr, chat, open, w["entryPrice"], w["entryDate"], w["currentTradeId"])
	return err
}

func (d *DB) DeleteWatch(symbol string) error {
	_, err := d.SQL.Exec(`DELETE FROM telegram_watches WHERE symbol = ?`, SafeTicker(symbol))
	return err
}

func tradeTable(table string) string {
	if table != "trades" && table != "broker_trades" {
		return "trades"
	}
	return table
}

func (d *DB) GetTrade(table, id string) map[string]any {
	table = tradeTable(table)
	linkedCol := "NULL"
	if table == "trades" {
		linkedCol = "linked_broker_trade_id"
	}
	row := d.SQL.QueryRow(`SELECT id, symbol, status, entry_date, exit_date, entry_price, exit_price, entry_ibs, exit_ibs, pnl_percent, pnl_absolute, holding_days, notes, source, is_hidden, is_test, quantity, `+linkedCol+` FROM `+table+` WHERE id=?`, id)
	var tid, symbol, status string
	var entryDate, exitDate, notes, source, linked sql.NullString
	var entryP, exitP, entryI, exitI, pnlP, pnlA, qty sql.NullFloat64
	var hold, hidden, test sql.NullInt64
	if err := row.Scan(&tid, &symbol, &status, &entryDate, &exitDate, &entryP, &exitP, &entryI, &exitI, &pnlP, &pnlA, &hold, &notes, &source, &hidden, &test, &qty, &linked); err != nil {
		return nil
	}
	return map[string]any{
		"id": tid, "symbol": symbol, "status": status,
		"entryDate": nullS(entryDate), "exitDate": nullS(exitDate),
		"entryPrice": nullF(entryP), "exitPrice": nullF(exitP),
		"entryIBS": nullF(entryI), "exitIBS": nullF(exitI),
		"pnlPercent": nullF(pnlP), "pnlAbsolute": nullF(pnlA),
		"holdingDays": hold.Int64, "notes": nullS(notes), "source": nullS(source),
		"isHidden": hidden.Int64 == 1, "isTest": test.Int64 == 1, "quantity": nullF(qty),
		"linkedBrokerTradeId": nullS(linked),
	}
}

func asFloat(v any) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case float32:
		return float64(t)
	case int:
		return float64(t)
	case int32:
		return float64(t)
	case int64:
		return float64(t)
	case json.Number:
		f, _ := t.Float64()
		return f
	case string:
		var f float64
		fmt.Sscanf(t, "%f", &f)
		return f
	default:
		return 0
	}
}

func round6(v float64) float64 {
	return float64(int(v*1e6+0.5)) / 1e6
}

// TradeCloseFields computes status, exit, P&L and holdingDays for a close.
// extra is copied on top (notes, exitIBS, ...). Dates are YYYY-MM-DD strings.
func TradeCloseFields(existing map[string]any, exitPrice float64, exitDate string, extra map[string]any) map[string]any {
	out := map[string]any{
		"status":    "closed",
		"exitPrice": exitPrice,
		"exitDate":  exitDate,
	}
	entryPrice := asFloat(existing["entryPrice"])
	if entryPrice > 0 {
		diff := exitPrice - entryPrice
		out["pnlAbsolute"] = round6(diff)
		out["pnlPercent"] = round6((diff / entryPrice) * 100)
	}
	hold := 0
	if ed := fmt.Sprint(existing["entryDate"]); ed != "" && ed != "<nil>" {
		n := tradingdate.DaysBetween(ed, exitDate)
		if n < 1 {
			n = 1
		}
		hold = n
	}
	out["holdingDays"] = hold
	for k, v := range extra {
		out[k] = v
	}
	return out
}

func (d *DB) CloseMonitorTrade(id string, rec map[string]any) (map[string]any, error) {
	existing := d.GetTrade("trades", id)
	if existing == nil {
		return nil, fmt.Errorf("Trade not found")
	}
	if fmt.Sprint(existing["status"]) != "open" {
		return existing, fmt.Errorf("Trade is already closed")
	}
	if linked := fmt.Sprint(existing["linkedBrokerTradeId"]); linked != "" && linked != "<nil>" {
		return existing, fmt.Errorf("Linked broker-backed monitor trades must be reconciled automatically")
	}
	note := strings.TrimSpace(fmt.Sprint(rec["note"]))
	if note == "" || note == "<nil>" {
		note = "manual_monitor_close_from_ui"
	}
	if prev := fmt.Sprint(existing["notes"]); prev != "" && prev != "<nil>" {
		note = prev + "\n" + note
	}
	extra := map[string]any{"notes": note}
	if rec["exitIBS"] != nil {
		extra["exitIBS"] = rec["exitIBS"]
	}
	exitDate := ""
	if rec != nil {
		exitDate = strings.TrimSpace(fmt.Sprint(rec["exitDate"]))
	}
	return d.CloseTradeByID("trades", id, asFloat(rec["exitPrice"]), exitDate, extra)
}

// CloseTradeByID closes a row in trades or broker_trades by id.
// Unlike CloseMonitorTrade it does not reject linked broker-backed trades.
func (d *DB) CloseTradeByID(table, id string, exitPrice float64, exitDate string, extra map[string]any) (map[string]any, error) {
	table = tradeTable(table)
	existing := d.GetTrade(table, id)
	if existing == nil {
		return nil, fmt.Errorf("Trade not found")
	}
	if fmt.Sprint(existing["status"]) != "open" {
		return existing, fmt.Errorf("Trade is already closed")
	}
	if !(exitPrice > 0) {
		return nil, fmt.Errorf("exitPrice must be a positive number")
	}
	exitDate = strings.TrimSpace(exitDate)
	if exitDate == "" || exitDate == "<nil>" {
		exitDate = tradingdate.TodayNYSE(time.Now())
	}
	fields := TradeCloseFields(existing, exitPrice, exitDate, extra)
	_, err := d.SQL.Exec(`UPDATE `+table+` SET status='closed', exit_date=?, exit_price=?, exit_ibs=COALESCE(?, exit_ibs), pnl_absolute=?, pnl_percent=?, holding_days=?, notes=COALESCE(?, notes) WHERE id=?`,
		fields["exitDate"], fields["exitPrice"], fields["exitIBS"], fields["pnlAbsolute"], fields["pnlPercent"], fields["holdingDays"], fields["notes"], id)
	if err != nil {
		return nil, err
	}
	return d.GetTrade(table, id), nil
}

func (d *DB) ListTrades(table string) ([]map[string]any, error) {
	if table != "trades" && table != "broker_trades" {
		table = "trades"
	}
	rows, err := d.SQL.Query(`SELECT id, symbol, status, entry_date, exit_date, entry_price, exit_price, entry_ibs, exit_ibs, pnl_percent, pnl_absolute, holding_days, notes, source, is_hidden, is_test, quantity FROM ` + table + ` ORDER BY entry_date DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, symbol, status string
		var entryDate, exitDate, notes, source sql.NullString
		var entryP, exitP, entryI, exitI, pnlP, pnlA, qty sql.NullFloat64
		var hold, hidden, test sql.NullInt64
		if err := rows.Scan(&id, &symbol, &status, &entryDate, &exitDate, &entryP, &exitP, &entryI, &exitI, &pnlP, &pnlA, &hold, &notes, &source, &hidden, &test, &qty); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"id": id, "symbol": symbol, "status": status,
			"entryDate": nullS(entryDate), "exitDate": nullS(exitDate),
			"entryPrice": nullF(entryP), "exitPrice": nullF(exitP),
			"entryIBS": nullF(entryI), "exitIBS": nullF(exitI),
			"pnlPercent": nullF(pnlP), "pnlAbsolute": nullF(pnlA),
			"holdingDays": hold.Int64, "notes": nullS(notes), "source": nullS(source),
			"isHidden": hidden.Int64 == 1, "isTest": test.Int64 == 1, "quantity": nullF(qty),
		})
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out, nil
}

func (d *DB) InsertTrade(table string, rec map[string]any) error {
	if table != "trades" && table != "broker_trades" {
		table = "trades"
	}
	id := fmt.Sprint(rec["id"])
	if id == "" || id == "<nil>" {
		id = fmt.Sprintf("t-%d", time.Now().UnixNano())
	}
	symbol := SafeTicker(fmt.Sprint(rec["symbol"]))
	status := fmt.Sprint(rec["status"])
	if status == "" || status == "<nil>" {
		status = "open"
	}
	_, err := d.SQL.Exec(`INSERT INTO `+table+` (id, symbol, status, entry_date, entry_price, notes, source, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, symbol, status, rec["entryDate"], rec["entryPrice"], rec["notes"], rec["source"], rec["quantity"])
	return err
}

func (d *DB) PatchTrade(table, id string, rec map[string]any) error {
	if table != "trades" && table != "broker_trades" {
		table = "trades"
	}
	_, err := d.SQL.Exec(`UPDATE `+table+` SET
        status=COALESCE(?, status),
        entry_date=COALESCE(?, entry_date),
        exit_date=COALESCE(?, exit_date),
        entry_price=COALESCE(?, entry_price),
        exit_price=COALESCE(?, exit_price),
        notes=COALESCE(?, notes)
        WHERE id=?`,
		rec["status"], rec["entryDate"], rec["exitDate"], rec["entryPrice"], rec["exitPrice"], rec["notes"], id)
	if err != nil {
		return err
	}
	if v, ok := rec["isHidden"]; ok && v != nil {
		n := 0
		switch t := v.(type) {
		case bool:
			if t {
				n = 1
			}
		case float64:
			if t != 0 {
				n = 1
			}
		case string:
			if t == "true" || t == "1" {
				n = 1
			}
		}
		_, err = d.SQL.Exec(`UPDATE `+table+` SET is_hidden=? WHERE id=?`, n, id)
	}
	return err
}

func (d *DB) DeleteTrade(table, id string) error {
	if table != "trades" && table != "broker_trades" {
		table = "trades"
	}
	_, err := d.SQL.Exec(`DELETE FROM `+table+` WHERE id = ?`, id)
	return err
}

func (d *DB) ListEMAAlerts() ([]map[string]any, error) {
	rows, err := d.SQL.Query(`SELECT id, symbol, ema_period, level_pct, direction, enabled,
        buy_level_pct, sell_level_pct, next_action, threshold_pct, info_level_pct, info_last_side
        FROM telegram_ema_alerts ORDER BY symbol`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, symbol, dir string
		var period, enabled int
		var level float64
		var buy, sell, thr, info sql.NullFloat64
		var next, infoSide sql.NullString
		if err := rows.Scan(&id, &symbol, &period, &level, &dir, &enabled, &buy, &sell, &next, &thr, &info, &infoSide); err != nil {
			return nil, err
		}
		row := map[string]any{"id": id, "symbol": symbol, "emaPeriod": period, "levelPct": level, "direction": dir, "enabled": enabled == 1}
		if buy.Valid {
			row["buyLevelPct"] = buy.Float64
		}
		if sell.Valid {
			row["sellLevelPct"] = sell.Float64
		}
		if next.Valid && next.String != "" {
			row["nextAction"] = next.String
		}
		if thr.Valid {
			row["thresholdPct"] = thr.Float64
		}
		if info.Valid {
			row["infoLevelPct"] = info.Float64
		}
		if infoSide.Valid {
			row["infoLastSide"] = infoSide.String
		}
		out = append(out, row)
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out, nil
}

func (d *DB) UpsertEMAAlert(rec map[string]any) (string, error) {
	id := fmt.Sprint(rec["id"])
	if id == "" || id == "<nil>" {
		id = fmt.Sprintf("ema-%d", time.Now().UnixNano())
	}
	symbol := SafeTicker(fmt.Sprint(rec["symbol"]))
	next := rec["nextAction"]
	if next == nil || fmt.Sprint(next) == "" {
		next = "buy"
	}
	if rec["levelPct"] == nil {
		if fmt.Sprint(next) == "sell" {
			rec["levelPct"] = rec["sellLevelPct"]
		} else {
			rec["levelPct"] = rec["buyLevelPct"]
		}
	}
	if rec["levelPct"] == nil {
		rec["levelPct"] = 0.0
	}
	if rec["thresholdPct"] == nil {
		rec["thresholdPct"] = 0.5
	}
	if rec["direction"] == nil || fmt.Sprint(rec["direction"]) == "" {
		if fmt.Sprint(next) == "sell" {
			rec["direction"] = "above"
		} else {
			rec["direction"] = "below"
		}
	}
	_, err := d.SQL.Exec(`INSERT INTO telegram_ema_alerts (id, symbol, ema_period, level_pct, direction, enabled, buy_level_pct, sell_level_pct, next_action, threshold_pct, info_level_pct)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET symbol=excluded.symbol, ema_period=excluded.ema_period, level_pct=excluded.level_pct, direction=excluded.direction,
            buy_level_pct=excluded.buy_level_pct, sell_level_pct=excluded.sell_level_pct, next_action=excluded.next_action, threshold_pct=excluded.threshold_pct,
            info_level_pct=excluded.info_level_pct, updated_at=datetime('now')`,
		id, symbol, rec["emaPeriod"], rec["levelPct"], rec["direction"], rec["buyLevelPct"], rec["sellLevelPct"], next, rec["thresholdPct"], rec["infoLevelPct"])
	return id, err
}

func (d *DB) GetEMAAlert(id string) map[string]any {
	list, _ := d.ListEMAAlerts()
	for _, a := range list {
		if fmt.Sprint(a["id"]) == id {
			return a
		}
	}
	return nil
}

func (d *DB) MarkEMATriggered(id, action string, deviationPct float64, at string) error {
	next := "sell"
	if action == "sell" {
		next = "buy"
	}
	_, err := d.SQL.Exec(`UPDATE telegram_ema_alerts SET next_action=?, last_triggered_action=?, last_triggered_at=?, last_triggered_deviation_pct=?, updated_at=datetime('now') WHERE id=?`,
		next, action, at, deviationPct, id)
	return err
}

func (d *DB) RecordEMAInfoSide(id, side, at string) error {
	_, err := d.SQL.Exec(`UPDATE telegram_ema_alerts SET info_last_side=?, info_last_notified_at=COALESCE(?, info_last_notified_at), updated_at=datetime('now') WHERE id=?`,
		side, at, id)
	return err
}

func (d *DB) DeleteEMAAlert(id string) error {
	_, err := d.SQL.Exec(`DELETE FROM telegram_ema_alerts WHERE id = ?`, id)
	return err
}

func (d *DB) DatasetExists(id string) bool {
	ticker := SafeTicker(id)
	var n int
	err := d.SQL.QueryRow(`SELECT COUNT(*) FROM dataset_meta WHERE ticker = ?`, ticker).Scan(&n)
	return err == nil && n > 0
}

func (d *DB) GetOHLC(id string) ([]types.OHLC, bool, error) {
	ds, err := d.GetDataset(id)
	if err != nil || ds == nil {
		return nil, false, err
	}
	data, _ := ds["data"].([]types.OHLC)
	adj, _ := ds["adjustedForSplits"].(bool)
	return data, adj, nil
}

// GetOHLCLast returns the last n bars in chronological order without loading
// the full history. Missing ticker yields nil, false, nil like GetOHLC.
func (d *DB) GetOHLCLast(ticker string, n int) ([]types.OHLC, bool, error) {
	ticker = SafeTicker(ticker)
	var adj int
	err := d.SQL.QueryRow(`SELECT adjusted_for_splits FROM dataset_meta WHERE ticker = ?`, ticker).Scan(&adj)
	if err == sql.ErrNoRows {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if n <= 0 {
		return []types.OHLC{}, adj == 1, nil
	}
	rows, err := d.SQL.Query(`SELECT date, open, high, low, close, adj_close, volume FROM ohlc WHERE ticker = ? ORDER BY date DESC LIMIT ?`, ticker, n)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	var data []types.OHLC
	for rows.Next() {
		var b types.OHLC
		var adjC sql.NullFloat64
		var vol sql.NullInt64
		if err := rows.Scan(&b.Date, &b.Open, &b.High, &b.Low, &b.Close, &adjC, &vol); err != nil {
			return nil, false, err
		}
		if adjC.Valid {
			v := adjC.Float64
			b.AdjClose = &v
		}
		if vol.Valid {
			b.Volume = float64(vol.Int64)
		}
		data = append(data, b)
	}
	for i, j := 0, len(data)-1; i < j; i, j = i+1, j-1 {
		data[i], data[j] = data[j], data[i]
	}
	if data == nil {
		data = []types.OHLC{}
	}
	return data, adj == 1, nil
}

// GetLastOHLC is an alias for GetOHLCLast.
func (d *DB) GetLastOHLC(ticker string, n int) ([]types.OHLC, bool, error) {
	return d.GetOHLCLast(ticker, n)
}

func (d *DB) UpdateDatasetMetadata(id string, tag, company *string) error {
	ticker := SafeTicker(id)
	if ticker == "" {
		return fmt.Errorf("Invalid ticker")
	}
	var curTag, curCompany sql.NullString
	err := d.SQL.QueryRow(`SELECT tag, company_name FROM dataset_meta WHERE ticker = ?`, ticker).Scan(&curTag, &curCompany)
	if err == sql.ErrNoRows {
		return sql.ErrNoRows
	}
	if err != nil {
		return err
	}
	newTag := curTag
	newCompany := curCompany
	if tag != nil {
		if *tag == "" {
			newTag = sql.NullString{}
		} else {
			newTag = sql.NullString{String: *tag, Valid: true}
		}
	}
	if company != nil {
		if *company == "" {
			newCompany = sql.NullString{}
		} else {
			newCompany = sql.NullString{String: *company, Valid: true}
		}
	}
	_, err = d.SQL.Exec(`UPDATE dataset_meta SET tag = ?, company_name = ?, updated_at = datetime('now') WHERE ticker = ?`, newTag, newCompany, ticker)
	return err
}

func (d *DB) ListTickers() ([]string, error) {
	rows, err := d.SQL.Query(`SELECT ticker FROM dataset_meta ORDER BY ticker`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, nil
}

type WebullTokenRow struct {
	Token               string
	LastCheckStatus     string
	LastHealthCheckDate string
	LastAttemptAt       string
	ExpiresAt           string
	LastCheckAt         string
}

func (d *DB) GetWebullToken() WebullTokenRow {
	var row WebullTokenRow
	_ = d.SQL.QueryRow(`SELECT COALESCE(token,''), COALESCE(last_check_status,''), COALESCE(last_health_check_date,''), COALESCE(last_health_check_attempt_at,''), COALESCE(expires_at,''), COALESCE(last_check_at,'') FROM webull_token WHERE id='current'`).
		Scan(&row.Token, &row.LastCheckStatus, &row.LastHealthCheckDate, &row.LastAttemptAt, &row.ExpiresAt, &row.LastCheckAt)
	return row
}

func (d *DB) UpsertWebullHealth(todayET, status, attemptAt string) error {
	_, err := d.SQL.Exec(`INSERT INTO webull_token (id, last_check_status, last_health_check_date, last_health_check_attempt_at, updated_at)
        VALUES ('current', ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET last_check_status=excluded.last_check_status,
            last_health_check_date=excluded.last_health_check_date,
            last_health_check_attempt_at=excluded.last_health_check_attempt_at,
            updated_at=datetime('now')`, status, todayET, attemptAt)
	return err
}
