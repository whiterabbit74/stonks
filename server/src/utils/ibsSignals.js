/**
 * Пороги IBS для монитора и автотрейда.
 *
 * Сравнения строгие — ровно как в бэктесте (`ibs < lowIBS`, `ibs > highIBS`).
 * Нестрогие `<=` / `>=` давали вход и выход на ровном пороге там, где расчёт
 * стратегии сделку не делает: high=100, low=90, close=91 -> IBS = 0.10.
 */

const DEFAULT_LOW_IBS = 0.1;
const DEFAULT_HIGH_IBS = 0.75;

function resolveThreshold(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isIbsEntrySignal(ibs, lowIBS) {
    if (typeof ibs !== 'number' || !Number.isFinite(ibs)) return false;
    return ibs < resolveThreshold(lowIBS, DEFAULT_LOW_IBS);
}

function isIbsExitSignal(ibs, highIBS) {
    if (typeof ibs !== 'number' || !Number.isFinite(ibs)) return false;
    return ibs > resolveThreshold(highIBS, DEFAULT_HIGH_IBS);
}

module.exports = {
    isIbsEntrySignal,
    isIbsExitSignal,
    DEFAULT_LOW_IBS,
    DEFAULT_HIGH_IBS,
};
