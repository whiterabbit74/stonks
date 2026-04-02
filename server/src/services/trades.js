/**
 * Trade history management service — backed by SQLite
 */
const crypto = require('crypto');
const fs = require('fs-extra');
const { getDb } = require('../db');
const { TRADE_HISTORY_FILE } = require('../config');

// External dependency (will be set by telegram service)
let telegramWatches = null;
let scheduleSaveWatchesFn = null;

// Migration flag
let _migrated = false;

function setTelegramWatches(watches, saveFn) {
    telegramWatches = watches;
    scheduleSaveWatchesFn = saveFn;
}

// ─── Migration ────────────────────────────────────────────────────────────────

function migrateJsonToDb() {
    if (_migrated) return;
    _migrated = true;

    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) AS n FROM trades').get().n;
    if (count > 0) return;

    if (!fs.pathExistsSync(TRADE_HISTORY_FILE)) return;

    try {
        const data = fs.readJsonSync(TRADE_HISTORY_FILE);
        if (!Array.isArray(data) || data.length === 0) return;

        const insert = db.prepare(`
            INSERT OR IGNORE INTO trades
            (id, symbol, status, entry_date, exit_date, entry_price, exit_price,
             entry_ibs, exit_ibs, entry_decision_time, exit_decision_time,
             pnl_percent, pnl_absolute, holding_days, notes, linked_broker_trade_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        db.transaction(() => {
            for (const rec of data) {
                const t = normalizeTradeRecord(rec);
                insert.run(
                    t.id, t.symbol, t.status,
                    t.entryDate, t.exitDate,
                    t.entryPrice, t.exitPrice,
                    t.entryIBS, t.exitIBS,
                    t.entryDecisionTime, t.exitDecisionTime,
                    t.pnlPercent, t.pnlAbsolute, t.holdingDays,
                    t.notes ?? null,
                    t.linkedBrokerTradeId ?? null
                );
            }
        })();
        console.log(`trades: migrated ${data.length} records from JSON to SQLite`);
    } catch (e) {
        console.warn('trades: migration failed:', e.message);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeTradeRecord(rec) {
    const safe = rec && typeof rec === 'object' ? { ...rec } : {};
    const symbol = typeof safe.symbol === 'string' ? safe.symbol.toUpperCase() : null;
    let status = safe.status === 'open' ? 'open' : 'closed';
    const entryPrice = typeof safe.entryPrice === 'number' ? safe.entryPrice : (safe.entryPrice != null ? Number(safe.entryPrice) : null);
    const exitPrice = typeof safe.exitPrice === 'number' ? safe.exitPrice : (safe.exitPrice != null ? Number(safe.exitPrice) : null);

    if (safe.exitDate || safe.exitDecisionTime || (typeof exitPrice === 'number' && Number.isFinite(exitPrice))) {
        status = 'closed';
    }

    let pnlAbsolute = typeof safe.pnlAbsolute === 'number' ? safe.pnlAbsolute : null;
    let pnlPercent = typeof safe.pnlPercent === 'number' ? safe.pnlPercent : null;

    if (entryPrice != null && exitPrice != null) {
        const diff = exitPrice - entryPrice;
        pnlAbsolute = diff;
        pnlPercent = (diff / entryPrice) * 100;
    }

    let holdingDays = typeof safe.holdingDays === 'number' ? safe.holdingDays : null;
    if (!holdingDays && safe.entryDate && safe.exitDate) {
        const entryDate = new Date(safe.entryDate);
        const exitDate = new Date(safe.exitDate);
        if (!Number.isNaN(entryDate.valueOf()) && !Number.isNaN(exitDate.valueOf())) {
            const diff = Math.round((exitDate.getTime() - entryDate.getTime()) / (24 * 3600 * 1000));
            holdingDays = diff >= 0 ? Math.max(1, diff) : null;
        }
    }

    return {
        id: typeof safe.id === 'string' ? safe.id : crypto.randomUUID(),
        symbol: symbol || 'UNKNOWN',
        status,
        entryDate: typeof safe.entryDate === 'string' ? safe.entryDate : null,
        exitDate: typeof safe.exitDate === 'string' ? safe.exitDate : null,
        entryPrice,
        exitPrice,
        entryIBS: typeof safe.entryIBS === 'number' ? safe.entryIBS : (safe.entryIBS != null ? Number(safe.entryIBS) : null),
        exitIBS: typeof safe.exitIBS === 'number' ? safe.exitIBS : (safe.exitIBS != null ? Number(safe.exitIBS) : null),
        entryDecisionTime: typeof safe.entryDecisionTime === 'string' ? safe.entryDecisionTime : null,
        exitDecisionTime: typeof safe.exitDecisionTime === 'string' ? safe.exitDecisionTime : null,
        pnlPercent,
        pnlAbsolute,
        holdingDays,
        notes: typeof safe.notes === 'string' ? safe.notes : undefined,
        linkedBrokerTradeId: typeof safe.linkedBrokerTradeId === 'string' ? safe.linkedBrokerTradeId : null,
    };
}

function rowToTrade(row) {
    return {
        id: row.id,
        symbol: row.symbol,
        status: row.status,
        entryDate: row.entry_date,
        exitDate: row.exit_date,
        entryPrice: row.entry_price,
        exitPrice: row.exit_price,
        entryIBS: row.entry_ibs,
        exitIBS: row.exit_ibs,
        entryDecisionTime: row.entry_decision_time,
        exitDecisionTime: row.exit_decision_time,
        pnlPercent: row.pnl_percent,
        pnlAbsolute: row.pnl_absolute,
        holdingDays: row.holding_days,
        notes: row.notes,
        source: row.source ?? 'auto',
        isHidden: row.is_hidden === 1,
        isTest: row.is_test === 1,
        brokerOrderId: row.broker_order_id ?? null,
        clientOrderId: row.client_order_id ?? null,
        filledQty: row.filled_qty ?? null,
        quantity: row.quantity ?? null,
        linkedBrokerTradeId: row.linked_broker_trade_id ?? null,
    };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

function getCurrentOpenTrade() {
    migrateJsonToDb();
    const db = getDb();
    const row = db.prepare(`
        SELECT * FROM trades WHERE status = 'open'
        ORDER BY COALESCE(entry_decision_time, entry_date) DESC
        LIMIT 1
    `).get();
    return row ? rowToTrade(row) : null;
}

function getTradeHistory() {
    migrateJsonToDb();
    const db = getDb();
    return db.prepare('SELECT * FROM trades').all().map(rowToTrade);
}

function getTradeById(id) {
    if (!id) return null;
    migrateJsonToDb();
    const db = getDb();
    const row = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
    return row ? rowToTrade(row) : null;
}

function getSortedTradeHistory() {
    migrateJsonToDb();
    const db = getDb();
    return db.prepare(`
        SELECT * FROM trades
        ORDER BY COALESCE(exit_decision_time, exit_date, entry_decision_time, entry_date) DESC
    `).all().map(rowToTrade);
}

function syncWatchesWithTradeState() {
    const syncResult = synchronizeWatchesWithTradeHistory();
    if (syncResult.changes.length && scheduleSaveWatchesFn) {
        scheduleSaveWatchesFn();
    }
    return syncResult;
}

function mergeNotes(existingNotes, nextNote) {
    const base = typeof existingNotes === 'string' && existingNotes.trim()
        ? existingNotes.trim()
        : '';
    const addition = typeof nextNote === 'string' && nextNote.trim()
        ? nextNote.trim()
        : '';
    if (!addition) return base || null;
    if (!base) return addition;
    if (base.includes(addition)) return base;
    return `${base}\n${addition}`;
}

function calculateTradePnl(entryPrice, exitPrice) {
    if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice) || entryPrice === 0) {
        return { pnlAbsolute: null, pnlPercent: null };
    }
    const diff = exitPrice - entryPrice;
    return {
        pnlAbsolute: Number(diff.toFixed(6)),
        pnlPercent: Number(((diff / entryPrice) * 100).toFixed(6)),
    };
}

function calculateHoldingDays(entryDate, exitDate) {
    if (!entryDate || !exitDate) return null;
    const d1 = new Date(entryDate);
    const d2 = new Date(exitDate);
    if (Number.isNaN(d1.valueOf()) || Number.isNaN(d2.valueOf())) return null;
    const diff = Math.round((d2.getTime() - d1.getTime()) / (24 * 3600 * 1000));
    return diff >= 0 ? Math.max(1, diff) : null;
}

// ─── Write ────────────────────────────────────────────────────────────────────

function recordTradeEntry({ symbol, price, ibs, decisionTime, dateKey, source, clientOrderId, brokerOrderId, filledQty, quantity }) {
    if (!symbol) return null;
    migrateJsonToDb();
    const db = getDb();

    const normalizedSymbol = symbol.toUpperCase();
    const openTrade = getCurrentOpenTrade();
    if (openTrade) {
        console.warn(`Cannot open new trade for ${normalizedSymbol}: trade ${openTrade.id} is still open for ${openTrade.symbol}`);
        return null;
    }

    const id = crypto.randomUUID();
    const entryDate = dateKey || null;
    const entryPrice = typeof price === 'number' ? price : null;
    const entryIBS = typeof ibs === 'number' ? ibs : null;
    const entryDecisionTime = decisionTime || new Date().toISOString();
    const tradeSource = source || 'auto';
    const qty = typeof quantity === 'number' ? quantity : (typeof filledQty === 'number' ? filledQty : null);
    const filledQtyVal = typeof filledQty === 'number' ? filledQty : null;

    db.prepare(`
        INSERT INTO trades
            (id, symbol, status, entry_date, entry_price, entry_ibs, entry_decision_time,
             source, broker_order_id, client_order_id, filled_qty, quantity, linked_broker_trade_id)
        VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(id, normalizedSymbol, entryDate, entryPrice, entryIBS, entryDecisionTime,
           tradeSource, brokerOrderId ?? null, clientOrderId ?? null, filledQtyVal, qty);

    return rowToTrade(db.prepare('SELECT * FROM trades WHERE id = ?').get(id));
}

function recordTradeExit({ symbol, price, ibs, decisionTime, dateKey, clientOrderId, brokerOrderId, filledQty }) {
    if (!symbol) return null;
    migrateJsonToDb();
    const db = getDb();

    const normalizedSymbol = symbol.toUpperCase();
    const openTrade = getCurrentOpenTrade();
    if (!openTrade || openTrade.symbol !== normalizedSymbol) {
        console.warn(`No matching open trade for ${normalizedSymbol} to close`);
        return null;
    }

    const exitPrice = typeof price === 'number' ? price : null;
    const exitDate = dateKey || null;
    const exitDecisionTime = decisionTime || new Date().toISOString();

    const { pnlAbsolute, pnlPercent } = calculateTradePnl(openTrade.entryPrice, exitPrice);
    const holdingDays = calculateHoldingDays(openTrade.entryDate, exitDate);

    db.prepare(`
        UPDATE trades SET
            status = 'closed',
            exit_date = ?,
            exit_price = ?,
            exit_ibs = ?,
            exit_decision_time = ?,
            pnl_absolute = ?,
            pnl_percent = ?,
            holding_days = ?,
            broker_order_id = COALESCE(broker_order_id, ?),
            client_order_id = COALESCE(client_order_id, ?),
            filled_qty = COALESCE(?, filled_qty)
        WHERE id = ?
    `).run(exitDate, exitPrice, typeof ibs === 'number' ? ibs : null,
           exitDecisionTime, pnlAbsolute, pnlPercent, holdingDays,
           brokerOrderId ?? null, clientOrderId ?? null,
           typeof filledQty === 'number' ? filledQty : null,
           openTrade.id);

    return rowToTrade(db.prepare('SELECT * FROM trades WHERE id = ?').get(openTrade.id));
}

function upsertMonitorTradeFromBrokerTrade(brokerTrade) {
    if (!brokerTrade || brokerTrade.status !== 'open' || !brokerTrade.id || !brokerTrade.symbol) {
        return null;
    }
    migrateJsonToDb();
    const db = getDb();
    const openTrade = getCurrentOpenTrade();
    const normalizedSymbol = brokerTrade.symbol.toUpperCase();
    const qty = typeof brokerTrade.quantity === 'number'
        ? brokerTrade.quantity
        : (typeof brokerTrade.filledQty === 'number' ? brokerTrade.filledQty : null);

    if (openTrade) {
        const isSameLinkedTrade = openTrade.linkedBrokerTradeId === brokerTrade.id;
        const canAdoptLegacyOpenTrade = (
            openTrade.symbol === normalizedSymbol
            && openTrade.entryDate === (brokerTrade.entryDate ?? null)
            && !openTrade.linkedBrokerTradeId
            && openTrade.source === 'auto'
        );

        if (!isSameLinkedTrade && !canAdoptLegacyOpenTrade) {
            console.warn(`Cannot link broker trade ${brokerTrade.id} to monitor trade: monitor trade ${openTrade.id} is still open for ${openTrade.symbol}`);
            return null;
        }

        db.prepare(`
            UPDATE trades SET
                symbol = ?,
                entry_date = ?,
                entry_price = ?,
                entry_ibs = ?,
                entry_decision_time = ?,
                source = ?,
                broker_order_id = COALESCE(?, broker_order_id),
                client_order_id = COALESCE(?, client_order_id),
                filled_qty = COALESCE(?, filled_qty),
                quantity = COALESCE(?, quantity),
                linked_broker_trade_id = ?,
                status = 'open'
            WHERE id = ?
        `).run(
            normalizedSymbol,
            brokerTrade.entryDate ?? null,
            typeof brokerTrade.entryPrice === 'number' ? brokerTrade.entryPrice : null,
            typeof brokerTrade.entryIBS === 'number' ? brokerTrade.entryIBS : null,
            brokerTrade.entryDecisionTime ?? null,
            brokerTrade.source || openTrade.source || 'auto',
            brokerTrade.brokerOrderId ?? null,
            brokerTrade.clientOrderId ?? null,
            typeof brokerTrade.filledQty === 'number' ? brokerTrade.filledQty : null,
            qty,
            brokerTrade.id,
            openTrade.id
        );

        const trade = rowToTrade(db.prepare('SELECT * FROM trades WHERE id = ?').get(openTrade.id));
        syncWatchesWithTradeState();
        return trade;
    }

    const id = crypto.randomUUID();
    db.prepare(`
        INSERT INTO trades
            (id, symbol, status, entry_date, entry_price, entry_ibs, entry_decision_time,
             source, broker_order_id, client_order_id, filled_qty, quantity, linked_broker_trade_id)
        VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        normalizedSymbol,
        brokerTrade.entryDate ?? null,
        typeof brokerTrade.entryPrice === 'number' ? brokerTrade.entryPrice : null,
        typeof brokerTrade.entryIBS === 'number' ? brokerTrade.entryIBS : null,
        brokerTrade.entryDecisionTime ?? null,
        brokerTrade.source || 'auto',
        brokerTrade.brokerOrderId ?? null,
        brokerTrade.clientOrderId ?? null,
        typeof brokerTrade.filledQty === 'number' ? brokerTrade.filledQty : null,
        qty,
        brokerTrade.id
    );

    const trade = rowToTrade(db.prepare('SELECT * FROM trades WHERE id = ?').get(id));
    syncWatchesWithTradeState();
    return trade;
}

function closeMonitorTradeById(id, { exitDate, exitPrice, exitIBS, exitDecisionTime, note, clientOrderId, brokerOrderId, filledQty, linkedBrokerTradeId } = {}) {
    if (!id) return null;
    migrateJsonToDb();
    const db = getDb();
    const existing = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
    if (!existing) return null;
    if (existing.status !== 'open') {
        return rowToTrade(existing);
    }

    const normalizedExitPrice = typeof exitPrice === 'number' ? exitPrice : Number(exitPrice);
    if (!Number.isFinite(normalizedExitPrice) || normalizedExitPrice <= 0) {
        throw new Error('exitPrice must be a positive number');
    }

    const resolvedExitDate = exitDate || null;
    const resolvedExitDecisionTime = exitDecisionTime || new Date().toISOString();
    const { pnlAbsolute, pnlPercent } = calculateTradePnl(existing.entry_price, normalizedExitPrice);
    const holdingDays = calculateHoldingDays(existing.entry_date, resolvedExitDate);
    const mergedNotes = mergeNotes(existing.notes, note);

    db.prepare(`
        UPDATE trades SET
            status = 'closed',
            exit_date = ?,
            exit_price = ?,
            exit_ibs = ?,
            exit_decision_time = ?,
            pnl_absolute = ?,
            pnl_percent = ?,
            holding_days = ?,
            notes = ?,
            broker_order_id = COALESCE(broker_order_id, ?),
            client_order_id = COALESCE(client_order_id, ?),
            filled_qty = COALESCE(?, filled_qty),
            linked_broker_trade_id = COALESCE(linked_broker_trade_id, ?)
        WHERE id = ?
    `).run(
        resolvedExitDate,
        normalizedExitPrice,
        typeof exitIBS === 'number' ? exitIBS : null,
        resolvedExitDecisionTime,
        pnlAbsolute,
        pnlPercent,
        holdingDays,
        mergedNotes,
        brokerOrderId ?? null,
        clientOrderId ?? null,
        typeof filledQty === 'number' ? filledQty : null,
        linkedBrokerTradeId ?? null,
        id
    );

    const trade = rowToTrade(db.prepare('SELECT * FROM trades WHERE id = ?').get(id));
    syncWatchesWithTradeState();
    return trade;
}

function closeMonitorTradeFromBrokerTrade(brokerTrade, options = {}) {
    if (!brokerTrade || brokerTrade.status !== 'closed' || !brokerTrade.symbol) {
        return null;
    }
    const openTrade = getCurrentOpenTrade();
    if (!openTrade) return null;

    const isLinkedTrade = openTrade.linkedBrokerTradeId === brokerTrade.id;
    const isLegacyAutoMatch = (
        options.allowLegacyMatch !== false
        && !openTrade.linkedBrokerTradeId
        && openTrade.source === 'auto'
        && openTrade.symbol === brokerTrade.symbol
        && openTrade.entryDate === (brokerTrade.entryDate ?? null)
    );

    if (!isLinkedTrade && !isLegacyAutoMatch) {
        return null;
    }

    return closeMonitorTradeById(openTrade.id, {
        exitDate: brokerTrade.exitDate ?? null,
        exitPrice: brokerTrade.exitPrice,
        exitIBS: brokerTrade.exitIBS,
        exitDecisionTime: brokerTrade.exitDecisionTime,
        note: options.note,
        clientOrderId: brokerTrade.clientOrderId ?? null,
        brokerOrderId: brokerTrade.brokerOrderId ?? null,
        filledQty: brokerTrade.filledQty ?? null,
        linkedBrokerTradeId: brokerTrade.id,
    });
}

// ─── Manual trade management ──────────────────────────────────────────────────

function createManualTrade({ symbol, entryDate, exitDate, entryPrice, exitPrice, entryIBS, exitIBS, notes, quantity }) {
    if (!symbol) return null;
    migrateJsonToDb();
    const db = getDb();

    const normalizedSymbol = symbol.toUpperCase();
    const ep = typeof entryPrice === 'number' ? entryPrice : (entryPrice != null ? Number(entryPrice) : null);
    const xp = typeof exitPrice === 'number' ? exitPrice : (exitPrice != null ? Number(exitPrice) : null);
    const status = (exitDate || xp != null) ? 'closed' : 'open';

    const { pnlAbsolute, pnlPercent } = calculateTradePnl(ep, xp);
    const holdingDays = calculateHoldingDays(entryDate, exitDate);

    const id = crypto.randomUUID();
    db.prepare(`
        INSERT INTO trades
            (id, symbol, status, entry_date, exit_date, entry_price, exit_price,
             entry_ibs, exit_ibs, pnl_absolute, pnl_percent, holding_days, notes,
             source, quantity, linked_broker_trade_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, NULL)
    `).run(id, normalizedSymbol, status, entryDate || null, exitDate || null,
           ep, xp,
           typeof entryIBS === 'number' ? entryIBS : null,
           typeof exitIBS === 'number' ? exitIBS : null,
           pnlAbsolute, pnlPercent, holdingDays,
           typeof notes === 'string' ? notes : null,
           typeof quantity === 'number' ? quantity : null);

    const trade = rowToTrade(db.prepare('SELECT * FROM trades WHERE id = ?').get(id));
    if (trade.status === 'open') {
        syncWatchesWithTradeState();
    }
    return trade;
}

function updateTrade(id, { notes, isHidden, isTest, exitDate, exitPrice, exitIBS, linkedBrokerTradeId }) {
    if (!id) return null;
    migrateJsonToDb();
    const db = getDb();

    const existing = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
    if (!existing) return null;

    const updates = [];
    const params = [];

    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
    if (isHidden !== undefined) { updates.push('is_hidden = ?'); params.push(isHidden ? 1 : 0); }
    if (isTest !== undefined) { updates.push('is_test = ?'); params.push(isTest ? 1 : 0); }
    if (linkedBrokerTradeId !== undefined) { updates.push('linked_broker_trade_id = ?'); params.push(linkedBrokerTradeId); }

    // Allow updating exit info for manual/open trades
    if (exitDate !== undefined) { updates.push('exit_date = ?'); params.push(exitDate); }
    if (exitPrice !== undefined) {
        const xp = typeof exitPrice === 'number' ? exitPrice : Number(exitPrice);
        updates.push('exit_price = ?'); params.push(xp);
        const ep = existing.entry_price;
        if (Number.isFinite(ep) && Number.isFinite(xp) && ep !== 0) {
            const { pnlAbsolute, pnlPercent } = calculateTradePnl(ep, xp);
            updates.push('pnl_absolute = ?'); params.push(pnlAbsolute);
            updates.push('pnl_percent = ?'); params.push(pnlPercent);
            updates.push("status = 'closed'");
        }
    }
    if (exitIBS !== undefined) { updates.push('exit_ibs = ?'); params.push(exitIBS); }

    if (updates.length === 0) return rowToTrade(existing);

    params.push(id);
    db.prepare(`UPDATE trades SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    const trade = rowToTrade(db.prepare('SELECT * FROM trades WHERE id = ?').get(id));
    if (
        exitDate !== undefined
        || exitPrice !== undefined
        || linkedBrokerTradeId !== undefined
        || (existing.status === 'open' && trade.status !== existing.status)
    ) {
        syncWatchesWithTradeState();
    }
    return trade;
}

function deleteTrade(id) {
    if (!id) return false;
    migrateJsonToDb();
    const db = getDb();
    const existing = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
    const result = db.prepare('DELETE FROM trades WHERE id = ?').run(id);
    if (result.changes > 0 && existing && existing.status === 'open') {
        syncWatchesWithTradeState();
    }
    return result.changes > 0;
}

// ─── Watches sync ─────────────────────────────────────────────────────────────

function isPositionOpen(watch) {
    return !!(watch.entryPrice !== null && watch.entryPrice !== undefined);
}

function synchronizeWatchesWithTradeHistory() {
    const openTrade = getCurrentOpenTrade();
    const openSymbol = openTrade ? openTrade.symbol : null;
    const changes = [];

    if (!telegramWatches) return { openTrade, changes };

    for (const watch of telegramWatches.values()) {
        const hadEntryPrice = !!(watch.isOpenPosition || isPositionOpen(watch) || watch.currentTradeId);
        const shouldBeOpen = !!openSymbol && watch.symbol.toUpperCase() === openSymbol;

        if (shouldBeOpen) {
            const nextPrice = openTrade.entryPrice ?? null;
            const priceChanged = watch.entryPrice !== nextPrice;
            const idChanged = watch.currentTradeId !== openTrade.id;
            if (priceChanged || idChanged || !hadEntryPrice) {
                changes.push({ symbol: watch.symbol, action: 'sync_open', previousPrice: watch.entryPrice, nextPrice });
            }
            watch.entryPrice = nextPrice;
            watch.entryDate = openTrade.entryDate ?? null;
            watch.entryIBS = openTrade.entryIBS ?? null;
            watch.entryDecisionTime = openTrade.entryDecisionTime ?? null;
            watch.currentTradeId = openTrade.id;
            watch.isOpenPosition = true;
        } else {
            if (hadEntryPrice || watch.entryPrice != null || watch.currentTradeId) {
                changes.push({ symbol: watch.symbol, action: 'sync_close', previousPrice: watch.entryPrice });
            }
            watch.entryPrice = null;
            watch.entryDate = null;
            watch.entryIBS = null;
            watch.entryDecisionTime = null;
            watch.currentTradeId = null;
            watch.isOpenPosition = false;
        }
    }

    return { openTrade, changes };
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function formatTradeSummary(trade) {
    if (!trade) return 'Нет сделок';
    const entryDate = trade.entryDate || '—';
    const exitDate = trade.exitDate || '—';
    const entryPrice = typeof trade.entryPrice === 'number' ? `$${trade.entryPrice.toFixed(2)}` : '—';
    const exitPrice = typeof trade.exitPrice === 'number' ? `$${trade.exitPrice.toFixed(2)}` : '—';
    const entryIbs = typeof trade.entryIBS === 'number' ? `${(trade.entryIBS * 100).toFixed(1)}%` : '—';
    const exitIbs = typeof trade.exitIBS === 'number' ? `${(trade.exitIBS * 100).toFixed(1)}%` : '—';
    const pnlPercent = typeof trade.pnlPercent === 'number' ? `${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent.toFixed(2)}%` : '—';
    return `${trade.symbol} • ${entryDate} → ${exitDate} • ${entryPrice} → ${exitPrice} • IBS ${entryIbs} → ${exitIbs} • PnL ${pnlPercent}`;
}

function buildTradeHistoryMessage(limit = 5) {
    const history = getSortedTradeHistory();
    if (!history.length) {
        return '<b>Последние сделки</b>\nСделок пока нет.';
    }

    const openTrade = getCurrentOpenTrade();
    const recent = history.slice(0, limit);
    const lines = ['<b>Последние сделки</b>'];

    if (openTrade) {
        lines.push(`🔔 Текущая позиция: ${formatTradeSummary(openTrade)}`);
        lines.push('');
    }

    let index = 1;
    for (const trade of recent) {
        lines.push(`${index}. ${formatTradeSummary(trade)}`);
        index += 1;
    }

    return lines.join('\n');
}

function serializeTradeForResponse(trade) {
    return {
        id: trade.id,
        symbol: trade.symbol,
        status: trade.status,
        entryDate: trade.entryDate,
        exitDate: trade.exitDate,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        entryIBS: trade.entryIBS,
        exitIBS: trade.exitIBS,
        entryDecisionTime: trade.entryDecisionTime,
        exitDecisionTime: trade.exitDecisionTime,
        pnlPercent: trade.pnlPercent,
        pnlAbsolute: trade.pnlAbsolute,
        holdingDays: trade.holdingDays,
        notes: trade.notes ?? null,
        source: trade.source ?? 'auto',
        isHidden: trade.isHidden ?? false,
        isTest: trade.isTest ?? false,
        brokerOrderId: trade.brokerOrderId ?? null,
        clientOrderId: trade.clientOrderId ?? null,
        filledQty: trade.filledQty ?? null,
        quantity: trade.quantity ?? null,
        linkedBrokerTradeId: trade.linkedBrokerTradeId ?? null,
    };
}

// ─── Legacy API compat ────────────────────────────────────────────────────────

// These were needed for async JSON loading — now no-ops since DB is always ready
async function loadTradeHistory() {
    migrateJsonToDb();
    if (telegramWatches && telegramWatches.size > 0) {
        syncWatchesWithTradeState();
    }
}

function scheduleSaveTradeHistory() { /* no-op: DB writes are immediate */ }
function ensureTradeHistoryLoaded() { migrateJsonToDb(); }
function isTradeHistoryLoaded() { return true; }

// Kept for any code that does `tradeHistory.length` etc.
const tradeHistory = new Proxy([], {
    get(_, prop) {
        const arr = getTradeHistory();
        if (prop === 'length') return arr.length;
        if (typeof prop === 'string' && !isNaN(Number(prop))) return arr[Number(prop)];
        if (typeof arr[prop] === 'function') return arr[prop].bind(arr);
        return arr[prop];
    }
});

module.exports = {
    tradeHistory,
    setTelegramWatches,
    normalizeTradeRecord,
    scheduleSaveTradeHistory,
    loadTradeHistory,
    ensureTradeHistoryLoaded,
    getCurrentOpenTrade,
    getTradeById,
    recordTradeEntry,
    recordTradeExit,
    upsertMonitorTradeFromBrokerTrade,
    closeMonitorTradeById,
    closeMonitorTradeFromBrokerTrade,
    createManualTrade,
    updateTrade,
    deleteTrade,
    isPositionOpen,
    synchronizeWatchesWithTradeHistory,
    syncWatchesWithTradeState,
    formatTradeSummary,
    buildTradeHistoryMessage,
    serializeTradeForResponse,
    getSortedTradeHistory,
    getTradeHistory,
    isTradeHistoryLoaded,
};
