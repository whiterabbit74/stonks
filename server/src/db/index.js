/**
 * SQLite database — singleton connection with schema init
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');

let _db = null;

function getDb() {
    if (_db) return _db;

    const { SERVER_DIR } = require('../config');
    const dbDir = process.env.DB_DIR || path.join(SERVER_DIR, 'db');
    fs.ensureDirSync(dbDir);
    const dbPath = process.env.DB_FILE || path.join(dbDir, 'trading.db');

    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initSchema(_db);

    console.log(`DB: connected → ${dbPath}`);
    return _db;
}

function initSchema(db) {
    db.exec(`
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

        CREATE INDEX IF NOT EXISTS idx_ohlc_ticker_date ON ohlc(ticker, date);

        CREATE TABLE IF NOT EXISTS splits (
            ticker  TEXT NOT NULL,
            date    TEXT NOT NULL,
            factor  REAL NOT NULL,
            PRIMARY KEY (ticker, date)
        );

        CREATE INDEX IF NOT EXISTS idx_splits_ticker ON splits(ticker);
    `);
}

module.exports = { getDb };
