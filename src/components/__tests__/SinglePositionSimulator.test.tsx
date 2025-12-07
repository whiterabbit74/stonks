import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SinglePositionSimulator } from '../SinglePositionSimulator';
import { DatasetAPI } from '../../lib/api';
import type { Strategy, SavedDataset } from '../../types';

// Mock the API
vi.mock('../../lib/api', () => ({
  DatasetAPI: {
    getDatasets: vi.fn(() => Promise.resolve([
      { ticker: 'AAPL', name: 'Apple Inc.' },
      { ticker: 'GOOGL', name: 'Alphabet Inc.' },
      { ticker: 'MSFT', name: 'Microsoft Corp.' },
      { ticker: 'TSLA', name: 'Tesla Inc.' }
    ] as SavedDataset[])),
    getDataset: vi.fn((ticker) => Promise.resolve({
      ticker,
      data: Array(100).fill(0).map((_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        open: 100 + i,
        high: 105 + i,
        low: 95 + i,
        close: 102 + i,
        volume: 1000000
      })),
      adjustedForSplits: true
    })),
    getSplits: vi.fn(() => Promise.resolve([]))
  }
}));

describe('SinglePositionSimulator', () => {
  const mockStrategy: Strategy = {
    id: 'test-strategy',
    name: 'Test Strategy',
    description: 'Test strategy for IBS Mean Reversion',
    type: 'ibs-mean-reversion',
    parameters: {
      lowIBS: 0.1,
      highIBS: 0.75,
      maxHoldDays: 30
    },
    entryConditions: [{ type: 'indicator', indicator: 'IBS', operator: '<', value: 0.1 }],
    exitConditions: [{ type: 'indicator', indicator: 'IBS', operator: '>', value: 0.75 }],
    riskManagement: {
      initialCapital: 10000,
      capitalUsage: 100,
      maxPositionSize: 1,
      stopLoss: 2,
      takeProfit: 4,
      useStopLoss: false,
      useTakeProfit: false,
      maxPositions: 1,
      maxHoldDays: 30,
      commission: { type: 'percentage', percentage: 0 },
      slippage: 0
    },
    positionSizing: { type: 'percentage', value: 10 }
  };

  beforeEach(() => {
    // Mock document.addEventListener for click outside detection
    global.document.addEventListener = vi.fn();
    global.document.removeEventListener = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render ticker input with default values', async () => {
    await act(async () => {
      render(<SinglePositionSimulator strategy={mockStrategy} />);
    });

    const input = screen.getByPlaceholderText('AAPL, MSFT, AMZN, MAGS');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('AAPL, MSFT, AMZN, MAGS');
  });

  it('should update tickers when input changes', async () => {
    await act(async () => {
      render(<SinglePositionSimulator strategy={mockStrategy} />);
    });

    const input = screen.getByPlaceholderText('AAPL, MSFT, AMZN, MAGS');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'TSLA, NVDA' } });
    });

    await waitFor(() => {
      expect(input).toHaveValue('TSLA, NVDA');
    });
  });

  it('should handle backtest execution', async () => {
    await act(async () => {
      render(<SinglePositionSimulator strategy={mockStrategy} />);
    });

    const runButton = screen.getByText('Запустить бэктест');
    expect(runButton).toBeInTheDocument();
    expect(runButton).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(runButton);
    });

    // Wait for results
    await waitFor(() => {
      expect(screen.getByText(/Single Position Strategy/)).toBeInTheDocument();
      expect(screen.getByText('Итоговый баланс')).toBeInTheDocument();
    });
  });

  it('should handle loading state', async () => {
    // Mock API to return a pending promise that doesn't resolve immediately
    let resolvePromise: (value: any) => void;
    const promise = new Promise(resolve => {
      resolvePromise = resolve;
    });

    vi.mocked(DatasetAPI.getDataset).mockReturnValue(promise as any);

    await act(async () => {
      render(<SinglePositionSimulator strategy={mockStrategy} />);
    });

    const runButton = screen.getByText('Запустить бэктест');

    fireEvent.click(runButton);

    // Should show loading message immediately after click
    expect(screen.getByText('Расчёт...')).toBeInTheDocument();

    // Resolve promise to clean up
    await act(async () => {
      if (resolvePromise) resolvePromise({
        ticker: 'AAPL',
        data: [],
        ibsValues: []
      });
    });
  });

  it('should handle API error gracefully', async () => {
    // Mock API to throw error
    vi.mocked(DatasetAPI.getDataset).mockRejectedValue(new Error('API Error'));

    await act(async () => {
      render(<SinglePositionSimulator strategy={mockStrategy} />);
    });

    const runButton = screen.getByText('Запустить бэктест');

    await act(async () => {
      fireEvent.click(runButton);
    });

    await waitFor(() => {
      expect(screen.getByText('❌ API Error')).toBeInTheDocument();
    });
  });


});