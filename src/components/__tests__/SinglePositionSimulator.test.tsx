import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SinglePositionSimulator } from '../SinglePositionSimulator';
import type { Strategy, SavedDataset } from '../../types';

// Mock the API
vi.mock('../../lib/api', () => ({
  DatasetAPI: {
    getDatasets: vi.fn(() => Promise.resolve([
      { ticker: 'AAPL', name: 'Apple Inc.' },
      { ticker: 'GOOGL', name: 'Alphabet Inc.' },
      { ticker: 'MSFT', name: 'Microsoft Corp.' },
      { ticker: 'TSLA', name: 'Tesla Inc.' }
    ] as SavedDataset[]))
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

  it('should render ticker dropdown with default selection', async () => {
    await act(async () => {
      render(<SinglePositionSimulator strategy={mockStrategy} />);
    });
    
    // Should show dropdown button
    expect(screen.getByText('Выберите тикер')).toBeInTheDocument();
    
    // Should show dropdown arrow
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('should open dropdown when clicked', async () => {
    await act(async () => {
      render(<SinglePositionSimulator strategy={mockStrategy} />);
    });
    
    const dropdownButton = screen.getByText('Выберите тикер').closest('button')!;
    
    await act(async () => {
      fireEvent.click(dropdownButton);
    });

    // Wait for dropdown to load options
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('GOOGL')).toBeInTheDocument();
      expect(screen.getByText('MSFT')).toBeInTheDocument();
      expect(screen.getByText('TSLA')).toBeInTheDocument();
    });
  });

  it('should filter options when searching', async () => {
    await act(async () => {
      render(<SinglePositionSimulator strategy={mockStrategy} />);
    });
    
    const dropdownButton = screen.getByText('Выберите тикер').closest('button')!;
    
    await act(async () => {
      fireEvent.click(dropdownButton);
    });

    // Wait for options to load
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Поиск тикеров...');
    
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'AAP' } });
    });

    // Should show filtered results
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.queryByText('GOOGL')).not.toBeInTheDocument();
    expect(screen.queryByText('MSFT')).not.toBeInTheDocument();
    expect(screen.queryByText('TSLA')).not.toBeInTheDocument();
  });

  it('should select a ticker when clicked', async () => {
    await act(async () => {
      render(<SinglePositionSimulator strategy={mockStrategy} />);
    });
    
    const dropdownButton = screen.getByText('Выберите тикер').closest('button')!;
    
    await act(async () => {
      fireEvent.click(dropdownButton);
    });

    // Wait for options to load
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    const aaplOption = screen.getByText('AAPL');
    
    await act(async () => {
      fireEvent.click(aaplOption);
    });

    // Should show selected ticker
    expect(screen.queryByText('Выберите тикер')).not.toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();
  });

  it('should allow multi-select of tickers', async () => {
    await act(async () => {
      render(<SinglePositionSimulator strategy={mockStrategy} />);
    });
    
    const dropdownButton = screen.getByText('Выберите тикер').closest('button')!;
    
    await act(async () => {
      fireEvent.click(dropdownButton);
    });

    // Wait for options to load
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    // Select AAPL
    await act(async () => {
      fireEvent.click(screen.getByText('AAPL'));
    });

    // Reopen dropdown
    await act(async () => {
      fireEvent.click(dropdownButton);
    });

    // Wait for options to reload
    await waitFor(() => {
      expect(screen.getByText('GOOGL')).toBeInTheDocument();
    });

    // Select GOOGL
    await act(async () => {
      fireEvent.click(screen.getByText('GOOGL'));
    });

    // Should show both selected tickers as chips
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('GOOGL')).toBeInTheDocument();
  });

  it('should remove ticker when chip X is clicked', async () => {
    await act(async () => {
      render(<SinglePositionSimulator strategy={mockStrategy} />);
    });
    
    const dropdownButton = screen.getByText('Выберите тикер').closest('button')!;
    
    await act(async () => {
      fireEvent.click(dropdownButton);
    });

    // Wait for options to load and select AAPL
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('AAPL'));
    });

    // Find and click the X button on the AAPL chip
    const removeButtons = screen.getAllByText('×');
    
    await act(async () => {
      fireEvent.click(removeButtons[0]);
    });

    // Should remove AAPL and show placeholder again
    expect(screen.getByText('Выберите тикер')).toBeInTheDocument();
    expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
  });

  it('should show "no results" message when search yields no results', async () => {
    await act(async () => {
      render(<SinglePositionSimulator strategy={mockStrategy} />);
    });
    
    const dropdownButton = screen.getByText('Выберите тикер').closest('button')!;
    
    await act(async () => {
      fireEvent.click(dropdownButton);
    });

    // Wait for options to load
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Поиск тикеров...');
    
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'NONEXISTENT' } });
    });

    // Should show no results message
    expect(screen.getByText('Тикеры не найдены')).toBeInTheDocument();
  });

  it('should handle loading state', async () => {
    // Mock API to return a pending promise
    const mockGetDatasets = vi.fn(() => new Promise(resolve => setTimeout(() => resolve([]), 100)));
    vi.mocked(require('../../lib/api').DatasetAPI.getDatasets).mockImplementation(mockGetDatasets);

    await act(async () => {
      render(<SinglePositionSimulator strategy={mockStrategy} />);
    });
    
    const dropdownButton = screen.getByText('Выберите тикер').closest('button')!;
    
    await act(async () => {
      fireEvent.click(dropdownButton);
    });

    // Should show loading message
    expect(screen.getByText('Загрузка...')).toBeInTheDocument();
  });

  it('should handle API error gracefully', async () => {
    // Mock API to throw error
    const mockGetDatasets = vi.fn(() => Promise.reject(new Error('API Error')));
    vi.mocked(require('../../lib/api').DatasetAPI.getDatasets).mockImplementation(mockGetDatasets);

    await act(async () => {
      render(<SinglePositionSimulator strategy={mockStrategy} />);
    });
    
    const dropdownButton = screen.getByText('Выберите тикер').closest('button')!;
    
    await act(async () => {
      fireEvent.click(dropdownButton);
    });

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText('Ошибка загрузки тикеров')).toBeInTheDocument();
    });
  });

  it('should close dropdown when clicking outside', async () => {
    await act(async () => {
      render(<SinglePositionSimulator strategy={mockStrategy} />);
    });
    
    const dropdownButton = screen.getByText('Выберите тикер').closest('button')!;
    
    await act(async () => {
      fireEvent.click(dropdownButton);
    });

    // Wait for options to load
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    // Simulate clicking outside
    await act(async () => {
      fireEvent.mouseDown(document.body);
    });

    // Dropdown should close
    expect(screen.queryByText('Поиск тикеров...')).not.toBeInTheDocument();
  });

  it('should clear search when dropdown closes', async () => {
    await act(async () => {
      render(<SinglePositionSimulator strategy={mockStrategy} />);
    });
    
    const dropdownButton = screen.getByText('Выберите тикер').closest('button')!;
    
    await act(async () => {
      fireEvent.click(dropdownButton);
    });

    // Wait for options to load
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Поиск тикеров...');
    
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'TEST' } });
    });

    // Close dropdown
    await act(async () => {
      fireEvent.click(dropdownButton);
    });

    // Reopen and check search is cleared
    await act(async () => {
      fireEvent.click(dropdownButton);
    });

    await waitFor(() => {
      const newSearchInput = screen.getByPlaceholderText('Поиск тикеров...');
      expect(newSearchInput).toHaveValue('');
    });
  });

  it('should render other form inputs correctly', async () => {
    await act(async () => {
      render(<SinglePositionSimulator strategy={mockStrategy} />);
    });
    
    // Should render IBS threshold inputs
    expect(screen.getByDisplayValue('0.10')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0.75')).toBeInTheDocument();
    
    // Should render max hold days input  
    expect(screen.getByDisplayValue('30')).toBeInTheDocument();
  });
});