import type { SavedDataset } from '../types';

// Runtime-safe API base to avoid hardcoded dev hosts in production bundles
export const API_BASE_URL: string = (() => {
  try {
    if (typeof window !== 'undefined') {
      const href = window.location.href || '';
      // If app is served under /stonks, use that prefix for API proxy
      if (href.includes('/stonks')) return '/stonks/api';
    }
  } catch {
    // ignore, default to '/api'
  }
  return '/api';
})();
const fetchWithCreds = (input: RequestInfo | URL, init?: RequestInit) => {
  const merged: RequestInit = {
    credentials: 'include',
    cache: 'no-store',
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      ...(init?.headers || {}),
    },
  };
  return fetch(input, merged);
};

export class DatasetAPI {
  /**
   * Получить список всех датасетов (только метаданные)
   */
  static async getDatasets(): Promise<Omit<SavedDataset, 'data'>[]> {
    let response = await fetchWithCreds(`${API_BASE_URL}/datasets?ts=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-store, no-cache', Pragma: 'no-cache' },
    });
    if (response.status === 304) {
      response = await fetchWithCreds(`${API_BASE_URL}/datasets?ts=${Date.now()}&_=${Math.random()}`, {
        cache: 'reload',
        headers: { 'Cache-Control': 'no-store, no-cache', Pragma: 'no-cache' },
      });
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch datasets: ${response.status} ${response.statusText}`);
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
    let response = await fetchWithCreds(`${API_BASE_URL}/datasets/${id}?ts=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-store, no-cache', Pragma: 'no-cache' },
    });
    if (response.status === 304) {
      response = await fetchWithCreds(`${API_BASE_URL}/datasets/${id}?ts=${Date.now()}&_=${Math.random()}`, {
        cache: 'reload',
        headers: { 'Cache-Control': 'no-store, no-cache', Pragma: 'no-cache' },
      });
    }
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Dataset "${id}" not found`);
      }
      throw new Error(`Failed to fetch dataset: ${response.status} ${response.statusText}`);
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
  }

  /**
   * Сохранить датасет на сервере
   */
  static async saveDataset(dataset: SavedDataset): Promise<{ success: boolean; id: string; message: string }> {
    const response = await fetchWithCreds(`${API_BASE_URL}/datasets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dataset),
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      const msg = (error && typeof error.error === 'string') ? error.error : `Failed to save dataset: ${response.statusText}`;
      throw new Error(msg);
    }
    
    return response.json();
  }

  /**
   * Удалить датасет с сервера
   */
  static async deleteDataset(id: string): Promise<{ success: boolean; message: string }> {
    const response = await fetchWithCreds(`${API_BASE_URL}/datasets/${id}`, {
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
    const response = await fetchWithCreds(`${API_BASE_URL}/status`);
    if (!response.ok) {
      throw new Error(`API is not available: ${response.statusText}`);
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

  static async listTelegramWatches(): Promise<Array<{ symbol: string; highIBS: number; thresholdPct: number; entryPrice: number | null; isOpenPosition: boolean }>> {
    const response = await fetchWithCreds(`${API_BASE_URL}/telegram/watches`);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  static async sendTelegramTest(message?: string): Promise<{ success: boolean }> {
    const response = await fetchWithCreds(`${API_BASE_URL}/telegram/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
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

  // App settings
  static async getAppSettings(): Promise<{ watchThresholdPct: number; resultsQuoteProvider: 'alpha_vantage'|'finnhub'; enhancerProvider: 'alpha_vantage'|'finnhub'; resultsRefreshProvider?: 'alpha_vantage'|'finnhub' }> {
    const response = await fetchWithCreds(`${API_BASE_URL}/settings`);
    if (!response.ok) throw new Error(`Failed to load settings: ${response.status} ${response.statusText}`);
    return response.json();
  }

  static async saveAppSettings(settings: { watchThresholdPct: number; resultsQuoteProvider: 'alpha_vantage'|'finnhub'; enhancerProvider: 'alpha_vantage'|'finnhub'; resultsRefreshProvider?: 'alpha_vantage'|'finnhub' }): Promise<void> {
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
}