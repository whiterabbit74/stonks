/**
 * Broker trade journal service — backed by broker_trades SQLite table.
 * Stores only real executed trades (autotrade + manual corrections).
 * Separate from trades.js which handles virtual monitoring trades.
 */
const crypto = require('crypto');
const { getDb } = require('../db');

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
        notes: row.notes ?? null,
        source: row.source ?? 'auto',
        isHidden: row.is_hidden === 1,
        isTest: row.is_test === 1,
        brokerOrderId: row.broker_order_id ?? null,
        clientOrderId: row.client_order_id ?? null,
        filledQty: row.filled_qty ?? null,
        quantity: row.quantity ?? null,
    };
}

function calcPnl(entryPrice, exitPrice) {
    if (entryPrice == null || exitPrice == null) return { pnlAbsolute: null, pnlPercent: null };
    const diff = exitPrice - entryPrice;
    return {
        pnlAbsolute: Number(diff.toFixed(6)),
        pnlPercent: Number(((diff / entryPrice) * 100).toFixed(6)),
    };
}

function calcHoldingDays(entryDate, exitDate) {
    if (!entryDate || !exitDate) return null;
    const d1 = new Date(entryDate);
    const d2 = new Date(exitDate);
    if (Number.isNaN(d1.valueOf()) || Number.isNaN(d2.valueOf())) return null;
    const diff = Math.round((d2.getTime() - d1.getTime()) / (24 * 3600 * 1000));
    return diff >= 0 ? Math.max(1, diff) : null;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

function getCurrentOpenBrokerTrade() {
    const db = getDb();
    const row = db.prepare(`
        SELECT * FROM broker_trades WHERE status = 'open'
        ORDER BY COALESCE(entry_decision_time, entry_date) DESC
        LIMIT 1
    `).get();
    return row ? rowToTrade(row) : null;
}

function getSortedBrokerTrades() {
    const db = getDb();
    return db.prepare(`
        SELECT * FROM broker_trades
        ORDER BY COALESCE(exit_decision_time, exit_date, entry_decision_time, entry_date) DESC
    `).all().map(rowToTrade);
}

// ─── Write (autotrade) ────────────────────────────────────────────────────────

function recordBrokerEntry({ symbol, price, ibs, decisionTime, dateKey, source, clientOrderId, brokerOrderId, filledQty, quantity }) {
    if (!symbol) return null;
    const db = getDb();

    const normalizedSymbol = symbol.toUpperCase();
    const openTrade = getCurrentOpenBrokerTrade();
    if (openTrade) {
        console.warn(`broker_trades: cannot open new trade for ${normalizedSymbol}: trade ${openTrade.id} is still open for ${openTrade.symbol}`);
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
        INSERT INTO broker_trades
            (id, symbol, status, entry_date, entry_price, entry_ibs, entry_decision_time,
             source, broker_order_id, client_order_id, filled_qty, quantity)
        VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, normalizedSymbol, entryDate, entryPrice, entryIBS, entryDecisionTime,
           tradeSource, brokerOrderId ?? null, clientOrderId ?? null, filledQtyVal, qty);

    return rowToTrade(db.prepare('SELECT * FROM broker_trades WHERE id = ?').get(id));
}

function recordBrokerExit({ symbol, price, ibs, decisionTime, dateKey, clientOrderId, brokerOrderId, filledQty }) {
    if (!symbol) return null;
    const db = getDb();

    const normalizedSymbol = symbol.toUpperCase();
    const openTrade = getCurrentOpenBrokerTrade();
    if (!openTrade || openTrade.symbol !== normalizedSymbol) {
        console.warn(`broker_trades: no matching open trade for ${normalizedSymbol} to close`);
        return null;
    }

    const exitPrice = typeof price === 'number' ? price : null;
    const exitDate = dateKey || null;
    const exitDecisionTime = decisionTime || new Date().toISOString();
    const { pnlAbsolute, pnlPercent } = calcPnl(openTrade.entryPrice, exitPrice);
    const holdingDays = calcHoldingDays(openTrade.entryDate, exitDate);

    db.prepare(`
        UPDATE broker_trades SET
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

    return rowToTrade(db.prepare('SELECT * FROM broker_trades WHERE id = ?').get(openTrade.id));
}

// ─── Manual trade management ──────────────────────────────────────────────────

function createManualBrokerTrade({ symbol, entryDate, exitDate, entryPrice, exitPrice, entryIBS, exitIBS, notes, quantity }) {
    if (!symbol) return null;
    const db = getDb();

    const normalizedSymbol = symbol.toUpperCase();
    const ep = typeof entryPrice === 'number' ? entryPrice : (entryPrice != null ? Number(entryPrice) : null);
    const xp = typeof exitPrice === 'number' ? exitPrice : (exitPrice != null ? Number(exitPrice) : null);
    const status = (exitDate || xp != null) ? 'closed' : 'open';
    const { pnlAbsolute, pnlPercent } = calcPnl(ep, xp);
    const holdingDays = calcHoldingDays(entryDate, exitDate);

    const id = crypto.randomUUID();
    db.prepare(`
        INSERT INTO broker_trades
            (id, symbol, status, entry_date, exit_date, entry_price, exit_price,
             entry_ibs, exit_ibs, pnl_absolute, pnl_percent, holding_days, notes,
             source, quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)
    `).run(id, normalizedSymbol, status, entryDate || null, exitDate || null,
           ep, xp,
           typeof entryIBS === 'number' ? entryIBS : null,
           typeof exitIBS === 'number' ? exitIBS : null,
           pnlAbsolute, pnlPercent, holdingDays,
           typeof notes === 'string' ? notes : null,
           typeof quantity === 'number' ? quantity : null);

    return rowToTrade(db.prepare('SELECT * FROM broker_trades WHERE id = ?').get(id));
}

function updateBrokerTrade(id, { notes, isHidden, isTest, exitDate, exitPrice, exitIBS }) {
    if (!id) return null;
    const db = getDb();

    const existing = db.prepare('SELECT * FROM broker_trades WHERE id = ?').get(id);
    if (!existing) return null;

    const updates = [];
    const params = [];

    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
    if (isHidden !== undefined) { updates.push('is_hidden = ?'); params.push(isHidden ? 1 : 0); }
    if (isTest !== undefined) { updates.push('is_test = ?'); params.push(isTest ? 1 : 0); }

    if (exitDate !== undefined) { updates.push('exit_date = ?'); params.push(exitDate); }
    if (exitPrice !== undefined) {
        const xp = typeof exitPrice === 'number' ? exitPrice : Number(exitPrice);
        updates.push('exit_price = ?'); params.push(xp);
        const ep = existing.entry_price;
        if (ep && xp) {
            const { pnlAbsolute, pnlPercent } = calcPnl(ep, xp);
            updates.push('pnl_absolute = ?'); params.push(pnlAbsolute);
            updates.push('pnl_percent = ?'); params.push(pnlPercent);
            updates.push("status = 'closed'");
        }
    }
    if (exitIBS !== undefined) { updates.push('exit_ibs = ?'); params.push(exitIBS); }

    if (updates.length === 0) return rowToTrade(existing);

    params.push(id);
    db.prepare(`UPDATE broker_trades SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return rowToTrade(db.prepare('SELECT * FROM broker_trades WHERE id = ?').get(id));
}

function deleteBrokerTrade(id) {
    if (!id) return false;
    const db = getDb();
    const result = db.prepare('DELETE FROM broker_trades WHERE id = ?').run(id);
    return result.changes > 0;
}

// ─── Serialization ────────────────────────────────────────────────────────────

function serializeBrokerTradeForResponse(trade) {
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
    };
}

module.exports = {
    getCurrentOpenBrokerTrade,
    getSortedBrokerTrades,
    recordBrokerEntry,
    recordBrokerExit,
    createManualBrokerTrade,
    updateBrokerTrade,
    deleteBrokerTrade,
    serializeBrokerTradeForResponse,
};
