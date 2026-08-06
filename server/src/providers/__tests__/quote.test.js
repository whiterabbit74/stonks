import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const repoRoot = process.cwd();
const serverRoot = path.join(repoRoot, 'server');
const require = createRequire(import.meta.url);

function purgeServerCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(serverRoot)) delete require.cache[key];
  }
}

function stubModule(relativePathFromServerRoot, exports) {
  const fullPath = path.join(serverRoot, relativePathFromServerRoot);
  require.cache[fullPath] = {
    id: fullPath,
    filename: fullPath,
    loaded: true,
    exports,
  };
}

afterEach(() => {
  purgeServerCache();
  vi.useRealTimers();
});

describe('quote provider fallback', () => {
  it('retries Finnhub CDN errors then falls back to Webull', async () => {
    vi.useFakeTimers();
    let finnhubCalls = 0;
    stubModule('src/providers/finnhub.js', {
      fetchTodayRangeAndQuote: async () => {
        finnhubCalls += 1;
        const err = new Error('Finnhub quote: temporary CDN error 1200 (HTTP 503)');
        err.status = 503;
        throw err;
      },
    });
    stubModule('src/providers/webull.js', {
      fetchTodayRangeAndQuote: async () => ({
        quote: { current: 72.5 },
        range: { low: 70, high: 73 },
        source: 'webull',
      }),
    });

    const { fetchTodayRangeAndQuote } = require(path.join(serverRoot, 'src/providers/quote.js'));
    const promise = fetchTodayRangeAndQuote('TQQQ', { retries: 2, retryDelayMs: 10 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(finnhubCalls).toBe(3);
    expect(result.source).toBe('webull');
    expect(result.quote.current).toBe(72.5);
  });

  it('returns Finnhub result without Webull when first attempt works', async () => {
    stubModule('src/providers/finnhub.js', {
      fetchTodayRangeAndQuote: async () => ({
        quote: { current: 100 },
        range: { low: 99, high: 101 },
        source: 'finnhub',
      }),
    });
    stubModule('src/providers/webull.js', {
      fetchTodayRangeAndQuote: async () => {
        throw new Error('webull should not be called');
      },
    });

    const { fetchTodayRangeAndQuote } = require(path.join(serverRoot, 'src/providers/quote.js'));
    const result = await fetchTodayRangeAndQuote('AAPL');
    expect(result.source).toBe('finnhub');
    expect(result.quote.current).toBe(100);
  });
});

describe('finnhub parseJsonResponse', () => {
  it('maps Cloudflare plain-text error codes to transient errors', () => {
    const { parseJsonResponse } = require(path.join(serverRoot, 'src/providers/finnhub.js'));
    expect(() => parseJsonResponse('error code: 1200\n', 'Finnhub quote', 503)).toThrow(
      /temporary CDN error 1200/
    );
  });
});
