/**
 * Shared formatting utilities for consistent display across the application
 */

/**
 * Format a number as USD currency with full precision
 * Example: 12345.67 → "$12,345.67"
 */
export function formatCurrencyUSD(value: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

/**
 * Format money values with compact notation (K, M)
 * Example: 1234567 → "$1.23M"
 */
export function formatMoney(value: number): string {
    if (value >= 1_000_000) {
        return `$${(value / 1_000_000).toFixed(2)}M`;
    } else if (value >= 1_000) {
        return `$${(value / 1_000).toFixed(1)}K`;
    } else {
        return `$${value.toFixed(2)}`;
    }
}

/**
 * Format currency with smart compact notation based on value
 * Example: 1500000 → "$1.5M", 1500 → "$1.5K"
 */
export function formatCurrencyCompact(value: number): string {
    if (Math.abs(value) >= 1_000_000) {
        return `$${(value / 1_000_000).toFixed(1)}M`;
    } else if (Math.abs(value) >= 1_000) {
        return `$${(value / 1_000).toFixed(1)}K`;
    } else {
        return `$${value.toFixed(2)}`;
    }
}

/**
 * Format a percentage value
 * Example: 0.1234 → "12.34%"
 */
export function formatPercent(value: number, decimals: number = 2): string {
    return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format a number with commas for thousands separator
 * Example: 1234567 → "1,234,567"
 */
export function formatNumber(value: number, decimals: number = 0): string {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
}

export function formatCurrencyValue(value: unknown, decimals: number = 2): string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '—';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(numeric);
}

export function formatNumberOrDash(value: unknown, decimals: number = 2): string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '—';
    return numeric.toFixed(decimals);
}

export function formatRatioPercent(value: unknown, decimals: number = 1): string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '—';
    return `${(numeric * 100).toFixed(decimals)}%`;
}

export function formatSignedPercentValue(value: unknown, decimals: number = 2): string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '—';
    const sign = numeric > 0 ? '+' : '';
    return `${sign}${numeric.toFixed(decimals)}%`;
}

export function formatHoldingDays(value: unknown, decimals: number = 1): string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '—';
    return `${numeric.toFixed(decimals)} дн.`;
}

export function formatDateET(value: string | null | undefined): string {
    if (!value) return '—';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-');
        return `${day}.${month}.${year}`;
    }
    try {
        return new Date(value).toLocaleDateString('ru-RU', {
            timeZone: 'America/New_York',
        });
    } catch {
        return value;
    }
}

export function formatDateTimeET(
    value: string | null | undefined,
    options: {
        withSeconds?: boolean;
        includeZone?: boolean;
    } = {}
): string {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            ...(options.withSeconds ? { second: '2-digit' as const } : {}),
            ...(options.includeZone ? { timeZoneName: 'short' as const } : {}),
            timeZone: 'America/New_York',
        });
    } catch {
        return value;
    }
}
