import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DatasetLibrary } from '../DatasetLibrary';
import type { SavedDataset } from '../../types';

const mocks = vi.hoisted(() => ({
  useAppStore: vi.fn(),
  getStatus: vi.fn(),
  refreshDataset: vi.fn(),
  updateDatasetMetadata: vi.fn(),
  deleteDatasetFromServer: vi.fn(),
  exportDatasetAsJSON: vi.fn(),
  loadDatasetsFromServer: vi.fn(),
  loadDatasetFromServer: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  DatasetAPI: {
    getStatus: mocks.getStatus,
    refreshDataset: mocks.refreshDataset,
    updateDatasetMetadata: mocks.updateDatasetMetadata,
  },
}));

vi.mock('../../stores', () => ({
  useAppStore: mocks.useAppStore,
}));

function dataset(overrides: Partial<Omit<SavedDataset, 'data'>> = {}): Omit<SavedDataset, 'data'> {
  return {
    id: 'AAPL',
    name: 'AAPL',
    ticker: 'AAPL',
    uploadDate: '2024-11-17',
    dataPoints: 1200,
    dateRange: {
      from: '2020-01-15',
      to: '2024-11-17',
    },
    tag: 'tech',
    companyName: 'Apple Inc.',
    ...overrides,
  };
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const state = {
    savedDatasets: [dataset()],
    currentDataset: null,
    deleteDatasetFromServer: mocks.deleteDatasetFromServer,
    exportDatasetAsJSON: mocks.exportDatasetAsJSON,
    loadDatasetsFromServer: mocks.loadDatasetsFromServer,
    loadDatasetFromServer: mocks.loadDatasetFromServer,
    resultsRefreshProvider: 'finnhub',
    ...overrides,
  };
  mocks.useAppStore.mockImplementation((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return state;
}

async function renderLibrary(onAfterLoad?: () => void) {
  const view = render(
    <MemoryRouter>
      <DatasetLibrary onAfterLoad={onAfterLoad} />
    </MemoryRouter>
  );
  await waitFor(() => expect(mocks.getStatus).toHaveBeenCalled());
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

async function switchToListView() {
  fireEvent.click(screen.getByRole('button', { name: 'Переключить на режим списка' }));
  expect(screen.getByRole('button', { name: 'Переключить на режим списка' })).toHaveAttribute('aria-pressed', 'true');
}

describe('DatasetLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStatus.mockResolvedValue({ status: 'ok', message: 'ok', timestamp: '2024-11-17T20:00:00.000Z' });
    mocks.refreshDataset.mockResolvedValue({ added: 1 });
    mocks.deleteDatasetFromServer.mockResolvedValue(undefined);
    mocks.loadDatasetsFromServer.mockResolvedValue(undefined);
    mocks.loadDatasetFromServer.mockResolvedValue(undefined);
    mockStore();
  });

  it('renders saved datasets in the default compact grid', async () => {
    mockStore({
      savedDatasets: [
        dataset(),
        dataset({
          id: 'MSFT',
          name: 'MSFT',
          ticker: 'MSFT',
          companyName: 'Microsoft Corporation',
          tag: 'tech, dividend',
        }),
      ],
    });

    await renderLibrary();

    expect(screen.getByText('Библиотека датасетов')).toBeInTheDocument();
    expect(screen.getByText('2 датасетов')).toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Все (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tech (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'dividend (1)' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Online')).toBeInTheDocument();
    });
  });

  it('shows an empty-state link to /enhance when there are no datasets', async () => {
    mockStore({ savedDatasets: [] });

    await renderLibrary();

    expect(screen.getByText('Датасетов пока нет')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Загрузить тикеры/ })).toHaveAttribute('href', '/enhance');
  });

  it('selects a dataset by navigating to /stocks and calling onAfterLoad', async () => {
    const onAfterLoad = vi.fn();
    await renderLibrary(onAfterLoad);

    const card = screen.getByRole('link', { name: /AAPL/ });
    expect(card).toHaveAttribute('href', '/stocks?tickers=AAPL');

    fireEvent.click(card);

    expect(onAfterLoad).toHaveBeenCalledTimes(1);
  });

  it('marks the current dataset as active', async () => {
    mockStore({
      currentDataset: dataset({ name: 'AAPL daily' }),
    });

    await renderLibrary();

    expect(screen.getByText(/Активный:/)).toHaveTextContent('AAPL daily');

    await switchToListView();

    expect(screen.getByText('Выбран')).toBeInTheDocument();
  });

  it('asks for confirmation before deleting a dataset', async () => {
    await renderLibrary();
    await switchToListView();

    fireEvent.click(screen.getByTitle('Удалить датасет'));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Удалить датасет?')).toBeInTheDocument();
    expect(within(dialog).getByText(/Будет удалён файл датасета "AAPL"/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(mocks.deleteDatasetFromServer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Удалить датасет'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(mocks.deleteDatasetFromServer).toHaveBeenCalledWith('AAPL');
    });
  });

  it('refreshes a dataset through DatasetAPI and reloads the library', async () => {
    mockStore({
      currentDataset: dataset(),
    });
    await renderLibrary();
    await switchToListView();

    fireEvent.click(screen.getByRole('button', { name: 'Обновить датасет' }));

    await waitFor(() => {
      expect(mocks.refreshDataset).toHaveBeenCalledWith('AAPL', 'finnhub');
    });
    expect(mocks.loadDatasetsFromServer).toHaveBeenCalled();
    expect(mocks.loadDatasetFromServer).toHaveBeenCalledWith('AAPL');
  });

  it('shows a refresh error from DatasetAPI in list view', async () => {
    mocks.refreshDataset.mockRejectedValue(new Error('Провайдер недоступен'));
    await renderLibrary();
    await switchToListView();

    fireEvent.click(screen.getByRole('button', { name: 'Обновить датасет' }));

    expect(await screen.findByText('Провайдер недоступен')).toBeInTheDocument();
    expect(mocks.loadDatasetsFromServer).not.toHaveBeenCalled();
  });

  it('formats the last bar date from a YYYY-MM-DD trading date without using the machine timezone', async () => {
    // 2024-11-17 is the date that shifts to 16 Nov when parsed as
    // `new Date('YYYY-MM-DD')` and formatted in America/Los_Angeles.
    // DatasetCard.formatDate must keep the calendar day 17.
    mockStore({
      savedDatasets: [
        dataset({
          dateRange: { from: '2024-11-17', to: '2024-11-17' },
          uploadDate: '2024-11-17',
        }),
      ],
    });

    const localeShifted = new Date('2024-11-17').toLocaleDateString('en-CA');
    await renderLibrary();
    await switchToListView();

    expect(screen.getByText('17.11.2024 - 17.11.2024')).toBeInTheDocument();
    expect(screen.getByText('Сохранён: 17.11.2024')).toBeInTheDocument();
    expect(screen.queryByText(/16\.11\.2024/)).not.toBeInTheDocument();

    // Documents the timezone trap this formatter must not follow.
    if (localeShifted === '2024-11-16') {
      expect(screen.getByText('17.11.2024 - 17.11.2024')).toBeInTheDocument();
    }
  });

  it('filters the list by tag', async () => {
    mockStore({
      savedDatasets: [
        dataset(),
        dataset({
          id: 'XOM',
          name: 'XOM',
          ticker: 'XOM',
          companyName: 'Exxon Mobil',
          tag: 'energy',
          dateRange: { from: '2021-03-01', to: '2024-10-31' },
        }),
      ],
    });

    await renderLibrary();

    fireEvent.click(screen.getByRole('button', { name: 'energy (1)' }));

    expect(screen.getByText('1 из 2 датасетов')).toBeInTheDocument();
    expect(screen.getByText('XOM')).toBeInTheDocument();
    expect(screen.queryByText('AAPL')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Все (2)' }));
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('XOM')).toBeInTheDocument();
  });
});
