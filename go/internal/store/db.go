package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	_ "modernc.org/sqlite"

	"mktorder.com/go/internal/tradingdate"
	"mktorder.com/go/internal/types"
)

// SchemaVersion is the schema this binary can open and migrate to.
// Bump it when adding a migrateSchema step. Open fails if the database is newer.
const SchemaVersion = 10

type DB struct {
	SQL *sql.DB
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

// OpenReadOnly opens an existing database for reading only: a missing path is
// an error rather than a new empty database, no schema step runs and no
// permission changes. Open does all three, so a dry run of closepos could
// migrate a database an older server was still using (AUD-182).
func OpenReadOnly(path string) (*DB, error) {
	if _, err := os.Stat(path); err != nil {
		return nil, err
	}
	sqlDB, err := sql.Open("sqlite", path+"?_pragma=query_only(1)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(1)
	if err := sqlDB.Ping(); err != nil {
		sqlDB.Close()
		return nil, err
	}
	return &DB{SQL: sqlDB}, nil
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
            applied INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (ticker, date)
        );
        CREATE INDEX IF NOT EXISTS idx_splits_ticker ON splits(ticker);
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
        CREATE TABLE IF NOT EXISTS auth_credential (
            id          INTEGER PRIMARY KEY CHECK (id = 1),
            fingerprint TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS positions (
            id                  TEXT PRIMARY KEY,
            symbol              TEXT NOT NULL,
            status              TEXT NOT NULL DEFAULT 'open',
            entry_date          TEXT,
            entry_price         REAL,
            entry_ibs           REAL,
            entry_decision_time TEXT,
            exit_date           TEXT,
            exit_price          REAL,
            exit_ibs            REAL,
            exit_decision_time  TEXT,
            quantity            REAL,
            pnl_percent         REAL,
            pnl_absolute        REAL,
            holding_days        INTEGER,
            source              TEXT DEFAULT 'auto',
            notes               TEXT,
            is_hidden           INTEGER NOT NULL DEFAULT 0,
            is_test             INTEGER NOT NULL DEFAULT 0,
            webull_qty              REAL NOT NULL DEFAULT 0,
            webull_entry_price      REAL,
            webull_exit_price       REAL,
            webull_entry_order_id   TEXT,
            webull_exit_order_id    TEXT,
            rh_qty              REAL NOT NULL DEFAULT 0,
            rh_entry_price      REAL,
            rh_exit_price       REAL,
            rh_entry_order_id   TEXT,
            rh_exit_order_id    TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
        CREATE INDEX IF NOT EXISTS idx_positions_symbol_status ON positions(symbol, status);
        CREATE TABLE IF NOT EXISTS telegram_watches (
            symbol               TEXT PRIMARY KEY,
            high_ibs             REAL NOT NULL DEFAULT 0.75,
            low_ibs              REAL NOT NULL DEFAULT 0.1,
            threshold_pct        REAL NOT NULL DEFAULT 0.3,
            chat_id              TEXT,
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
        CREATE TABLE IF NOT EXISTS robinhood_order_refs (
            ref_id     TEXT PRIMARY KEY,
            order_id   TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
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
			// Сколько исполнения по этой заявке уже разнесено по журналу.
			// Делает применение fill идемпотентным (CORE-04).
			{"order_trackers", "recorded_qty", "REAL NOT NULL DEFAULT 0"},
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
		// Legacy journal: only databases made before `positions` have it.
		if hasTable(e, "broker_trades") {
			if err := ensureColumn(e, "broker_trades", "broker", "TEXT NOT NULL DEFAULT 'webull'"); err != nil {
				return err
			}
			if _, err := e.Exec(`CREATE INDEX IF NOT EXISTS idx_broker_trades_broker_status ON broker_trades(broker, status)`); err != nil {
				return err
			}
		}
	}
	if from < 3 {
		if err := ensureColumn(e, "aggregate_send_state", "missed_t1_reported", "INTEGER NOT NULL DEFAULT 0"); err != nil {
			return err
		}
	}
	if from < 4 {
		// Which events are already baked into the prices used to be guessed
		// from one dataset-wide flag, so a split registered after the recount
		// was applied nowhere. Carry the old meaning over: everything stored
		// against an adjusted dataset counts as applied, the rest as pending.
		if err := ensureColumn(e, "splits", "applied", "INTEGER NOT NULL DEFAULT 0"); err != nil {
			return err
		}
		if _, err := e.Exec(`UPDATE splits SET applied = 1 WHERE ticker IN (SELECT ticker FROM dataset_meta WHERE adjusted_for_splits = 1)`); err != nil {
			return err
		}
	}
	if from < 5 {
		// pnl_absolute used to hold the per-share price difference while the
		// UI printed it as money next to the quantity column (AUD-041). Rows
		// closed before the fix carry the old meaning; scale them once so the
		// journal is not half per-share and half money. Idempotent by schema
		// version: a database already at 5 never runs this again.
		for _, table := range []string{"broker_trades", "trades"} {
			if !hasTable(e, table) {
				continue
			}
			if _, err := e.Exec(`UPDATE ` + table + ` SET pnl_absolute = ROUND(pnl_absolute * quantity, 6) WHERE status = 'closed' AND pnl_absolute IS NOT NULL AND quantity IS NOT NULL AND quantity > 0`); err != nil {
				return err
			}
		}
	}
	if from < 6 {
		// One position, one row: `trades` + `broker_trades` fold into
		// `positions`. See mergeLegacyJournals for the matching rules. The old
		// tables stay in place, unread and unwritten; fresh databases never get
		// them.
		if err := mergeLegacyJournals(e); err != nil {
			return err
		}
	}
	if from < 7 {
		// recorded_qty была дописана в список шага `from < 2` уже после того,
		// как рабочая база прошла его: шаг больше не выполняется, и колонка не
		// появилась вообще — `ClaimFillQty` падал на проде с «no such column».
		// Новая колонка получает **свой** шаг; дописывать пройденный задним
		// числом нельзя, там она видна только новым базам.
		if err := ensureColumn(e, "order_trackers", "recorded_qty", "REAL NOT NULL DEFAULT 0"); err != nil {
			return err
		}
	}
	if from < 8 {
		// Последнее подтверждённое брокером частичное исполнение. Завершение
		// трекера без ответа брокера (сеть, истёкший день) иначе теряло уже
		// купленные или проданные акции (AUD-135).
		if err := ensureColumn(e, "order_trackers", "last_filled_qty", "REAL NOT NULL DEFAULT 0"); err != nil {
			return err
		}
		if err := ensureColumn(e, "order_trackers", "last_fill_price", "REAL"); err != nil {
			return err
		}
	}
	if from < 9 {
		// Средняя цена того накопленного исполнения, которое уже в журнале:
		// цена новой части = прирост стоимости заявки, а не её средняя (AUD-180).
		if err := ensureColumn(e, "order_trackers", "recorded_price", "REAL"); err != nil {
			return err
		}
	}
	if from < 10 {
		// С чем заявка ушла: id цикла, IBS решения и котировка. Жили только в
		// памяти процесса, и перезапуск между отправкой и исполнением рвал
		// цепочку в логе и оставлял exit_ibs пустым.
		for _, col := range []struct{ name, typ string }{
			{"correlation_id", "TEXT"}, {"decision_ibs", "REAL"}, {"quote_price", "REAL"},
		} {
			if err := ensureColumn(e, "order_trackers", col.name, col.typ); err != nil {
				return err
			}
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
	if err := rows.Err(); err != nil {
		return false
	}
	return false
}

func hasTable(q schemaExecer, table string) bool {
	rows, err := q.Query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`, table)
	if err != nil {
		return false
	}
	defer rows.Close()
	return rows.Next()
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
	if err := rows.Err(); err != nil {
		return nil, err
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
		var vol sql.NullFloat64
		if err := rows.Scan(&b.Date, &b.Open, &b.High, &b.Low, &b.Close, &adj, &vol); err != nil {
			return nil, err
		}
		if adj.Valid {
			v := adj.Float64
			b.AdjClose = &v
		}
		if vol.Valid {
			b.Volume = vol.Float64
		}
		data = append(data, b)
	}
	if err := rows.Err(); err != nil {
		return nil, err
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
	return d.saveDataset(ticker, name, company, tag, bars, adjusted, nil)
}

// SaveImport записывает импорт цен вместе с пришедшими событиями сплитов и,
// если вызывающий заявил, что цены уже их несут (markApplied), отметками
// applied — одной транзакцией. Раздельно отказ между шагами оставлял
// пересчитанные цены с ожидающим сплитом, и расчёт делил их ещё раз (AUD-150).
// Цены уже в той базе, что заявлена, поэтому коэффициенты пишутся без
// перебазирования.
func (d *DB) SaveImport(ticker, name, company, tag string, bars []types.OHLC, adjusted bool, events []types.SplitEvent, markApplied bool) error {
	return d.saveDataset(ticker, name, company, tag, bars, adjusted, func(tx *sql.Tx, ticker string) error {
		for _, e := range events {
			if _, err := tx.Exec(`INSERT INTO splits (ticker, date, factor, applied) VALUES (?, ?, ?, 0)
                ON CONFLICT(ticker, date) DO UPDATE SET factor=excluded.factor,
                applied=CASE WHEN splits.factor = excluded.factor THEN splits.applied ELSE 0 END`, ticker, e.Date, e.Factor); err != nil {
				return err
			}
		}
		if markApplied {
			_, err := tx.Exec(`UPDATE splits SET applied = 1 WHERE ticker = ?`, ticker)
			return err
		}
		return nil
	})
}

func (d *DB) saveDataset(ticker, name, company, tag string, bars []types.OHLC, adjusted bool, extra func(*sql.Tx, string) error) error {
	ticker = SafeTicker(ticker)
	if ticker == "" {
		return fmt.Errorf("Неверный тикер")
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
	if !adjusted {
		// Сырые цены не несут ни одного сплита: старые отметки прошлого
		// датасета иначе выдали бы новый импорт за уже пересчитанный (AUD-097).
		if _, err := tx.Exec(`UPDATE splits SET applied = 0 WHERE ticker = ?`, ticker); err != nil {
			return err
		}
	}
	if extra != nil {
		if err := extra(tx, ticker); err != nil {
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

func (d *DB) Counts() (datasets, ohlc int, err error) {
	if err = d.SQL.QueryRow(`SELECT COUNT(*) FROM dataset_meta`).Scan(&datasets); err != nil {
		return 0, 0, err
	}
	if err = d.SQL.QueryRow(`SELECT COUNT(*) FROM ohlc`).Scan(&ohlc); err != nil {
		return 0, 0, err
	}
	return datasets, ohlc, nil
}

func (d *DB) SessionGet(token string) (created, expires int64, err error) {
	err = d.SQL.QueryRow(`SELECT created_at, expires_at FROM sessions WHERE token = ?`, token).Scan(&created, &expires)
	return created, expires, err
}

// SaveRobinhoodOrderRef remembers which order id Robinhood gave our ref_id.
// Robinhood's order listing carries no ref_id at all, so without this mapping
// an order can never be looked up again by the id we generated.
func (d *DB) SaveRobinhoodOrderRef(refID, orderID, createdAt string) error {
	if refID == "" || orderID == "" {
		return nil
	}
	_, err := d.SQL.Exec(`INSERT OR REPLACE INTO robinhood_order_refs (ref_id, order_id, created_at) VALUES (?, ?, ?)`, refID, orderID, createdAt)
	return err
}

// RobinhoodOrderID returns the broker order id stored for our ref, or "".
func (d *DB) RobinhoodOrderID(refID string) string {
	if refID == "" {
		return ""
	}
	var id string
	if err := d.SQL.QueryRow(`SELECT order_id FROM robinhood_order_refs WHERE ref_id = ?`, refID).Scan(&id); err != nil {
		return ""
	}
	return id
}

func (d *DB) SessionSet(token string, created, expires int64) error {
	_, err := d.SQL.Exec(`INSERT OR REPLACE INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)`, token, created, expires)
	return err
}

// SessionExtend moves the dates of an existing session and reports whether it
// still existed. Renewal through SessionSet's INSERT OR REPLACE brought back a
// session a concurrent logout had just deleted (AUD-179).
func (d *DB) SessionExtend(token string, created, expires int64) (bool, error) {
	res, err := d.SQL.Exec(`UPDATE sessions SET created_at = ?, expires_at = ? WHERE token = ?`, created, expires, token)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

func (d *DB) SessionDelete(token string) error {
	_, err := d.SQL.Exec(`DELETE FROM sessions WHERE token = ?`, token)
	return err
}

// SessionsRevokeOnCredentialChange drops every stored session when the admin
// credentials differ from the ones the sessions were issued under. Without it
// a rotated password leaves a stolen cookie working: the sessions table knows
// nothing about the credentials. A read failure is treated as "unknown
// credentials" and revokes as well — fail closed.
func (d *DB) SessionsRevokeOnCredentialChange(fingerprint string) error {
	var stored string
	err := d.SQL.QueryRow(`SELECT fingerprint FROM auth_credential WHERE id = 1`).Scan(&stored)
	if err == nil && stored == fingerprint {
		return nil
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		log.Printf("store: read auth fingerprint: %v", err)
	}
	if _, err := d.SQL.Exec(`DELETE FROM sessions`); err != nil {
		return err
	}
	_, err = d.SQL.Exec(`INSERT INTO auth_credential (id, fingerprint) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET fingerprint=excluded.fingerprint`, fingerprint)
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
	if err := rows.Err(); err != nil {
		return nil, err
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
	if err := rows.Err(); err != nil {
		return nil, err
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
	// Событие, уже применённое к ценам, остаётся применённым: при новом
	// коэффициенте цены переводятся на него, при удалении — восстанавливаются.
	prev, err := appliedFactors(tx, ticker)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM splits WHERE ticker = ?`, ticker); err != nil {
		return err
	}
	for _, e := range events {
		date := tradingdate.DateKey(e.Date)
		applied := 0
		if f, ok := prev[date]; ok {
			if err := rebaseApplied(tx, ticker, date, f, e.Factor); err != nil {
				return err
			}
			applied = 1
			delete(prev, date)
		}
		if _, err := tx.Exec(`INSERT INTO splits (ticker, date, factor, applied) VALUES (?, ?, ?, ?)`, ticker, e.Date, e.Factor, applied); err != nil {
			return err
		}
	}
	for date, f := range prev {
		if err := rebaseApplied(tx, ticker, date, f, 1); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// rebaseApplied переводит цены до date с уже применённого коэффициента from
// на to (to = 1 снимает сплит). Раньше правка применённого события сбрасывала
// отметку, и новый коэффициент делил уже поделённые цены ещё раз (AUD-146).
func rebaseApplied(tx *sql.Tx, ticker, date string, from, to float64) error {
	if from == to || !(from > 0) || !(to > 0) {
		return nil
	}
	_, err := tx.Exec(`UPDATE ohlc SET open = open*?1, high = high*?1, low = low*?1, close = close*?1,
            adj_close = adj_close*?1, volume = CAST(ROUND(volume/?1) AS INTEGER)
        WHERE ticker = ?2 AND date < ?3`, from/to, ticker, date)
	return err
}

// appliedFactors maps the dates already reflected in the stored prices to the
// factor they were applied with.
func appliedFactors(q schemaExecer, ticker string) (map[string]float64, error) {
	rows, err := q.Query(`SELECT date, factor FROM splits WHERE ticker = ? AND applied = 1`, ticker)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]float64{}
	for rows.Next() {
		var date string
		var factor float64
		if err := rows.Scan(&date, &factor); err != nil {
			return nil, err
		}
		out[date] = factor
	}
	return out, rows.Err()
}

// ListPendingSplits returns the events whose back-adjustment is not yet baked
// into the stored prices — the ones a calculation still has to apply itself.
func (d *DB) ListPendingSplits(symbol string) ([]types.SplitEvent, error) {
	rows, err := d.SQL.Query(`SELECT date, factor FROM splits WHERE ticker = ? AND applied = 0 ORDER BY date`, SafeTicker(symbol))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []types.SplitEvent{}
	for rows.Next() {
		var e types.SplitEvent
		if err := rows.Scan(&e.Date, &e.Factor); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// ApplyPendingSplits делит сохранённые цены по ожидающим событиям и отмечает
// их применёнными одной транзакцией. Раньше обработчик читал историю, считал и
// перезаписывал её целиком: refresh между чтением и записью терял новый день,
// а отметка подтверждала коэффициент, изменённый после чтения (AUD-151).
// Атомарность цен и отметок — AUD-096. Возвращает число применённых событий.
func (d *DB) ApplyPendingSplits(symbol string) (int, error) {
	ticker := SafeTicker(symbol)
	tx, err := d.SQL.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	rows, err := tx.Query(`SELECT date, factor FROM splits WHERE ticker = ? AND applied = 0`, ticker)
	if err != nil {
		return 0, err
	}
	var events []types.SplitEvent
	for rows.Next() {
		var e types.SplitEvent
		if err := rows.Scan(&e.Date, &e.Factor); err != nil {
			rows.Close()
			return 0, err
		}
		events = append(events, e)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	for _, e := range events {
		if !(e.Factor > 0) || math.IsInf(e.Factor, 0) || e.Factor == 1 {
			continue
		}
		// Как splits.AdjustOHLC: цены делятся, объём умножается, adj_close
		// без значения берётся от close.
		if _, err := tx.Exec(`UPDATE ohlc SET open = ROUND(open/?1, 6), high = ROUND(high/?1, 6), low = ROUND(low/?1, 6),
                close = ROUND(close/?1, 6), adj_close = ROUND(COALESCE(adj_close, close)/?1, 6),
                volume = CAST(ROUND(volume*?1) AS INTEGER)
            WHERE ticker = ?2 AND date < ?3`, e.Factor, ticker, tradingdate.DateKey(e.Date)); err != nil {
			return 0, err
		}
	}
	if len(events) == 0 {
		return 0, nil
	}
	if _, err := tx.Exec(`UPDATE splits SET applied = 1 WHERE ticker = ? AND applied = 0`, ticker); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(`UPDATE dataset_meta SET adjusted_for_splits = 1, updated_at = datetime('now') WHERE ticker = ?`, ticker); err != nil {
		return 0, err
	}
	return len(events), tx.Commit()
}

// MarkSplitsApplied records that the stored prices of the symbol now carry
// every event of its split table.
func (d *DB) MarkSplitsApplied(symbol string) error {
	_, err := d.SQL.Exec(`UPDATE splits SET applied = 1 WHERE ticker = ?`, SafeTicker(symbol))
	return err
}

func (d *DB) UpsertSplits(symbol string, events []types.SplitEvent) error {
	ticker := SafeTicker(symbol)
	tx, err := d.SQL.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	prev, err := appliedFactors(tx, ticker)
	if err != nil {
		return err
	}
	for _, e := range events {
		// Применённое событие остаётся применённым: цены переводятся на новый
		// коэффициент (AUD-146). Ожидающее просто меняет коэффициент.
		date := tradingdate.DateKey(e.Date)
		applied := 0
		if f, ok := prev[date]; ok {
			if err := rebaseApplied(tx, ticker, date, f, e.Factor); err != nil {
				return err
			}
			applied = 1
			// Повтор даты в том же запросе переводит цены уже с этого
			// коэффициента, а не с прочитанного до цикла (AUD-168).
			prev[date] = e.Factor
		}
		if _, err := tx.Exec(`INSERT INTO splits (ticker, date, factor, applied) VALUES (?, ?, ?, ?)
            ON CONFLICT(ticker, date) DO UPDATE SET factor=excluded.factor, applied=excluded.applied`, ticker, e.Date, e.Factor, applied); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (d *DB) DeleteSplit(symbol, date string) error {
	ticker := SafeTicker(symbol)
	tx, err := d.SQL.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	prev, err := appliedFactors(tx, ticker)
	if err != nil {
		return err
	}
	// Удаление применённого события возвращает цены к виду без него (AUD-146).
	if f, ok := prev[tradingdate.DateKey(date)]; ok {
		if err := rebaseApplied(tx, ticker, tradingdate.DateKey(date), f, 1); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`DELETE FROM splits WHERE ticker = ? AND date = ?`, ticker, date); err != nil {
		return err
	}
	return tx.Commit()
}

// DeleteSplits снимает все события тикера тем же путём, что замена списка на
// пустой: применённые события возвращают цены к сырому виду (AUD-146).
func (d *DB) DeleteSplits(symbol string) error {
	return d.ReplaceSplits(symbol, nil)
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

// ErrCalendarChanged means the calendar was rewritten between the read and the
// write; the caller re-reads instead of saving over the other edit.
var ErrCalendarChanged = errors.New("календарь изменён параллельно, повторите")

// SwapCalendar writes next only if the stored calendar is still prev, the blob
// the caller read. Two edits that overlapped used to lose the earlier one
// (AUD-141).
func (d *DB) SwapCalendar(prev, next json.RawMessage) error {
	res, err := d.SQL.Exec(`UPDATE calendar SET data=? WHERE id=1 AND data=?`, string(next), string(prev))
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 1 {
		return nil
	}
	// No row yet: prev was the built-in default, so insert unless someone
	// else already did.
	res, err = d.SQL.Exec(`INSERT INTO calendar (id, data) VALUES (1, ?) ON CONFLICT(id) DO NOTHING`, string(next))
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 1 {
		return nil
	}
	return ErrCalendarChanged
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
	"lastCalendarCoverageAlertDate",
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
	if err := json.Unmarshal([]byte(data), &stored); err != nil {
		// Callers read-modify-write these settings; answering an unparseable
		// blob with the defaults would let the next save reset thresholds and
		// broker flags to factory values.
		return nil, err
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
	return d.UpdateSettingsKeys(func(map[string]any) (map[string]any, error) { return kv, nil })
}

// UpdateSettingsKeys is SetSettingsKeys for a change computed from the current
// value: fn gets the settings as SettingsErr returns them and answers the
// top-level keys to write, inside the same transaction. A nested object (the
// autoTrading config, the per-broker blocks) read outside it and written back
// whole lost a concurrent change: a threshold edit read before an operator
// switched trading off wrote enabled=true back (AUD-177). fn must not touch
// the database: the transaction holds the only connection.
func (d *DB) UpdateSettingsKeys(fn func(current map[string]any) (map[string]any, error)) error {
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
	stored, view := map[string]any{}, map[string]any{}
	var data string
	err = conn.QueryRowContext(ctx, `SELECT data FROM settings WHERE id = 1`).Scan(&data)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	if err == nil && data != "" {
		if err := json.Unmarshal([]byte(data), &stored); err != nil {
			return err
		}
		if err := json.Unmarshal([]byte(data), &view); err != nil {
			return err
		}
	}
	view = mergeMaps(defaultSettings(), sanitizeSettings(view))
	if at, ok := view["autoTrading"].(map[string]any); ok {
		delete(at, "dryRun")
	}
	kv, err := fn(view)
	if err != nil {
		return err
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

// ListWatches returns the watchlist: tickers and their thresholds. Whether a
// position is open is not a property of the watch — the journal (`positions`)
// answers that. Older databases still carry is_open_position/entry_*/
// current_trade_id columns on this table; nothing reads or writes them.
func (d *DB) ListWatches() ([]map[string]any, error) {
	rows, err := d.SQL.Query(`SELECT symbol, high_ibs, low_ibs, threshold_pct, chat_id FROM telegram_watches ORDER BY symbol`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var symbol string
		var high, low, thr float64
		var chat sql.NullString
		if err := rows.Scan(&symbol, &high, &low, &thr, &chat); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"symbol": symbol, "highIBS": high, "lowIBS": low, "thresholdPct": thr, "chatId": chat.String,
		})
	}
	return out, rows.Err()
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

// watchPatchColumns is the whitelist of JSON keys PatchWatch may write.
// Position state is not here: it lives in the journal only.
var watchPatchColumns = map[string]string{
	"highIBS":      "high_ibs",
	"lowIBS":       "low_ibs",
	"thresholdPct": "threshold_pct",
	"chatId":       "chat_id",
}

var watchNumericPatch = map[string]bool{"highIBS": true, "lowIBS": true, "thresholdPct": true}

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
	_, err := d.SQL.Exec(`INSERT INTO telegram_watches (symbol, high_ibs, low_ibs, threshold_pct, chat_id) VALUES (?, ?, ?, ?, ?)`,
		symbol, high, low, thr, watchChatID(w))
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

// round6 округляет до шестого знака. math.Round, а не int(v*1e6+0.5):
// приведение к int в Go усекает к нулю, поэтому -100 давало -99.999999 и все
// убыточные сделки попадали в журнал искажёнными (AUD-046).
func round6(v float64) float64 {
	return math.Round(v*1e6) / 1e6
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
		var period, level float64
		var enabled int
		var buy, sell, thr, info sql.NullFloat64
		var next, infoSide sql.NullString
		if err := rows.Scan(&id, &symbol, &period, &level, &dir, &enabled, &buy, &sell, &next, &thr, &info, &infoSide); err != nil {
			return nil, err
		}
		row := map[string]any{"id": id, "symbol": symbol, "emaPeriod": int(period), "levelPct": level, "direction": dir, "enabled": enabled == 1}
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
	if err := rows.Err(); err != nil {
		return nil, err
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
	symbol := ""
	if rec["symbol"] != nil {
		symbol = SafeTicker(fmt.Sprint(rec["symbol"]))
	}
	if symbol == "" {
		return "", fmt.Errorf("symbol required")
	}
	next := rec["nextAction"]
	// No nextAction in rec: an existing alert keeps the side it is on, which
	// the alert itself flips when it fires (AUD-192).
	keepNext := next == nil || fmt.Sprint(next) == ""
	if keepNext {
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
	period := int(asFloat(rec["emaPeriod"]))
	if period <= 0 {
		period = 200
	}
	if rec["direction"] == nil || fmt.Sprint(rec["direction"]) == "" {
		if fmt.Sprint(next) == "sell" {
			rec["direction"] = "above"
		} else {
			rec["direction"] = "below"
		}
	}
	enabled := 1
	if b, ok := rec["enabled"].(bool); ok && !b {
		enabled = 0
	}
	_, err := d.SQL.Exec(`INSERT INTO telegram_ema_alerts (id, symbol, ema_period, level_pct, direction, enabled, buy_level_pct, sell_level_pct, next_action, threshold_pct, info_level_pct)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET symbol=excluded.symbol, ema_period=excluded.ema_period, level_pct=excluded.level_pct, direction=excluded.direction, enabled=excluded.enabled,
            buy_level_pct=excluded.buy_level_pct, sell_level_pct=excluded.sell_level_pct, next_action=CASE WHEN ? THEN telegram_ema_alerts.next_action ELSE excluded.next_action END, threshold_pct=excluded.threshold_pct,
            info_level_pct=excluded.info_level_pct, updated_at=datetime('now')`,
		id, symbol, period, rec["levelPct"], rec["direction"], enabled, rec["buyLevelPct"], rec["sellLevelPct"], next, rec["thresholdPct"], rec["infoLevelPct"], keepNext)
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
		side, nullText(at), id)
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
		var vol sql.NullFloat64
		if err := rows.Scan(&b.Date, &b.Open, &b.High, &b.Low, &b.Close, &adjC, &vol); err != nil {
			return nil, false, err
		}
		if adjC.Valid {
			v := adjC.Float64
			b.AdjClose = &v
		}
		if vol.Valid {
			b.Volume = vol.Float64
		}
		data = append(data, b)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
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
		return fmt.Errorf("Неверный тикер")
	}
	tx, err := d.SQL.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var curTag, curCompany sql.NullString
	err = tx.QueryRow(`SELECT tag, company_name FROM dataset_meta WHERE ticker = ?`, ticker).Scan(&curTag, &curCompany)
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
	if _, err = tx.Exec(`UPDATE dataset_meta SET tag = ?, company_name = ?, updated_at = datetime('now') WHERE ticker = ?`, newTag, newCompany, ticker); err != nil {
		return err
	}
	return tx.Commit()
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
	if err := rows.Err(); err != nil {
		return nil, err
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
// MISSING/UNREACHABLE/EXPIRING_SOON — the vocabulary CanSubmit and the cycle gate
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
