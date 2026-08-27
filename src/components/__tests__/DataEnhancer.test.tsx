import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DataEnhancer } from '../DataEnhancer';
import { ToastProvider } from '../ui/Toast';

const mocks = vi.hoisted(() => ({
  fetchWithCreds: vi.fn(),
  useAppStore: vi.fn(),
  updateMarketData: vi.fn(),
  saveDatasetToServer: vi.fn(),
  loadDatasetsFromServer: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  API_BASE_URL: '/api',
  fetchWithCreds: mocks.fetchWithCreds,
  DatasetAPI: {},
}));

vi.mock('../../stores', () => ({
  useAppStore: mocks.useAppStore,
}));

const FIXED_NOW = new Date('2024-06-15T20:00:00.000Z');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const state = {
    enhancerProvider: 'alpha_vantage',
    updateMarketData: mocks.updateMarketData,
    saveDatasetToServer: mocks.saveDatasetToServer,
    isLoading: false,
    loadDatasetsFromServer: mocks.loadDatasetsFromServer,
    savedDatasets: [] as Array<{ ticker?: string }>,
    currentDataset: null,
    ...overrides,
  };
  mocks.useAppStore.mockImplementation((selector?: (s: typeof state) => unknown) => (
    typeof selector === 'function' ? selector(state) : state
  ));
  return state;
}

function renderEnhancer(onNext?: () => void) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <DataEnhancer onNext={onNext} />
      </ToastProvider>
    </MemoryRouter>
  );
}

function tickerSearchInput() {
  return screen.getByRole('combobox');
}

describe('DataEnhancer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(FIXED_NOW);
    mocks.loadDatasetsFromServer.mockResolvedValue(undefined);
    mocks.saveDatasetToServer.mockResolvedValue(undefined);
    mocks.updateMarketData.mockReturnValue(undefined);
    mockStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads saved datasets on mount when the library is empty', async () => {
    renderEnhancer();

    await waitFor(() => {
      expect(mocks.loadDatasetsFromServer).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('Начните с загрузки данных')).toBeInTheDocument();
  });

  it('shows ticker suggestions while typing and closes them on outside click', async () => {
    renderEnhancer();

    fireEvent.change(tickerSearchInput(), { target: { value: 'AAPL' } });

    const suggestion = await screen.findByRole('option', { name: /AAPL/ });
    expect(suggestion).toHaveTextContent('Apple Inc.');
    expect(tickerSearchInput()).toHaveAttribute('aria-expanded', 'true');

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
    expect(tickerSearchInput()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the suggestion list on Escape', async () => {
    renderEnhancer();

    fireEvent.change(tickerSearchInput(), { target: { value: 'MSFT' } });
    expect(await screen.findByRole('option', { name: /MSFT/ })).toBeInTheDocument();

    fireEvent.keyDown(tickerSearchInput(), { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  it('uses the store provider in the request URL and shows it in the header', async () => {
    mockStore({ enhancerProvider: 'finnhub' });
    mocks.fetchWithCreds.mockResolvedValue(jsonResponse({
      data: [{ date: '2024-06-14', open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }],
      splits: [],
    }));

    renderEnhancer();

    expect(screen.getByText('Finnhub')).toBeInTheDocument();
    expect(screen.getByText(/Источник данных: finnhub/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Настройки провайдера' })).toHaveAttribute('href', '/settings');

    fireEvent.change(tickerSearchInput(), { target: { value: 'AAPL' } });
    fireEvent.click(screen.getByTitle('Загрузить данные'));

    await waitFor(() => {
      expect(mocks.fetchWithCreds).toHaveBeenCalledTimes(1);
    });

    const requestUrl = String(mocks.fetchWithCreds.mock.calls[0][0]);
    expect(requestUrl).toContain('/api/yahoo-finance/AAPL?');
    expect(requestUrl).toContain('provider=finnhub');
    expect(requestUrl).toContain('adjustment=none');
  });

  it('shows a fetching state while the provider request is in flight', async () => {
    let resolveFetch: (value: Response) => void = () => undefined;
    mocks.fetchWithCreds.mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));

    renderEnhancer();

    fireEvent.click(screen.getByRole('button', { name: /Apple Inc\./ }));

    expect(await screen.findByText('AAPL: Загрузка данных с сервера...')).toBeInTheDocument();
    expect(screen.getByTitle('Загрузить данные')).toBeDisabled();

    resolveFetch(jsonResponse({
      data: [{ date: '2024-06-14', open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }],
      splits: [],
    }));

    await waitFor(() => {
      expect(screen.queryByText('AAPL: Загрузка данных с сервера...')).not.toBeInTheDocument();
    });
  });

  it('shows the provider error payload when the download fails', async () => {
    mocks.fetchWithCreds.mockResolvedValue(jsonResponse({ error: 'Превышен лимит Alpha Vantage' }, 429));

    renderEnhancer();

    fireEvent.change(tickerSearchInput(), { target: { value: 'TSLA' } });
    fireEvent.click(screen.getByTitle('Загрузить данные'));

    expect(await screen.findByText('Превышен лимит Alpha Vantage')).toBeInTheDocument();
    expect(screen.getByText('Ошибка')).toBeInTheDocument();
    expect(mocks.updateMarketData).not.toHaveBeenCalled();
    expect(mocks.saveDatasetToServer).not.toHaveBeenCalled();
  });

  it('saves OHLC rows and ticker metadata after a successful download', async () => {
    mocks.fetchWithCreds.mockResolvedValue(jsonResponse({
      data: [
        { date: '2024-06-13', open: 10, high: 12, low: 9, close: 11, volume: 100 },
        { date: '2024-06-14', open: 11, high: 13, low: 10, close: 12, adjClose: 12, volume: 110 },
      ],
      splits: [{ date: '2020-08-31', factor: 4 }],
    }));

    renderEnhancer();

    fireEvent.change(tickerSearchInput(), { target: { value: 'aapl' } });
    const suggestion = await screen.findByRole('option', { name: /AAPL/ });
    fireEvent.click(suggestion);

    await waitFor(() => {
      expect(mocks.saveDatasetToServer).toHaveBeenCalledTimes(1);
    });

    expect(mocks.updateMarketData).toHaveBeenCalledWith([
      { date: '2024-06-13', open: 10, high: 12, low: 9, close: 11, adjClose: undefined, volume: 100 },
      { date: '2024-06-14', open: 11, high: 13, low: 10, close: 12, adjClose: 12, volume: 110 },
    ]);
    expect(mocks.saveDatasetToServer).toHaveBeenCalledWith(
      'AAPL',
      undefined,
      { companyName: 'Apple Inc.' },
      [{ date: '2020-08-31', factor: 4 }]
    );
    expect(await screen.findByText('Готово')).toBeInTheDocument();
    expect(screen.getByText(/Загружено 2 точек для AAPL, сплитов: 1/)).toBeInTheDocument();
  });

  it('marks already saved tickers in the catalog and still allows a refresh download', async () => {
    mockStore({
      savedDatasets: [{ ticker: 'AAPL' }],
    });
    mocks.fetchWithCreds.mockResolvedValue(jsonResponse({
      data: [{ date: '2024-06-14', open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }],
      splits: [],
    }));

    renderEnhancer();

    expect(screen.queryByText('Начните с загрузки данных')).not.toBeInTheDocument();
    const catalogCard = screen.getByRole('button', { name: /Apple Inc\./ });
    expect(catalogCard).toHaveAttribute('title', 'AAPL уже загружен. Нажмите для обновления');

    fireEvent.click(catalogCard);

    await waitFor(() => {
      expect(mocks.saveDatasetToServer).toHaveBeenCalledWith('AAPL', undefined, { companyName: 'Apple Inc.' }, []);
    });
  });
});
