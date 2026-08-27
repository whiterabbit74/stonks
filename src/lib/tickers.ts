const DEFAULT_MULTI_TICKER_SYMBOLS_FALLBACK = 'AAPL,MSFT,AMZN,MAGS';

export function getDefaultTickers(symbolsStr?: string | null): string[] {
  return (symbolsStr || DEFAULT_MULTI_TICKER_SYMBOLS_FALLBACK)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}
