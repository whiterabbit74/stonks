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
