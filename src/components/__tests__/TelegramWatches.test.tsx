import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TelegramWatches } from '../TelegramWatches';
import { DatasetAPI } from '../../lib/api';
import * as stores from '../../stores';

vi.mock('../../lib/api', () => ({
  DatasetAPI: {
    listTelegramWatches: vi.fn(),
    getMonitorConsistency: vi.fn(),
    getMonitorTradeHistory: vi.fn(),
    getQuote: vi.fn(),
    closeMonitorTrade: vi.fn(),
    deleteTelegramWatch: vi.fn(),
    simulateTelegram: vi.fn(),
    updateTelegramWatch: vi.fn(),
  }
}));

vi.mock('../../stores', () => ({
  useAppStore: vi.fn()
}));

vi.mock('../MonitorTradeHistoryPanel', () => ({
  MonitorTradeHistoryPanel: () => <div data-testid="monitor-trade-history">history</div>
}));

vi.mock('../EquityChart', () => ({
  EquityChart: () => <div data-testid="equity-chart">equity</div>
}));

vi.mock('../ui', () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {actions}
    </div>
  ),
  AnalysisTabs: ({ tabs, activeTab, onChange }: {
    tabs: Array<{ id: string; label: string }>;
    activeTab: string;
    onChange: (id: string) => void;
  }) => (
    <div>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          aria-pressed={tab.id === activeTab}
        >
          {tab.label}
        </button>
      ))}
    </div>
  ),
  ChartContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

vi.mock('../ConfirmModal', () => ({
  ConfirmModal: () => null
}));

vi.mock('../InfoModal', () => ({
  InfoModal: ({ open, title, message }: { open: boolean; title: string; message: string }) => (
    open ? (
      <div role="alertdialog">
        <div>{title}</div>
        <div>{message}</div>
      </div>
    ) : null
  )
}));

describe('TelegramWatches manual close flow', () => {
  const mockUseAppStore = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => '100'),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      }
    });

    vi.mocked(stores.useAppStore).mockImplementation(mockUseAppStore);
    mockUseAppStore.mockImplementation((selector) => selector({
      watchThresholdPct: 5,
      currentStrategy: {
        riskManagement: {
          initialCapital: 10000
        }
      },
      resultsQuoteProvider: 'finnhub'
    }));
  });

  it('opens close-monitor modal, submits manual close, and refreshes monitor state', async () => {
    const openWatch = {
      symbol: 'V',
      highIBS: 0.75,
      lowIBS: 0.1,
      thresholdPct: 0.3,
      entryPrice: 298.96,
      entryDate: '2026-03-18',
      entryIBS: 0.12,
      entryDecisionTime: '2026-03-18T19:59:00.000Z',
      currentTradeId: 'trade-v',
      linkedBrokerTradeId: null,
      isOpenPosition: true
    };
    const closedWatch = {
      ...openWatch,
      entryPrice: null,
      entryDate: null,
      entryIBS: null,
      entryDecisionTime: null,
      currentTradeId: null,
      isOpenPosition: false
    };
    const mismatchSnapshot = {
      fetchedAt: '2026-04-02T00:00:00.000Z',
      openMonitorTrade: {
        id: 'trade-v',
        symbol: 'V',
        status: 'open',
        entryDate: '2026-03-18',
        exitDate: null,
        entryPrice: 298.96,
        exitPrice: null,
        entryIBS: 0.12,
        exitIBS: null,
        entryDecisionTime: '2026-03-18T19:59:00.000Z',
        exitDecisionTime: null,
        pnlPercent: null,
        pnlAbsolute: null,
        holdingDays: null,
        notes: null,
        source: 'auto',
        isHidden: false,
        isTest: false,
        brokerOrderId: null,
        clientOrderId: null,
        filledQty: 1,
        quantity: 1,
        linkedBrokerTradeId: null
      },
      openBrokerTrade: null,
      issues: [{
        code: 'monitor_trade_without_broker_position',
        severity: 'error',
        message: 'Monitor trade V is open while broker is flat. Manual monitor close is required.',
        symbol: 'V',
        monitorTradeId: 'trade-v',
        brokerTradeId: null,
        autoFixable: false
      }],
      proposedActions: []
    };
    const okSnapshot = {
      fetchedAt: '2026-04-02T00:01:00.000Z',
      openMonitorTrade: null,
      openBrokerTrade: null,
      issues: [],
      proposedActions: []
    };
    const emptyHistory = {
      trades: [],
      openTrade: null,
      total: 0,
      lastUpdated: '2026-04-02T00:00:00.000Z'
    };

    vi.mocked(DatasetAPI.listTelegramWatches)
      .mockResolvedValueOnce([openWatch] as any)
      .mockResolvedValueOnce([closedWatch] as any);
    vi.mocked(DatasetAPI.getMonitorConsistency)
      .mockResolvedValueOnce(mismatchSnapshot as any)
      .mockResolvedValueOnce(okSnapshot as any);
    vi.mocked(DatasetAPI.getMonitorTradeHistory)
      .mockResolvedValueOnce(emptyHistory as any)
      .mockResolvedValueOnce(emptyHistory as any);
    vi.mocked(DatasetAPI.getQuote).mockResolvedValue({
      current: 299.38,
      high: 303,
      low: 297,
      open: 298.5,
      prevClose: 298.1
    } as any);
    vi.mocked(DatasetAPI.closeMonitorTrade).mockResolvedValue({
      id: 'trade-v',
      symbol: 'V',
      status: 'closed',
      exitDate: '2026-04-02',
      exitPrice: 299.38
    } as any);

    render(
      <MemoryRouter>
        <TelegramWatches />
      </MemoryRouter>
    );

    await screen.findByText('Mismatch');
    fireEvent.click(screen.getByRole('button', { name: 'Тикеры' }));

    const openButton = await screen.findByRole('button', { name: 'Закрыть monitor' });
    fireEvent.click(openButton);

    await screen.findByRole('dialog');
    await screen.findByText(/Текущая цена 299\.38 USD/);

    const submitButton = screen.getByRole('button', { name: 'Закрыть мониторинг' });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(DatasetAPI.closeMonitorTrade).toHaveBeenCalledWith(
        'trade-v',
        expect.objectContaining({
          exitPrice: 299.38,
          note: 'manual_monitor_close_from_ui'
        })
      );
    });

    await waitFor(() => {
      expect(DatasetAPI.listTelegramWatches).toHaveBeenCalledTimes(2);
      expect(DatasetAPI.getMonitorTradeHistory).toHaveBeenCalledTimes(2);
      expect(DatasetAPI.getMonitorConsistency).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText('Мониторинг закрыт')).toBeInTheDocument();
    expect(screen.getByText('Monitor-позиция V закрыта вручную.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Закрыть monitor' })).not.toBeInTheDocument();
  });
});
