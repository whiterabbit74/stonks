import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatasetAPI, fetchWithCreds, API_BASE_URL } from '../api';

// Mock fetch globally
global.fetch = vi.fn();

describe('API Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchWithCreds', () => {
    it('should make successful request with credentials', async () => {
      const mockResponse = { ok: true, json: vi.fn().mockResolvedValue({ data: 'test' }) };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await fetchWithCreds('/test');

      expect(global.fetch).toHaveBeenCalledWith('/test', expect.objectContaining({
        credentials: 'include',
        cache: 'no-store',
        headers: expect.objectContaining({
          'Cache-Control': 'no-store'
        }),
        signal: expect.any(AbortSignal)
      }));
      expect(result).toBe(mockResponse);
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timeout after 1000ms');
      (timeoutError as any).code = 'TIMEOUT';
      (global.fetch as any).mockRejectedValue(timeoutError);

      await expect(fetchWithCreds('/test', { timeout: 1000, retries: 0 }))
        .rejects.toThrow('Request timeout after 1000ms');
    });

    it('should retry on network errors', async () => {
      const networkError = new Error('Failed to fetch');
      const successResponse = { ok: true, json: vi.fn().mockResolvedValue({ success: true }) };

      (global.fetch as any)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue(successResponse);

      const result = await fetchWithCreds('/test', { retries: 2, retryDelay: 10 });

      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(result).toBe(successResponse);
    });

    it('should handle HTTP error responses', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: vi.fn().mockResolvedValue('Not found')
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      // fetchWithCreds returns the response, it doesn't throw on HTTP errors
      const result = await fetchWithCreds('/test');
      expect(result).toBe(mockResponse);
    });
  });

  describe('DatasetAPI', () => {
    it('should get datasets list', async () => {
      const mockDatasets = [
        { id: '1', name: 'AAPL', ticker: 'AAPL' },
        { id: '2', name: 'MSFT', ticker: 'MSFT' }
      ];
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockDatasets)
      });

      const result = await DatasetAPI.getDatasets();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`${API_BASE_URL}/datasets`),
        expect.objectContaining({
          credentials: 'include',
          cache: 'no-store',
          headers: expect.objectContaining({
            'Cache-Control': 'no-store, no-cache',
            'Pragma': 'no-cache'
          })
        })
      );
      expect(result).toEqual(mockDatasets);
    });

    it('should get single dataset', async () => {
      const mockDataset = {
        id: 'AAPL',
        ticker: 'AAPL',
        data: [
          { date: '2024-01-01', open: 100, high: 110, low: 90, close: 105, volume: 1000 }
        ]
      };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockDataset)
      });

      const result = await DatasetAPI.getDataset('AAPL');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`${API_BASE_URL}/datasets/AAPL`),
        expect.objectContaining({
          credentials: 'include',
          cache: 'no-store'
        })
      );
      expect(result).toEqual(mockDataset);
    });

    it('should get splits for ticker', async () => {
      const mockSplits = [
        { date: '2024-01-01', factor: 2 }
      ];
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockSplits)
      });

      const result = await DatasetAPI.getSplits('AAPL');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\s*\/splits\/AAPL\s*/),
        expect.anything()
      );
      expect(result).toEqual(mockSplits);
    });

    it('should handle API errors gracefully', async () => {
      const errorResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: vi.fn().mockResolvedValue('Server error')
      };
      (global.fetch as any).mockResolvedValue(errorResponse);

      await expect(DatasetAPI.getDatasets())
        .rejects.toThrow('Failed to fetch datasets: 500 Internal Server Error');
    });
  });

  describe('API_BASE_URL', () => {
    it('should use relative API path', () => {
      expect(API_BASE_URL).toBe('/api');
    });
  });
});