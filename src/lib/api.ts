import type { SavedDataset, MonitorTradeHistoryResponse } from '../types';
import { logError, logWarn } from './error-logger';

// Runtime-safe API base to avoid hardcoded dev hosts in production bundles
export const API_BASE_URL: string = '/api';

interface NetworkError extends Error {
  code?: string;
  status?: number;
  retryable?: boolean;
}

interface FetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * Creates a timeout promise that rejects after specified milliseconds
 */
function createTimeoutPromise(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      const error = new Error(`Request timeout after ${timeoutMs}ms`) as NetworkError;
      error.code = 'TIMEOUT';
      error.retryable = true;
      reject(error);
    }, timeoutMs);
  });
}

/**
 * Determines if an error is retryable
 */
function isRetryableError(error: NetworkError): boolean {
  if (error.retryable !== undefined) return error.retryable;
  
  // Network errors are generally retryable
  if (error.code === 'TIMEOUT' || error.message.includes('Failed to fetch')) {
    return true;
  }
  
  // HTTP status codes that are retryable
  if (error.status) {
    return error.status >= 500 || error.status === 429 || error.status === 408;
  }
  
  return false;
}

/**
 * Waits for specified milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Enhanced fetch with timeout, retries, and proper error handling
 */
export async function fetchWithCreds(
  input: RequestInfo | URL, 
  init?: FetchOptions
): Promise<Response> {
  const {
    timeout = 30000, // 30 second default timeout
    retries = 3,
    retryDelay = 1000,
    ...fetchInit
  } = init || {};
  
  const merged: RequestInit = {
    credentials: 'include',
    cache: 'no-store',
    ...fetchInit,
    headers: {
      'Cache-Control': 'no-store',
      ...(fetchInit.headers || {}),
    },
  };

  let lastError: NetworkError | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      merged.signal = controller.signal;
      
      // Race between fetch and timeout
      const response = await Promise.race([
        fetch(input, merged),
        createTimeoutPromise(timeout)
      ]);
      
      // Log successful request after retries
      if (attempt > 0) {
        logWarn('network', `Request succeeded after ${attempt} retries`, {
          url: String(input),
          attempt
        });
      }
      
      return response;
    } catch (error: any) {
      const networkError = error as NetworkError;
      
      // Enhance error with status if it's a Response
      if (error.status) {
        networkError.status = error.status;
      }
      
      lastError = networkError;
      
      // Don't retry on last attempt
      if (attempt === retries) {
        break;
      }
      
      // Only retry if error is retryable
      if (!isRetryableError(networkError)) {
        logError('network', `Non-retryable error, aborting retries`, {
          url: String(input),
          error: networkError.message,
          attempt
        });
        break;
      }
      
      // Log retry attempt
      logWarn('network', `Request failed, retrying (${attempt + 1}/${retries})`, {
        url: String(input),
        error: networkError.message,
        nextRetryIn: retryDelay
      });
      
      // Wait before retry with exponential backoff
      await delay(retryDelay * Math.pow(2, attempt));
    }
  }
  
  // Log final failure
  logError('network', `Request failed after ${retries + 1} attempts`, {
    url: String(input),
    error: lastError?.message,
    finalError: lastError
  });
  
  throw lastError || new Error('Unknown network error');
}

/**
 * Checks if the browser is online
 */
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Waits for network connectivity to be restored
 */
export function waitForOnline(): Promise<void> {
  return new Promise((resolve) => {
    if (isOnline()) {
      resolve();
      return;
    }
    
    const handleOnline = () => {
      window.removeEventListener('online', handleOnline);
      resolve();
    };
    
    window.addEventListener('online', handleOnline);
  });
}

/**
 * Enhanced API call wrapper with network resilience
 */
export async function apiCall<T>(
  url: string,
  options?: FetchOptions & { waitForOnline?: boolean }
): Promise<T> {
  const { waitForOnline: shouldWaitForOnline = true, ...fetchOptions } = options || {};
  
  // Wait for connectivity if offline and requested
  if (shouldWaitForOnline && !isOnline()) {
    logWarn('network', 'Waiting for network connectivity', { url });
    await waitForOnline();
    logWarn('network', 'Network connectivity restored', { url });
  }
  
  const response = await fetchWithCreds(url, fetchOptions);
  
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as NetworkError;
    error.status = response.status;
    error.retryable = response.status >= 500 || response.status === 429;
    throw error;
  }
  
  return response.json();
}

export class DatasetAPI {
  static async getSplits(symbol: string): Promise<Array<{ date: string; factor: number }>> {
    try {
      const response = await fetchWithCreds(`${API_BASE_URL}/splits/${encodeURIComponent(symbol)}`);
      if (!response.ok) {
        // Жёсткая политика: нет внешних провайдеров — только локальные сплиты; ошибки проглатываем → []
        logWarn('network', `Failed to fetch splits for ${symbol}, returning empty array`, {
          symbol,
          status: response.status,
          statusText: response.statusText
        });
        return [];
      }
      return response.json();
    } catch (error) {
      logError('network', `Network error fetching splits for ${symbol}`, {
        symbol,
        error: (error as Error).message
      });
      return []; // Graceful fallback for splits API
    }
  }

  static async getSplitsMap(): Promise<Record<string, Array<{ date: string; factor: number }>>> {
    try {
      // Primary: ask server for the whole map (fast path)
      const response = await fetchWithCreds(`${API_BASE_URL}/splits`);
      if (response.ok) {
        return response.json();
      }
      // If endpoint is missing (older server) — gracefully fallback to per-ticker aggregation
      if (response.status === 404) {
        logWarn('network', 'Splits map endpoint not found, falling back to per-ticker aggregation');
        const map: Record<string, Array<{ date: string; factor: number }>> = {};
        const list = await this.getDatasets().catch((err) => {
          logError('network', 'Failed to get datasets for splits map fallback', {
            error: (err as Error).message
          });
          return [];
        });
        for (const d of list) {
          const ticker = (d.ticker || (d as unknown as { id?: string }).id || d.name || '').toUpperCase();
          if (!ticker) continue;
          try {
            const s = await this.getSplits(ticker);
            if (Array.isArray(s) && s.length) map[ticker] = s;
          } catch (err) {
            logWarn('network', `Failed to fetch splits for ${ticker} in fallback mode`, {
              ticker,
              error: (err as Error).message
            });
          }
        }
        return map;
      }
      throw new Error(`Failed to fetch splits map: ${response.status} ${response.statusText}`);
    } catch (error) {
      logError('network', 'Network error in getSplitsMap', {
        error: (error as Error).message
      });
      throw error;
    }
  }

  static async setSplits(symbol: string, events: Array<{ date: string; factor: number }>): Promise<{ success: boolean; symbol: string; events: Array<{ date: string; factor: number }> }> {
    const response = await fetchWithCreds(`${API_BASE_URL}/splits/${encodeURIComponent(symbol)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(events),
    });
    if (!response.ok) {
      const e = await response.json().catch(() => null);
      const msg = (e && e.error) || response.statusText;
      throw new Error(`Failed to save splits: ${msg}`);
    }
    return response.json();
  }

  static async upsertSplits(symbol: string, events: Array<{ date: string; factor: number }>): Promise<{ success: boolean; symbol: string; events: Array<{ date: string; factor: number }> }> {
    const response = await fetchWithCreds(`${API_BASE_URL}/splits/${encodeURIComponent(symbol)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(events),
    });
    if (!response.ok) {
      const e = await response.json().catch(() => null);
      const msg = (e && e.error) || response.statusText;
      throw new Error(`Failed to update splits: ${msg}`);
    }
    return response.json();
  }

  static async deleteSplit(symbol: string, date: string): Promise<{ success: boolean; symbol: string; events: Array<{ date: string; factor: number }> }> {
    const response = await fetchWithCreds(`${API_BASE_URL}/splits/${encodeURIComponent(symbol)}/${encodeURIComponent(date.slice(0,10))}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const e = await response.json().catch(() => null);
      const msg = (e && e.error) || response.statusText;
      throw new Error(`Failed to delete split: ${msg}`);
    }
    return response.json();
  }

  static async deleteAllSplits(symbol: string): Promise<{ success: boolean; symbol: string }> {
    const response = await fetchWithCreds(`${API_BASE_URL}/splits/${encodeURIComponent(symbol)}`, { method: 'DELETE' });
    if (!response.ok) {
      const e = await response.json().catch(() => null);
      const msg = (e && e.error) || response.statusText;
      throw new Error(`Failed to delete splits: ${msg}`);
    }
    return response.json();
  }
  /**
   * Получить список всех датасетов (только метаданные)
   */
  static async getDatasets(): Promise<Omit<SavedDataset, 'data'>[]> {
    try {
      let response = await fetchWithCreds(`${API_BASE_URL}/datasets?ts=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-store, no-cache', Pragma: 'no-cache' },
        timeout: 15000, // 15s timeout for dataset list
        retries: 2
      });
      if (response.status === 304) {
        logWarn('network', 'Received 304 for datasets, retrying with cache reload');
        response = await fetchWithCreds(`${API_BASE_URL}/datasets?ts=${Date.now()}&_=${Math.random()}`, {
          cache: 'reload',
          headers: { 'Cache-Control': 'no-store, no-cache', Pragma: 'no-cache' },
          timeout: 15000,
          retries: 2
        });
      }
      if (!response.ok) {
        const error = new Error(`Failed to fetch datasets: ${response.status} ${response.statusText}`) as NetworkError;
        error.status = response.status;
        throw error;
      }
      return response.json();
    } catch (error) {
      logError('network', 'Failed to fetch datasets', {
        error: (error as Error).message,
        url: `${API_BASE_URL}/datasets`
      });
      throw error;
    }
  }

  /**
   * Актуализировать датасет на сервере (добавить только недостающий хвост)
   */
  static async refreshDataset(id: string, provider?: 'alpha_vantage' | 'finnhub'):
    Promise<{ success: boolean; id: string; added: number; to?: string; message?: string }>
  {
    const qs = provider ? `?provider=${provider}` : '';
    const response = await fetchWithCreds(`${API_BASE_URL}/datasets/${encodeURIComponent(id.toUpperCase())}/refresh${qs}`, {
      method: 'POST',
    });
    if (!response.ok) {
      let msg = `${response.status} ${response.statusText}`;
      const e = await response.json().catch(() => null);
      if (e && typeof e.error === 'string') msg = e.error;
      throw new Error(msg);
    }
    return response.json();
  }

  /**
   * Обновить метаданные датасета
   */
  static async updateDatasetMetadata(id: string, metadata: { tag?: string; companyName?: string }):
    Promise<{ success: boolean; message?: string }>
  {
    const response = await fetchWithCreds(`${API_BASE_URL}/datasets/${encodeURIComponent(id.toUpperCase())}/metadata`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    });
    if (!response.ok) {
      let msg = `${response.status} ${response.statusText}`;
      const e = await response.json().catch(() => null);
      if (e && typeof e.error === 'string') msg = e.error;
      throw new Error(msg);
    }
    return response.json();
  }

  /**
   * Получить котировку в реальном времени (open/high/low/current/prevClose)
   */
  static async getQuote(symbol: string, provider: 'alpha_vantage' | 'finnhub' = 'finnhub'):
    Promise<{ open: number|null; high: number|null; low: number|null; current: number|null; prevClose: number|null }>
  {
    const response = await fetchWithCreds(`${API_BASE_URL}/quote/${encodeURIComponent(symbol)}?provider=${provider}`);
    if (!response.ok) {
      let msg = `${response.status} ${response.statusText}`;
      const e = await response.json().catch(() => null);
      if (e && typeof e.error === 'string') msg = e.error;
      throw new Error(msg);
    }
    return response.json();
  }

  /**
   * Получить конкретный датасет с данными
   */
  static async getDataset(id: string): Promise<SavedDataset> {
    try {
      let response = await fetchWithCreds(`${API_BASE_URL}/datasets/${id}?ts=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-store, no-cache', Pragma: 'no-cache' },
        timeout: 60000, // 60s timeout for large datasets
        retries: 2
      });
      if (response.status === 304) {
        logWarn('network', `Received 304 for dataset ${id}, retrying with cache reload`);
        response = await fetchWithCreds(`${API_BASE_URL}/datasets/${id}?ts=${Date.now()}&_=${Math.random()}`, {
          cache: 'reload',
          headers: { 'Cache-Control': 'no-store, no-cache', Pragma: 'no-cache' },
          timeout: 60000,
          retries: 2
        });
      }
      if (!response.ok) {
        if (response.status === 404) {
          const error = new Error(`Dataset "${id}" not found`) as NetworkError;
          error.status = 404;
          error.retryable = false;
          throw error;
        }
        const error = new Error(`Failed to fetch dataset: ${response.status} ${response.statusText}`) as NetworkError;
        error.status = response.status;
        throw error;
      }
      
      const dataset = await response.json();
      // Конвертируем строки дат обратно в Date объекты стабильно (полдень UTC)
      const { parseOHLCDate } = await import('./utils');
      dataset.data = dataset.data.map((bar: { date: string; open: number; high: number; low: number; close: number; adjClose?: number; volume: number; }) => ({
        ...bar,
        date: parseOHLCDate(bar.date)
      }));
      // splits оставляем как есть (массив {date, factor})
      
      return dataset;
    } catch (error) {
      logError('network', `Failed to fetch dataset ${id}`, {
        id,
        error: (error as Error).message,
        url: `${API_BASE_URL}/datasets/${id}`
      });
      throw error;
    }
  }

  /**
   * Получить предыдущий торговый день в ET (America/New_York) в формате YYYY-MM-DD
   */
  static async getExpectedPrevTradingDayET(): Promise<string> {
    const response = await fetchWithCreds(`${API_BASE_URL}/trading/expected-prev-day`);
    if (!response.ok) throw new Error('Failed to get expected previous trading day');
    const data = await response.json();
    if (!data || typeof data.date !== 'string') throw new Error('Invalid response from server');
    return data.date;
  }

  /**
   * Сохранить датасет на сервере
   */
  static async saveDataset(dataset: SavedDataset): Promise<{ success: boolean; id: string; message: string }> {
    try {
      const response = await fetchWithCreds(`${API_BASE_URL}/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataset),
        timeout: 120000, // 2 minutes for large dataset uploads
        retries: 1 // Only one retry for POST operations
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        const msg = (error && typeof error.error === 'string') ? error.error : `Failed to save dataset: ${response.statusText}`;
        const networkError = new Error(msg) as NetworkError;
        networkError.status = response.status;
        networkError.retryable = response.status >= 500;
        throw networkError;
      }
      
      return response.json();
    } catch (error) {
      logError('network', `Failed to save dataset ${dataset.ticker}`, {
        ticker: dataset.ticker,
        dataPoints: dataset.dataPoints,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Удалить датасет с сервера
   */
  static async deleteDataset(id: string): Promise<{ success: boolean; message: string }> {
    const safeId = encodeURIComponent(id.toUpperCase());
    const response = await fetchWithCreds(`${API_BASE_URL}/datasets/${safeId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Dataset "${id}" not found`);
      }
      const error = await response.json().catch(() => null);
      const msg = (error && typeof error.error === 'string') ? error.error : `Failed to delete dataset: ${response.statusText}`;
      throw new Error(msg);
    }
    
    return response.json();
  }

  /**
   * Обновить датасет на сервере
   */
  static async updateDataset(id: string, dataset: SavedDataset): Promise<{ success: boolean; message: string }> {
    const response = await fetchWithCreds(`${API_BASE_URL}/datasets/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dataset),
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Dataset "${id}" not found`);
      }
      const error = await response.json().catch(() => null);
      const msg = (error && typeof error.error === 'string') ? error.error : `Failed to update dataset: ${response.statusText}`;
      throw new Error(msg);
    }
    
    return response.json();
  }

  /**
   * Проверить статус API
   */
  static async getStatus(): Promise<{ status: string; message: string; timestamp: string }> {
    try {
      const response = await fetchWithCreds(`${API_BASE_URL}/status`, {
        timeout: 10000, // 10s timeout for status check
        retries: 1
      });
      if (!response.ok) {
        const error = new Error(`API is not available: ${response.statusText}`) as NetworkError;
        error.status = response.status;
        throw error;
      }
      return response.json();
    } catch (error) {
      logError('network', 'API status check failed', {
        error: (error as Error).message,
        url: `${API_BASE_URL}/status`
      });
      throw error;
    }
  }

  static async applySplitsToDataset(id: string): Promise<{ success: boolean; id: string; message?: string }> {
    const response = await fetchWithCreds(`${API_BASE_URL}/datasets/${encodeURIComponent(id.toUpperCase())}/apply-splits`, {
      method: 'POST',
    });
    if (!response.ok) {
      const e = await response.json().catch(() => null);
      const msg = (e && e.error) || response.statusText;
      throw new Error(msg);
    }
    return response.json();
  }

  // Telegram integration
  static async registerTelegramWatch(params: {
    symbol: string;
    highIBS: number;
    lowIBS?: number;
    thresholdPct?: number;
    chatId?: string;
    entryPrice?: number | null;
    isOpenPosition?: boolean;
  }): Promise<{ success: boolean }> {
    const response = await fetchWithCreds(`${API_BASE_URL}/telegram/watch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      let msg = `${response.status} ${response.statusText}`;
      const e = await response.json().catch(() => null);
      if (e && typeof e.error === 'string') msg = e.error;
      throw new Error(msg);
    }
    const json = await response.json().catch(() => null);
    return json ?? { success: true };
  }

  static async updateTelegramWatch(symbol: string, params: { isOpenPosition?: boolean; entryPrice?: number | null }): Promise<{ success: boolean }> {
    const response = await fetchWithCreds(`${API_BASE_URL}/telegram/watch/${encodeURIComponent(symbol)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      let msg = `${response.status} ${response.statusText}`;
      const e = await response.json().catch(() => null);
      if (e && typeof e.error === 'string') msg = e.error;
      throw new Error(msg);
    }
    const json = await response.json().catch(() => null);
    return json ?? { success: true };
  }

  static async deleteTelegramWatch(symbol: string): Promise<{ success: boolean }> {
    const response = await fetchWithCreds(`${API_BASE_URL}/telegram/watch/${encodeURIComponent(symbol)}`, { method: 'DELETE' });
    if (!response.ok) {
      let msg = `${response.status} ${response.statusText}`;
      const e = await response.json().catch(() => null);
      if (e && typeof e.error === 'string') msg = e.error;
      throw new Error(msg);
    }
    const json = await response.json().catch(() => null);
    return json ?? { success: true };
  }

  static async listTelegramWatches(): Promise<Array<{ symbol: string; highIBS: number; thresholdPct?: number; entryPrice: number | null; isOpenPosition: boolean }>> {
    const response = await fetchWithCreds(`${API_BASE_URL}/telegram/watches`);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return await response.json();
  }

  static async getMonitorTradeHistory(): Promise<MonitorTradeHistoryResponse> {
    const response = await fetchWithCreds(`${API_BASE_URL}/trades`);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return await response.json();
  }

  static async sendTelegramTest(message?: string): Promise<{ success: boolean }> {
    const response = await fetchWithCreds(`${API_BASE_URL}/telegram/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return await response.json();
  }

  static async testProvider(provider: string): Promise<{ success?: boolean; error?: string; price?: string; symbol?: string }> {
    const response = await fetchWithCreds(`${API_BASE_URL}/test-provider`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `${response.status} ${response.statusText}`);
    }
    return await response.json();
  }

  static async simulateTelegram(stage: 'overview'|'confirmations' = 'overview'): Promise<{ success: boolean; stage: string }>{
    try {
      const response = await fetchWithCreds(`${API_BASE_URL}/telegram/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
        timeout: 15000,
        retries: 1
      });
      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText}`) as NetworkError;
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      logError('network', 'Failed to simulate telegram', {
        stage,
        error: (error as Error).message
      });
      throw error;
    }
  }

  static async actualizePrices(): Promise<{ success: boolean; count: number; tickers: string[] }>{
    const response = await fetchWithCreds(`${API_BASE_URL}/telegram/actualize-prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  }

  // App settings
  static async getAppSettings(): Promise<{ watchThresholdPct: number; resultsQuoteProvider: 'alpha_vantage'|'finnhub'|'twelve_data'; enhancerProvider: 'alpha_vantage'|'finnhub'|'twelve_data'; resultsRefreshProvider?: 'alpha_vantage'|'finnhub'|'twelve_data'; indicatorPanePercent?: number; defaultMultiTickerSymbols?: string; commissionType?: string; commissionFixed?: number; commissionPercentage?: number }>{
    try {
      const response = await fetchWithCreds(`${API_BASE_URL}/settings`, {
        timeout: 10000,
        retries: 2
      });
      if (!response.ok) {
        const error = new Error(`Failed to load settings: ${response.status} ${response.statusText}`) as NetworkError;
        error.status = response.status;
        throw error;
      }
      return response.json();
    } catch (error) {
      logError('network', 'Failed to load app settings', {
        error: (error as Error).message
      });
      throw error;
    }
  }

  static async getTradingCalendar(): Promise<any> {
    const response = await fetchWithCreds(`${API_BASE_URL}/trading-calendar`);
    if (!response.ok) throw new Error(`Failed to load trading calendar: ${response.status} ${response.statusText}`);
    return response.json();
  }

  static async saveAppSettings(settings: { watchThresholdPct: number; resultsQuoteProvider: 'alpha_vantage'|'finnhub'|'twelve_data'; enhancerProvider: 'alpha_vantage'|'finnhub'|'twelve_data'; resultsRefreshProvider?: 'alpha_vantage'|'finnhub'|'twelve_data'; indicatorPanePercent?: number; defaultMultiTickerSymbols?: string; commissionType?: string; commissionFixed?: number; commissionPercentage?: number }): Promise<void> {
    const response = await fetchWithCreds(`${API_BASE_URL}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!response.ok) {
      let msg = `${response.status} ${response.statusText}`;
      const e = await response.json().catch(() => null);
      if (e && typeof e.error === 'string') msg = e.error;
      throw new Error(msg);
    }
  }

  // Settings API methods
  static async getSettings(): Promise<any> {
    const response = await fetchWithCreds(`${API_BASE_URL}/settings`);
    if (!response.ok) {
      throw new Error(`Failed to fetch settings: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  static async updateSettings(updates: any): Promise<{ success: boolean; message: string }> {
    const response = await fetchWithCreds(`${API_BASE_URL}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      let msg = `${response.status} ${response.statusText}`;
      const e = await response.json().catch(() => null);
      if (e && typeof e.error === 'string') msg = e.error;
      throw new Error(msg);
    }
    return response.json();
  }
}

/**
 * Network health monitoring utilities
 */
export class NetworkMonitor {
  private static healthCheckInterval: number | null = null;
  private static isHealthy = true;
  private static callbacks = new Set<(healthy: boolean) => void>();
  
  /**
   * Starts monitoring network health
   */
  static startMonitoring(intervalMs: number = 30000): void {
    if (this.healthCheckInterval !== null) {
      this.stopMonitoring();
    }
    
    this.healthCheckInterval = window.setInterval(async () => {
      try {
        await DatasetAPI.getStatus();
        this.setHealthy(true);
      } catch (error) {
        logWarn('network', 'Network health check failed', {
          error: (error as Error).message
        });
        this.setHealthy(false);
      }
    }, intervalMs);
    
    // Initial health check
    this.checkHealth();
  }
  
  /**
   * Stops network health monitoring
   */
  static stopMonitoring(): void {
    if (this.healthCheckInterval !== null) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
  
  /**
   * Performs an immediate health check
   */
  static async checkHealth(): Promise<boolean> {
    try {
      await DatasetAPI.getStatus();
      this.setHealthy(true);
      return true;
    } catch {
      this.setHealthy(false);
      return false;
    }
  }
  
  /**
   * Returns current network health status
   */
  static getHealthStatus(): boolean {
    return this.isHealthy;
  }
  
  /**
   * Subscribes to network health changes
   */
  static onHealthChange(callback: (healthy: boolean) => void): () => void {
    this.callbacks.add(callback);
    // Immediately call with current status
    callback(this.isHealthy);
    
    return () => {
      this.callbacks.delete(callback);
    };
  }
  
  private static setHealthy(healthy: boolean): void {
    if (this.isHealthy !== healthy) {
      this.isHealthy = healthy;
      logWarn('network', `Network health changed: ${healthy ? 'healthy' : 'unhealthy'}`);
      
      // Notify all callbacks
      this.callbacks.forEach(callback => {
        try {
          callback(healthy);
        } catch (error) {
          logError('network', 'Error in network health callback', {
            error: (error as Error).message
          });
        }
      });
    }
  }
}

/**
 * Browser storage utilities for API caching and offline support
 */
export class APICache {
  private static readonly CACHE_PREFIX = 'trading_api_cache_';
  private static readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  
  /**
   * Stores data in localStorage with expiration
   */
  static set(key: string, data: any, ttlMs: number = this.DEFAULT_TTL): void {
    try {
      const item = {
        data,
        expires: Date.now() + ttlMs
      };
      localStorage.setItem(this.CACHE_PREFIX + key, JSON.stringify(item));
    } catch (error) {
      logWarn('network', 'Failed to cache API data', {
        key,
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Retrieves data from localStorage if not expired
   */
  static get<T>(key: string): T | null {
    try {
      const stored = localStorage.getItem(this.CACHE_PREFIX + key);
      if (!stored) return null;
      
      const item = JSON.parse(stored);
      if (Date.now() > item.expires) {
        this.delete(key);
        return null;
      }
      
      return item.data as T;
    } catch (error) {
      logWarn('network', 'Failed to retrieve cached API data', {
        key,
        error: (error as Error).message
      });
      return null;
    }
  }
  
  /**
   * Deletes cached data
   */
  static delete(key: string): void {
    try {
      localStorage.removeItem(this.CACHE_PREFIX + key);
    } catch (error) {
      logWarn('network', 'Failed to delete cached data', {
        key,
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Clears all cached API data
   */
  static clear(): void {
    try {
      const keys = Object.keys(localStorage).filter(key => 
        key.startsWith(this.CACHE_PREFIX)
      );
      keys.forEach(key => localStorage.removeItem(key));
      logWarn('network', `Cleared ${keys.length} cached API entries`);
    } catch (error) {
      logWarn('network', 'Failed to clear API cache', {
        error: (error as Error).message
      });
    }
  }
}