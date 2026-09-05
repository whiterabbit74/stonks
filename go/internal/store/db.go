package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
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

// SchemaVersion is the schema this binary can open and migrate to.
// Bump it when adding a migrateSchema step. Open fails if the database is newer.
const SchemaVersion = 3

type DB struct {
	SQL *sql.DB
	mu  sync.Mutex
}

func Open(path string) (*DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
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
	d := &DB{SQL: sqlDB}
	if err := d.initSchema(); err != nil {
		sqlDB.Close()
		return nil, err
	}
	restrictDBPerms(path)
	return d, nil
}

// restrictDBPerms tightens the database files to owner-only. The file holds the
// Webull token and the Robinhood OAuth pair in the clear, so it must not be
// looser than the .env that carries the same secrets (0600 on the VPS); umask
// alone usually leaves it world-readable. Best effort: a permission we cannot
// set is not a reason to refuse to start. The -wal and -shm siblings are
// created by SQLite itself and carry the same data.
func restrictDBPerms(path string) {
	if err := os.Chmod(filepath.Dir(path), 0o700); err != nil && !os.IsNotExist(err) {
		log.Printf("store: chmod db dir: %v", err)
	}
	for _, p := range []string{path, path + "-wal", path + "-shm"} {
		if err := os.Chmod(p, 0o600); err != nil && !os.IsNotExist(err) {
			log.Printf("store: chmod %s: %v", filepath.Base(p), err)
		}
	}
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
            broker              TEXT NOT NULL DEFAULT 'webull',
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
            last_check_raw        TEXT,
            last_check_at         TEXT,
            last_health_check_date TEXT,
            last_health_check_attempt_at TEXT,
            updated_at            TEXT
        );
        CREATE TABLE IF NOT EXISTS robinhood_oauth (
            id                  TEXT PRIMARY KEY CHECK (id = 'current'),
            client_id           TEXT,
            access_token        TEXT,
            refresh_token       TEXT,
            token_type          TEXT,
            scope               TEXT,
            expires_at          TEXT,
            account_number      TEXT,
            last_check_status   TEXT,
            last_check_at       TEXT,
            last_alerted_status TEXT,
            last_alerted_at     TEXT,
            last_health_check_date       TEXT,
            last_health_check_attempt_at TEXT,
            created_at          TEXT,
            updated_at          TEXT
        );
        CREATE TABLE IF NOT EXISTS robinhood_oauth_pending (
            state         TEXT PRIMARY KEY,
            code_verifier TEXT NOT NULL,
            redirect_uri  TEXT NOT NULL,
            created_at    TEXT NOT NULL
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
            broker          TEXT NOT NULL DEFAULT 'webull',
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
            t1_lease_until TEXT,
            t1_execution_finished INTEGER NOT NULL DEFAULT 0,
            missed_t1_reported INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (date_key, chat_id)
        );
    `)
	if err != nil {
		return err
	}
	return d.migrateSchema()
}

type schemaExecer interface {
	Exec(query string, args ...any) (sql.Result, error)
	Query(query string, args ...any) (*sql.Rows, error)
}

func (d *DB) migrateSchema() error {
	tx, err := d.SQL.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`CREATE TABLE IF NOT EXISTS schema_meta (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL)`); err != nil {
		return err
	}

	var version int
	err = tx.QueryRow(`SELECT version FROM schema_meta WHERE id = 1`).Scan(&version)
	if err == sql.ErrNoRows {
		version = 0
	} else if err != nil {
		return err
	}

	if version > SchemaVersion {
		return fmt.Errorf("database schema version %d is newer than code version %d", version, SchemaVersion)
	}
	if version == SchemaVersion {
		return tx.Commit()
	}

	if err := applyPendingSchema(tx, version); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO schema_meta (id, version) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET version=excluded.version`, SchemaVersion); err != nil {
		return err
	}
	return tx.Commit()
}

func applyPendingSchema(e schemaExecer, from int) error {
	if from < 2 {
		for _, col := range []struct{ table, name, typ string }{
			{"order_trackers", "attempts", "INTEGER NOT NULL DEFAULT 0"},
			{"order_trackers", "updated_at", "TEXT"},
			{"autotrade_logs", "kind", "TEXT NOT NULL DEFAULT ''"},
			{"order_trackers", "broker", "TEXT NOT NULL DEFAULT 'webull'"},
			{"broker_trades", "broker", "TEXT NOT NULL DEFAULT 'webull'"},
			{"webull_token", "last_alerted_status", "TEXT"},
			{"webull_token", "last_alerted_at", "TEXT"},
			{"webull_token", "last_check_raw", "TEXT"},
			{"aggregate_send_state", "t1_lease_until", "TEXT"},
			{"aggregate_send_state", "t1_execution_finished", "INTEGER NOT NULL DEFAULT 0"},
		} {
			if err := ensureColumn(e, col.table, col.name, col.typ); err != nil {
				return err
			}
		}
		if _, err := e.Exec(`CREATE INDEX IF NOT EXISTS idx_broker_trades_broker_status ON broker_trades(broker, status)`); err != nil {
			return err
		}
	}
	if from < 3 {
		if err := ensureColumn(e, "aggregate_send_state", "missed_t1_reported", "INTEGER NOT NULL DEFAULT 0"); err != nil {
			return err
		}
	}
	return nil
}

func (d *DB) HasColumn(table, col string) bool {
	return d.hasColumn(table, col)
}

func (d *DB) hasColumn(table, col string) bool {
	return hasColumn(d.SQL, table, col)
}

func hasColumn(q schemaExecer, table, col string) bool {
	rows, err := q.Query(`PRAGMA table_info(` + table + `)`)
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

func ensureColumn(q schemaExecer, table, col, typ string) error {
	if hasColumn(q, table, col) {
		return nil
	}
	_, err := q.Exec(`ALTER TABLE ` + table + ` ADD COLUMN ` + col + ` ` + typ)
	return err
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
	if _, err := tx.Exec(`DELETE FROM splits WHERE ticker = ?`, ticker); err != nil {
		return err
	}
	return tx.Commit()
}

func (d *DB) Counts() (datasets, ohlc int) {
	_ = d.SQL.QueryRow(`SELECT COUNT(*) FROM dataset_meta`).Scan(&datasets)
	_ = d.SQL.QueryRow(`SELECT COUNT(*) FROM ohlc`).Scan(&ohlc)
	return
}

func (d *DB) SessionGet(token string) (created, expires int64, err error) {
	err = d.SQL.QueryRow(`SELECT created_at, expires_at FROM sessions WHERE token = ?`, token).Scan(&created, &expires)
	return created, expires, err
}

func (d *DB) SessionSet(token string, created, expires int64) error {
	_, err := d.SQL.Exec(`INSERT OR REPLACE INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)`, token, created, expires)
	return err
}

func (d *DB) SessionDelete(token string) error {
	_, err := d.SQL.Exec(`DELETE FROM sessions WHERE token = ?`, token)
	return err
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
	tx, err := d.SQL.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, e := range events {
		if _, err := tx.Exec(`INSERT INTO splits (ticker, date, factor) VALUES (?, ?, ?)
            ON CONFLICT(ticker, date) DO UPDATE SET factor=excluded.factor`, ticker, e.Date, e.Factor); err != nil {
			return err
		}
	}
	return tx.Commit()
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
  "metadata": {"version": "1.0", "description": "US Stock Market Holiday Calendar - NYSE Trading Days", "years": ["2025", "2026", "2027"]},
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
    "2027": {
      "01-01": {"name": "New Year's Day", "type": "holiday"},
      "01-18": {"name": "Martin Luther King Jr. Day", "type": "holiday"},
      "02-15": {"name": "Presidents' Day", "type": "holiday"},
      "03-26": {"name": "Good Friday", "type": "holiday"},
      "05-31": {"name": "Memorial Day", "type": "holiday"},
      "06-18": {"name": "Juneteenth", "type": "holiday"},
      "07-05": {"name": "Independence Day", "type": "holiday"},
      "09-06": {"name": "Labor Day", "type": "holiday"},
      "11-25": {"name": "Thanksgiving Day", "type": "holiday"},
      "12-24": {"name": "Christmas Day", "type": "holiday"}
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
    "2025": {
      "07-03": {"name": "Independence Day Eve", "type": "short"},
      "11-28": {"name": "Day After Thanksgiving", "type": "short"},
      "12-24": {"name": "Christmas Eve", "type": "short"}
    },
    "2026": {
      "11-27": {"name": "Day After Thanksgiving", "type": "short"},
      "12-24": {"name": "Christmas Eve", "type": "short"}
    },
    "2027": {
      "11-26": {"name": "Day After Thanksgiving", "type": "short"}
    }
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
		"initialCapital":                    10000,
		// The strategy has exactly one shape: at the close, buy the weakest
		// monitored ticker with the whole account, sell it when IBS recovers.
		// Everything the operator can still choose is here; anything that used
		// to describe a different strategy (fixed share counts, notional caps,
		// limit orders, GTC, extended sessions) was removed rather than left as
		// a knob that quietly contradicts the backtest.
		"autoTrading": map[string]any{
			"enabled": false, "provider": "finnhub", "lowIBS": 0.1, "highIBS": 0.75,
			"executionWindowSeconds": 90,
			"entryCapitalMode":       "standard_safe",
			// No preset "enabled" here: an explicit false would make
			// brokerFlags() treat webull as configured (cfgHas) and stop
			// falling back to the top-level enabled/allowNewEntries/allowExits
			// flags, which is exactly the fallback P2-2 relies on for a
			// database that has never saved a per-broker object yet.
			"brokers": map[string]any{
				"webull":    map[string]any{},
				"robinhood": map[string]any{},
			},
			"maxSlippageBps": 25, "lastModifiedAt": nil,
		},
	}
}

// extraStoredSettingsKeys live in the settings blob but are not defaults:
// secrets and counters the GET/PUT path or the live/scheduler writers persist.
// Broker allow flags (webullAllowEntries and friends) are not settings keys.
var extraStoredSettingsKeys = []string{
	"polygonApiKey",
	"initialCapital",
	"commissionType",
	"commissionFixed",
	"commissionPercentage",
	"lastActualizationDate",
	"lastActualizationAttemptDate",
	"lastActualizationAttemptCount",
	"trackerPersistFail",
	"lastAutotradeLogPruneDate",
	"autotradeLogRetentionDays",
	"autotradeLogMaxRows",
	"lastMissedT1Date",
	"lastCalendarImportDate",
}

var allowedSettingsKeys = func() map[string]struct{} {
	m := make(map[string]struct{}, 24)
	for k := range defaultSettings() {
		m[k] = struct{}{}
	}
	for _, k := range extraStoredSettingsKeys {
		m[k] = struct{}{}
	}
	return m
}()

// AllowedSettingsKey reports whether k may live in the settings JSON blob.
// PATCH/PUT /api/settings reject anything else with 400.
func AllowedSettingsKey(k string) bool {
	_, ok := allowedSettingsKeys[k]
	return ok
}

func sanitizeSettings(s map[string]any) map[string]any {
	if s == nil {
		return map[string]any{}
	}
	out := make(map[string]any, len(s))
	for k, v := range s {
		if _, ok := allowedSettingsKeys[k]; ok {
			out[k] = v
		}
	}
	return out
}

func (d *DB) SettingsErr() (map[string]any, error) {
	defs := defaultSettings()
	var data string
	err := d.SQL.QueryRow(`SELECT data FROM settings WHERE id = 1`).Scan(&data)
	if err == sql.ErrNoRows {
		return defs, nil
	}
	if err != nil {
		return nil, err
	}
	stored := map[string]any{}
	if json.Unmarshal([]byte(data), &stored) != nil {
		return defs, nil
	}
	out := mergeMaps(defs, sanitizeSettings(stored))
	if at, ok := out["autoTrading"].(map[string]any); ok {
		delete(at, "dryRun")
	}
	return out, nil
}

func (d *DB) Settings() map[string]any {
	s, err := d.SettingsErr()
	if err != nil {
		return defaultSettings()
	}
	return s
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
	b, _ := json.Marshal(sanitizeSettings(s))
	_, err := d.SQL.Exec(`INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`, string(b))
	return err
}

// SetSettingsKeys overlays the given top-level keys onto the stored settings
// blob in one BEGIN IMMEDIATE transaction so concurrent writers of different
// keys cannot clobber each other. Defaults are merged only on read via Settings.
func (d *DB) SetSettingsKeys(kv map[string]any) error {
	if d == nil || d.SQL == nil {
		return fmt.Errorf("settings store not open")
	}
	ctx := context.Background()
	conn, err := d.SQL.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, `BEGIN IMMEDIATE`); err != nil {
		return err
	}
	committed := false
	defer func() {
		if !committed {
			_, _ = conn.ExecContext(ctx, `ROLLBACK`)
		}
	}()
	stored := map[string]any{}
	var data string
	err = conn.QueryRowContext(ctx, `SELECT data FROM settings WHERE id = 1`).Scan(&data)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	if err == nil && data != "" {
		if json.Unmarshal([]byte(data), &stored) != nil {
			stored = map[string]any{}
		}
	}
	for k, v := range kv {
		stored[k] = v
	}
	b, err := json.Marshal(sanitizeSettings(stored))
	if err != nil {
		return err
	}
	if _, err := conn.ExecContext(ctx, `INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`, string(b)); err != nil {
		return err
	}
	if _, err := conn.ExecContext(ctx, `COMMIT`); err != nil {
		return err
	}
	committed = true
	return nil
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

func watchFloatOrDefault(w map[string]any, key string, def float64) float64 {
	v, ok := w[key]
	if !ok || v == nil {
		return def
	}
	return asFloat(v)
}

func watchChatID(w map[string]any) string {
	v, ok := w["chatId"]
	if !ok || v == nil {
		return ""
	}
	s := fmt.Sprint(v)
	if s == "<nil>" {
		return ""
	}
	return s
}

func watchOpenFlag(v any) int {
	switch t := v.(type) {
	case bool:
		if t {
			return 1
		}
		return 0
	default:
		if asFloat(v) != 0 {
			return 1
		}
		return 0
	}
}

// watchPatchColumns is the whitelist of JSON keys PatchWatch may write.
// Position columns are included so the live engine can update an open
// position without going through UpsertWatch (which never clobbers them).
var watchPatchColumns = map[string]string{
	"highIBS":           "high_ibs",
	"lowIBS":            "low_ibs",
	"thresholdPct":      "threshold_pct",
	"chatId":            "chat_id",
	"isOpenPosition":    "is_open_position",
	"entryPrice":        "entry_price",
	"entryDate":         "entry_date",
	"entryIBS":          "entry_ibs",
	"entryDecisionTime": "entry_decision_time",
	"currentTradeId":    "current_trade_id",
}

var watchNumericPatch = map[string]bool{
	"highIBS": true, "lowIBS": true, "thresholdPct": true,
	"entryPrice": true, "entryIBS": true,
}

var watchCreatePatchKeys = []string{"highIBS", "lowIBS", "thresholdPct", "chatId"}

func (d *DB) UpsertWatch(w map[string]any) error {
	symbol := SafeTicker(fmt.Sprint(w["symbol"]))
	if symbol == "" {
		return fmt.Errorf("symbol required")
	}
	var n int
	if err := d.SQL.QueryRow(`SELECT COUNT(1) FROM telegram_watches WHERE symbol = ?`, symbol).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		patch := map[string]any{}
		for _, k := range watchCreatePatchKeys {
			if _, ok := w[k]; ok {
				patch[k] = w[k]
			}
		}
		if len(patch) == 0 {
			return nil
		}
		return d.PatchWatch(symbol, patch)
	}
	high := watchFloatOrDefault(w, "highIBS", 0.75)
	low := watchFloatOrDefault(w, "lowIBS", 0.1)
	thr := watchFloatOrDefault(w, "thresholdPct", 0.3)
	open := 0
	if v, ok := w["isOpenPosition"]; ok {
		open = watchOpenFlag(v)
	}
	_, err := d.SQL.Exec(`INSERT INTO telegram_watches (symbol, high_ibs, low_ibs, threshold_pct, chat_id, is_open_position, entry_price, entry_date, current_trade_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		symbol, high, low, thr, watchChatID(w), open, w["entryPrice"], w["entryDate"], w["currentTradeId"])
	return err
}

func (d *DB) PatchWatch(symbol string, fields map[string]any) error {
	symbol = SafeTicker(symbol)
	if symbol == "" {
		return fmt.Errorf("symbol required")
	}
	var sets []string
	var args []any
	for key, col := range watchPatchColumns {
		v, ok := fields[key]
		if !ok {
			continue
		}
		sets = append(sets, col+"=?")
		switch {
		case key == "isOpenPosition":
			args = append(args, watchOpenFlag(v))
		case key == "chatId":
			if v == nil {
				args = append(args, "")
			} else {
				args = append(args, watchChatID(map[string]any{"chatId": v}))
			}
		case v == nil:
			args = append(args, nil)
		case watchNumericPatch[key]:
			args = append(args, asFloat(v))
		default:
			args = append(args, v)
		}
	}
	if len(sets) == 0 {
		return fmt.Errorf("no patchable fields")
	}
	args = append(args, symbol)
	res, err := d.SQL.Exec(`UPDATE telegram_watches SET `+strings.Join(sets, ", ")+` WHERE symbol = ?`, args...)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("watch %s not found", symbol)
	}
	return nil
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

func (d *DB) LinkMonitorToBrokerTrade(monitorID, brokerTradeID string) error {
	_, err := d.SQL.Exec(`UPDATE trades SET linked_broker_trade_id=? WHERE id=?`, brokerTradeID, monitorID)
	return err
}

func (d *DB) GetTrade(table, id string) (map[string]any, error) {
	table = tradeTable(table)
	linkedCol := "NULL"
	brokerCol := "''"
	if table == "trades" {
		linkedCol = "linked_broker_trade_id"
	}
	if table == "broker_trades" {
		brokerCol = "broker"
	}
	row := d.SQL.QueryRow(`SELECT id, symbol, status, entry_date, exit_date, entry_price, exit_price, entry_ibs, exit_ibs, pnl_percent, pnl_absolute, holding_days, notes, source, is_hidden, is_test, quantity, `+linkedCol+`, `+brokerCol+` FROM `+table+` WHERE id=?`, id)
	var tid, symbol, status string
	var entryDate, exitDate, notes, source, linked, broker sql.NullString
	var entryP, exitP, entryI, exitI, pnlP, pnlA, qty sql.NullFloat64
	var hold, hidden, test sql.NullInt64
	if err := row.Scan(&tid, &symbol, &status, &entryDate, &exitDate, &entryP, &exitP, &entryI, &exitI, &pnlP, &pnlA, &hold, &notes, &source, &hidden, &test, &qty, &linked, &broker); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
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
		"broker":              nullS(broker),
	}, nil
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
	existing, err := d.GetTrade("trades", id)
	if err != nil {
		return nil, err
	}
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
	existing, err := d.GetTrade(table, id)
	if err != nil {
		return nil, err
	}
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
	_, err = d.SQL.Exec(`UPDATE `+table+` SET status='closed', exit_date=?, exit_price=?, exit_ibs=COALESCE(?, exit_ibs), pnl_absolute=?, pnl_percent=?, holding_days=?, notes=COALESCE(?, notes) WHERE id=?`,
		fields["exitDate"], fields["exitPrice"], fields["exitIBS"], fields["pnlAbsolute"], fields["pnlPercent"], fields["holdingDays"], fields["notes"], id)
	if err != nil {
		return nil, err
	}
	return d.GetTrade(table, id)
}

func (d *DB) ListTrades(table string) ([]map[string]any, error) {
	if table != "trades" && table != "broker_trades" {
		table = "trades"
	}
	brokerExpr := "''"
	if table == "broker_trades" {
		brokerExpr = "broker"
	}
	rows, err := d.SQL.Query(`SELECT id, symbol, status, entry_date, exit_date, entry_price, exit_price, entry_ibs, exit_ibs, pnl_percent, pnl_absolute, holding_days, notes, source, is_hidden, is_test, quantity, ` + brokerExpr + ` FROM ` + table + ` ORDER BY entry_date DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, symbol, status string
		var entryDate, exitDate, notes, source, broker sql.NullString
		var entryP, exitP, entryI, exitI, pnlP, pnlA, qty sql.NullFloat64
		var hold, hidden, test sql.NullInt64
		if err := rows.Scan(&id, &symbol, &status, &entryDate, &exitDate, &entryP, &exitP, &entryI, &exitI, &pnlP, &pnlA, &hold, &notes, &source, &hidden, &test, &qty, &broker); err != nil {
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
			"broker": nullS(broker),
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
	if table == "broker_trades" {
		broker := fmt.Sprint(rec["broker"])
		if broker == "" || broker == "<nil>" {
			broker = "webull"
		}
		_, err := d.SQL.Exec(`INSERT INTO broker_trades (id, symbol, status, entry_date, entry_price, notes, source, quantity, broker) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			id, symbol, status, rec["entryDate"], rec["entryPrice"], rec["notes"], rec["source"], rec["quantity"], broker)
		return err
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

func (d *DB) GetEMAAlert(id string) (map[string]any, error) {
	list, err := d.ListEMAAlerts()
	if err != nil {
		return nil, err
	}
	for _, a := range list {
		if fmt.Sprint(a["id"]) == id {
			return a, nil
		}
	}
	return nil, nil
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
	LastCheckRaw        string
	LastHealthCheckDate string
	LastAttemptAt       string
	ExpiresAt           string
	LastCheckAt         string
	LastAlertedStatus   string
	LastAlertedAt       string
}

func (d *DB) GetWebullToken() WebullTokenRow {
	var row WebullTokenRow
	_ = d.SQL.QueryRow(`SELECT COALESCE(token,''), COALESCE(last_check_status,''), COALESCE(last_check_raw,''), COALESCE(last_health_check_date,''), COALESCE(last_health_check_attempt_at,''), COALESCE(expires_at,''), COALESCE(last_check_at,''), COALESCE(last_alerted_status,''), COALESCE(last_alerted_at,'') FROM webull_token WHERE id='current'`).
		Scan(&row.Token, &row.LastCheckStatus, &row.LastCheckRaw, &row.LastHealthCheckDate, &row.LastAttemptAt, &row.ExpiresAt, &row.LastCheckAt, &row.LastAlertedStatus, &row.LastAlertedAt)
	return row
}

// UpsertWebullHealth records the classified health status (OK/NEEDS_REAUTH/
// MISSING/UNREACHABLE/EXPIRING_SOON — the vocabulary CanSubmit/executeAll gate
// on) plus the raw word Webull's check actually returned, and marks today's
// scheduled health check as done. See SaveWebullTokenChecked.
func (d *DB) UpsertWebullHealth(todayET, status, raw, attemptAt string) error {
	_, err := d.SQL.Exec(`INSERT INTO webull_token (id, last_check_status, last_check_raw, last_health_check_date, last_health_check_attempt_at, updated_at)
        VALUES ('current', ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET last_check_status=excluded.last_check_status,
            last_check_raw=excluded.last_check_raw,
            last_health_check_date=excluded.last_health_check_date,
            last_health_check_attempt_at=excluded.last_health_check_attempt_at,
            updated_at=datetime('now')`, status, raw, todayET, attemptAt)
	return err
}
