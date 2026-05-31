#!/usr/bin/env node

const path = require('path');
const Database = require('better-sqlite3');
const {
    formatIntegrityWarningBlock,
    validateOhlcSeriesIntegrity,
} = require('../src/services/marketDataIntegrity');
const {
    filterAllowedWarnings,
    loadDataIntegrityAllowlist,
} = require('../src/services/dataIngestion');

function parseArgs(argv) {
    const args = {
        db: process.env.TRADING_DB_PATH || path.join(__dirname, '..', 'db', 'trading.db'),
        allowlist: path.join(__dirname, '..', 'config', 'data-integrity-allowlist.json'),
        json: false,
    };
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--db' && argv[i + 1]) {
            args.db = argv[++i];
        } else if (arg === '--allowlist' && argv[i + 1]) {
            args.allowlist = argv[++i];
        } else if (arg === '--no-allowlist') {
            args.allowlist = null;
        } else if (arg === '--json') {
            args.json = true;
        }
    }
    return args;
}

function loadTicker(db, ticker) {
    const rows = db.prepare(`
        SELECT date, open, high, low, close, adj_close AS adjClose, volume
        FROM ohlc
        WHERE ticker = ?
        ORDER BY date
    `).all(ticker);
    const splits = db.prepare(`
        SELECT date, factor
        FROM splits
        WHERE ticker = ?
        ORDER BY date
    `).all(ticker);
    return { rows, splits };
}

function main() {
    const args = parseArgs(process.argv);
    const dbPath = path.resolve(args.db);
    const allowlist = loadDataIntegrityAllowlist(args.allowlist ? path.resolve(args.allowlist) : null);
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });

    const tickers = db.prepare(`
        SELECT ticker, adjusted_for_splits AS adjustedForSplits, data_points AS dataPoints, date_from AS dateFrom, date_to AS dateTo
        FROM dataset_meta
        ORDER BY ticker
    `).all();

    const results = [];
    for (const meta of tickers) {
        const { rows, splits } = loadTicker(db, meta.ticker);
        const validation = filterAllowedWarnings(validateOhlcSeriesIntegrity({
            symbol: meta.ticker,
            rows,
            knownSplits: splits,
            adjustedForSplits: meta.adjustedForSplits === 1,
        }), allowlist);
        results.push({
            ticker: meta.ticker,
            ok: validation.warnings.length === 0,
            rows: rows.length,
            dateFrom: meta.dateFrom,
            dateTo: meta.dateTo,
            adjustedForSplits: meta.adjustedForSplits === 1,
            splitCount: splits.length,
            warningCount: validation.warnings.length,
            allowedWarningCount: validation.allowedWarningCount || 0,
            warnings: validation.warnings,
        });
    }

    const failed = results.filter((result) => !result.ok);
    if (args.json) {
        process.stdout.write(JSON.stringify({ dbPath, checked: results.length, failed: failed.length, results }, null, 2));
        process.stdout.write('\n');
    } else {
        console.log(`DB: ${dbPath}`);
        if (args.allowlist) console.log(`Allowlist: ${path.resolve(args.allowlist)}`);
        console.log(`Checked tickers: ${results.length}`);
        console.log(`Failed tickers: ${failed.length}`);
        for (const result of failed) {
            console.log('');
            console.log(`=== ${result.ticker} (${result.warningCount} warning${result.warningCount === 1 ? '' : 's'}) ===`);
            console.log(formatIntegrityWarningBlock(result.warnings));
        }
    }

    db.close();
    process.exitCode = failed.length > 0 ? 2 : 0;
}

main();
