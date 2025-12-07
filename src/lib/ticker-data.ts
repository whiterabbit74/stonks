/**
 * Static ticker data for local search without API requests
 * Data is loaded from tickers.json
 */

import tickersData from '../data/tickers.json';

export interface TickerInfo {
    symbol: string;
    name: string;
    categories: string[];
}

export const TICKER_DATA: TickerInfo[] = tickersData as TickerInfo[];

export const CATEGORIES = [
    { id: 'all', label: 'Все', icon: '📊' },
    { id: 'popular', label: 'Популярные', icon: '⭐' },
    { id: 'nasdaq100', label: 'NASDAQ 100', icon: '📈' },
    { id: 'sp500', label: 'S&P 500', icon: '🏛️' },
    { id: 'tech', label: 'Технологии', icon: '💻' },
    { id: 'finance', label: 'Финансы', icon: '🏦' },
    { id: 'health', label: 'Здравоохранение', icon: '🏥' },
    { id: 'energy', label: 'Энергетика', icon: '⚡' },
    { id: 'consumer', label: 'Потребительские', icon: '🛒' },
    { id: 'etf', label: 'ETF', icon: '📦' },
    { id: 'leveraged', label: 'С плечом', icon: '🚀' },
];

/**
 * Search tickers by symbol or company name
 */
export function searchTickers(query: string, category?: string): TickerInfo[] {
    const normalizedQuery = query.toLowerCase().trim();

    let results = TICKER_DATA;

    // Filter by category first
    if (category && category !== 'all') {
        results = results.filter(t => t.categories.includes(category));
    }

    // Then filter by search query
    if (normalizedQuery) {
        results = results.filter(t =>
            t.symbol.toLowerCase().includes(normalizedQuery) ||
            t.name.toLowerCase().includes(normalizedQuery)
        );
    }

    return results;
}

/**
 * Get tickers by category
 */
export function getTickersByCategory(category: string): TickerInfo[] {
    if (category === 'all') {
        return TICKER_DATA;
    }
    return TICKER_DATA.filter(t => t.categories.includes(category));
}

/**
 * Get ticker info by symbol
 */
export function getTickerInfo(symbol: string): TickerInfo | undefined {
    return TICKER_DATA.find(t => t.symbol.toUpperCase() === symbol.toUpperCase());
}
