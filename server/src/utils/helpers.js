/**
 * General helper utilities
 */

function parseNonNegativeNumber(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return fallback;
    }
    return parsed;
}

function toSafeTicker(raw) {
    if (!raw || typeof raw !== 'string') return '';
    const cleaned = raw.replace(/[^A-Za-z0-9.-]/g, '').toUpperCase();
    return cleaned.length > 10 ? cleaned.slice(0, 10) : cleaned;
}

function formatMoney(n) {
    return (typeof n === 'number' && isFinite(n)) ? `$${n.toFixed(2)}` : '-';
}

function toFiniteNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

module.exports = {
    parseNonNegativeNumber,
    toSafeTicker,
    formatMoney,
    toFiniteNumber,
    sleep,
};
