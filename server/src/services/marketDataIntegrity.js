const COMMON_SPLIT_FACTORS = [2, 3, 4, 5, 7, 10, 20];
const DEFAULT_FACTOR_TOLERANCE = 0.08;
// Minimum bar-to-bar ratio worth treating as split-like. A real split is at
// least 1:2, so nothing under ~2x is a split — smaller moves are normal market
// action and must not be flagged. 1.9 leaves ~5% slack for imperfect data below
// a clean 2.0 while staying well clear of ordinary volatility.
const DEFAULT_MIN_SPLIT_FACTOR = 1.9;

function toFiniteNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function normalizeDate(value) {
    if (!value) return null;
    if (typeof value === 'string') return value.slice(0, 10);
    try {
        return new Date(value).toISOString().slice(0, 10);
    } catch {
        return null;
    }
}

function getLastFiniteCloseBar(datasetOrRows) {
    const rows = Array.isArray(datasetOrRows)
        ? datasetOrRows
        : Array.isArray(datasetOrRows && datasetOrRows.data)
            ? datasetOrRows.data
            : [];
    if (!rows.length) return null;

    const sorted = rows
        .filter((row) => row && normalizeDate(row.date))
        .slice()
        .sort((a, b) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)));

    for (let i = sorted.length - 1; i >= 0; i--) {
        const close = toFiniteNumber(sorted[i].close);
        if (close != null && close > 0) {
            return {
                ...sorted[i],
                date: normalizeDate(sorted[i].date),
                close,
            };
        }
    }
    return null;
}

function findNearestSplitFactor(factorRatio, options = {}) {
    const tolerance = toFiniteNumber(options.factorTolerance) ?? DEFAULT_FACTOR_TOLERANCE;
    let best = null;
    for (const factor of COMMON_SPLIT_FACTORS) {
        const relativeDistance = Math.abs(factorRatio / factor - 1);
        if (relativeDistance <= tolerance && (!best || relativeDistance < best.relativeDistance)) {
            best = { factor, relativeDistance };
        }
    }
    return best;
}

function normalizeSplitEvents(events) {
    return (Array.isArray(events) ? events : [])
        .map((event) => ({
            date: normalizeDate(event && event.date),
            factor: toFiniteNumber(event && event.factor),
        }))
        .filter((event) => event.date && event.factor != null && event.factor > 0 && event.factor !== 1)
        .sort((a, b) => a.date.localeCompare(b.date));
}

function findKnownSplitBoundary({ previousDate, currentDate, matchedFactor, knownSplits }) {
    if (!previousDate || !currentDate) return null;
    const events = normalizeSplitEvents(knownSplits);
    return events.find((event) => {
        if (!(event.date > previousDate && event.date <= currentDate)) return false;
        if (!matchedFactor) return true;
        const eventFactor = Math.max(event.factor, 1 / event.factor);
        const factorDistance = Math.abs(eventFactor / matchedFactor - 1);
        return factorDistance <= DEFAULT_FACTOR_TOLERANCE;
    }) || null;
}

function formatPrice(value) {
    return toFiniteNumber(value) == null ? '—' : `$${Number(value).toFixed(2)}`;
}

function formatFactor(value) {
    return toFiniteNumber(value) == null ? '—' : `x${Number(value).toFixed(2)}`;
}

function buildTelegramLines(result) {
    const matchedText = result.matchedFactor
        ? `похоже на ${result.matchedFactor}:1`
        : 'слишком большой разрыв';
    const reasonText = result.code === 'adjusted_dataset_split_gap'
        ? 'ряд помечен как split-adjusted, но цена всё равно скачет как при сплите'
        : 'в ручных сплитах нет события, которое объясняет такой скачок';

    return [
        `${result.symbol}: EMA/IBS сигналы заблокированы`,
        `база ${result.previousDate || '—'}: ${formatPrice(result.previousClose)}`,
        `сейчас ${result.currentDate || '—'}: ${formatPrice(result.currentPrice)}`,
        `отношение: ${formatFactor(result.factorRatio)} (${matchedText})`,
        `причина: ${reasonText}`,
    ];
}

function normalizeOhlcRows(rows) {
    return (Array.isArray(rows) ? rows : [])
        .map((row) => {
            const date = normalizeDate(row && row.date);
            if (!date) return null;
            const close = toFiniteNumber(row && row.close);
            const open = toFiniteNumber(row && row.open);
            const high = toFiniteNumber(row && row.high);
            const low = toFiniteNumber(row && row.low);
            const adjClose = toFiniteNumber(row && (row.adjClose ?? row.adj_close));
            const volume = toFiniteNumber(row && row.volume);
            return {
                date,
                open,
                high,
                low,
                close,
                adjClose: adjClose ?? close,
                volume: volume ?? 0,
            };
        })
        .filter((row) => row && row.close != null && row.close > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
}

function mergeOhlcRowsForIntegrity(existingRows, incomingRows) {
    const byDate = new Map();
    for (const row of normalizeOhlcRows(existingRows)) {
        byDate.set(row.date, row);
    }
    for (const row of normalizeOhlcRows(incomingRows)) {
        byDate.set(row.date, row);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function evaluatePriceIntegrity(input = {}) {
    const symbol = String(input.symbol || '').trim().toUpperCase() || 'UNKNOWN';
    const previousBar = input.previousBar || getLastFiniteCloseBar(input.dataset || input.history);
    const previousClose = toFiniteNumber(previousBar && previousBar.close);
    const currentPrice = toFiniteNumber(input.currentPrice ?? input.quote?.current ?? input.quote?.close);
    const previousDate = normalizeDate(previousBar && previousBar.date);
    const currentDate = normalizeDate(input.currentDate || input.quote?.date || new Date());
    const adjustedForSplits = !!input.adjustedForSplits || !!(input.dataset && input.dataset.adjustedForSplits);

    const base = {
        ok: true,
        blockSignals: false,
        symbol,
        previousDate,
        currentDate,
        previousClose,
        currentPrice,
    };

    if (previousClose == null || previousClose <= 0 || currentPrice == null || currentPrice <= 0) {
        return { ...base, checked: false, reason: 'not_enough_price_data' };
    }

    const downRatio = previousClose / currentPrice;
    const upRatio = currentPrice / previousClose;
    const factorRatio = Math.max(downRatio, upRatio);
    const percentChange = ((currentPrice / previousClose) - 1) * 100;
    const nearest = findNearestSplitFactor(factorRatio, input);
    const matchedFactor = nearest ? nearest.factor : null;
    const knownSplitBoundary = findKnownSplitBoundary({
        previousDate,
        currentDate,
        matchedFactor,
        knownSplits: input.knownSplits,
    });
    // A real split is at least 1:2 (one share → two, price ~halves; or a reverse
    // split, price ~doubles). So the ONLY thing worth flagging is a move whose
    // ratio is at least ~2x. Everyday volatility — even a violent +45% / -30% day
    // on a leveraged or freshly-listed ticker — stays below this and is ignored.
    const minSplitFactor = toFiniteNumber(input.minSplitFactor) ?? DEFAULT_MIN_SPLIT_FACTOR;
    const splitLike = !!nearest;                      // ratio sits on a clean split factor (2,3,4,…)
    const extremeGap = factorRatio >= minSplitFactor;  // ≥ ~2x but not a clean factor (e.g. 2.5x, 6x, 15x)

    const common = {
        ...base,
        checked: true,
        factorRatio,
        percentChange,
        matchedFactor,
        knownSplitBoundary: !!knownSplitBoundary,
        knownSplit: knownSplitBoundary || null,
    };

    if ((splitLike || extremeGap) && knownSplitBoundary && !adjustedForSplits) {
        return {
            ...common,
            ok: true,
            blockSignals: false,
        };
    }

    if ((splitLike || extremeGap) && adjustedForSplits && knownSplitBoundary) {
        const result = {
            ...common,
            ok: false,
            blockSignals: true,
            severity: 'blocked',
            code: 'adjusted_dataset_split_gap',
        };
        return { ...result, telegramLines: buildTelegramLines(result) };
    }

    if (splitLike || extremeGap) {
        const result = {
            ...common,
            ok: false,
            blockSignals: true,
            severity: 'blocked',
            code: splitLike ? 'possible_split_or_mixed_adjustment' : 'suspicious_price_gap',
        };
        return { ...result, telegramLines: buildTelegramLines(result) };
    }

    return common;
}

function validateOhlcSeriesIntegrity(input = {}) {
    const rows = normalizeOhlcRows(input.rows);
    const touchedDates = new Set(Array.isArray(input.touchedDates) ? input.touchedDates.map(normalizeDate).filter(Boolean) : []);
    const warnings = [];

    for (let i = 1; i < rows.length; i++) {
        const previousBar = rows[i - 1];
        const currentBar = rows[i];
        if (touchedDates.size > 0 && !touchedDates.has(previousBar.date) && !touchedDates.has(currentBar.date)) {
            continue;
        }
        const currentPrice = currentBar.open != null && currentBar.open > 0 ? currentBar.open : currentBar.close;
        const warning = evaluatePriceIntegrity({
            symbol: input.symbol,
            previousBar,
            currentPrice,
            currentDate: currentBar.date,
            knownSplits: input.knownSplits,
            adjustedForSplits: input.adjustedForSplits,
            factorTolerance: input.factorTolerance,
            minSplitFactor: input.minSplitFactor,
        });

        if (warning && warning.blockSignals) {
            warnings.push({
                ...warning,
                currentOpen: currentBar.open,
                currentClose: currentBar.close,
            });
        }
    }

    return {
        ok: warnings.length === 0,
        blockWrite: warnings.length > 0,
        rows,
        warnings,
    };
}

function validateOhlcMergeIntegrity(input = {}) {
    const incomingRows = normalizeOhlcRows(input.incomingRows);
    const mergedRows = mergeOhlcRowsForIntegrity(input.existingRows, incomingRows);
    if (incomingRows.length === 0) {
        return {
            ok: true,
            blockWrite: false,
            rows: mergedRows,
            warnings: [],
            mergedRows,
            existingRowsChecked: normalizeOhlcRows(input.existingRows).length,
            incomingRowsChecked: 0,
        };
    }
    const validation = validateOhlcSeriesIntegrity({
        ...input,
        rows: mergedRows,
        touchedDates: incomingRows.map((row) => row.date),
    });

    return {
        ...validation,
        mergedRows,
        existingRowsChecked: normalizeOhlcRows(input.existingRows).length,
        incomingRowsChecked: incomingRows.length,
    };
}

function createOhlcIntegrityError(result, context = {}) {
    const first = result && Array.isArray(result.warnings) ? result.warnings[0] : null;
    const symbol = String(context.symbol || (first && first.symbol) || 'UNKNOWN').toUpperCase();
    const message = first
        ? `${symbol}: запись данных заблокирована, найден скачок цены ${first.previousDate} -> ${first.currentDate}, похожий на сплит без корректной ручной записи`
        : `${symbol}: запись данных заблокирована проверкой целостности цен`;
    const error = new Error(message);
    error.status = 409;
    error.code = 'DATA_INTEGRITY_BLOCKED';
    error.integrity = result;
    return error;
}

function integrityWarningKey(warning) {
    if (!warning) return '';
    return [
        warning.symbol,
        warning.code,
        warning.previousDate,
        warning.currentDate,
        warning.previousClose,
        warning.currentPrice,
    ].join('|');
}

// Per-warning lines for the DATA-WRITE alert. Unlike buildTelegramLines (which
// says signals were BLOCKED), here the data was written and just needs a human
// to confirm whether the gap is a real split or a bad bar.
function buildDataWriteAlertLines(symbol, action, warning) {
    const matchedText = warning.matchedFactor
        ? `похоже на сплит ${warning.matchedFactor}:1`
        : 'слишком большой разрыв';
    return [
        `${symbol}: данные записаны, нужна проверка`,
        `действие: ${action}`,
        `разрыв ${warning.previousDate || '—'} → ${warning.currentDate || '—'}`,
        `${formatPrice(warning.previousClose)} → ${formatPrice(warning.currentPrice)} (${formatFactor(warning.factorRatio)}, ${matchedText})`,
        'реальный сплит → добавьте его в ручные сплиты; ошибка данных → поправьте/удалите бар',
    ];
}

function formatDataWriteIntegrityAlert(symbol, action, warnings) {
    const unique = new Map();
    for (const warning of Array.isArray(warnings) ? warnings : []) {
        if (!warning) continue;
        unique.set(integrityWarningKey(warning), warning);
    }
    if (unique.size === 0) return '';

    const chunks = [];
    for (const warning of unique.values()) {
        const lines = buildDataWriteAlertLines(symbol, action, warning);
        chunks.push(lines.map((line, index) => index === 0 ? `• ${line}` : `  ${line}`).join('\n'));
    }

    return `⚠️ ПРОВЕРКА ДАННЫХ (записано)\n${chunks.join('\n')}`;
}

function formatIntegrityWarningBlock(warnings) {
    const unique = new Map();
    for (const warning of Array.isArray(warnings) ? warnings : []) {
        if (!warning || !warning.blockSignals) continue;
        unique.set(integrityWarningKey(warning), warning);
    }
    if (unique.size === 0) return '';

    const chunks = [];
    for (const warning of unique.values()) {
        const lines = Array.isArray(warning.telegramLines) && warning.telegramLines.length > 0
            ? warning.telegramLines
            : buildTelegramLines(warning);
        chunks.push(lines.map((line, index) => index === 0 ? `• ${line}` : `  ${line}`).join('\n'));
    }

    return `⚠️ ПРОВЕРКА ДАННЫХ\n${chunks.join('\n')}`;
}

module.exports = {
    createOhlcIntegrityError,
    evaluatePriceIntegrity,
    findNearestSplitFactor,
    formatDataWriteIntegrityAlert,
    formatIntegrityWarningBlock,
    getLastFiniteCloseBar,
    integrityWarningKey,
    mergeOhlcRowsForIntegrity,
    validateOhlcMergeIntegrity,
    validateOhlcSeriesIntegrity,
};
