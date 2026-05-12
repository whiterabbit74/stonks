import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebullAccountPage } from '../WebullAccountPage';
import { DatasetAPI } from '../../lib/api';
import * as stores from '../../stores';
import type { BrokerTradeRecord } from '../../types';

vi.mock('../../lib/api', () => ({
  DatasetAPI: {
    getWebullDashboard: vi.fn(),
    getAutotradeConfig: vi.fn(),
    getAutotradeLogs: vi.fn(),
    getBrokerTrades: vi.fn(),
    updateBrokerTrade: vi.fn(),
    createBrokerTrade: vi.fn(),
    deleteBrokerTrade: vi.fn(),
    closeWebullPosition: vi.fn(),
  },
}));

vi.mock('../../stores', () => ({
  useAppStore: vi.fn(),
}));

const openBrokerTrade: BrokerTradeRecord = {
  id: 'broker-aapl',
  symbol: 'AAPL',
  status: 'open',
  entryDate: '2026-04-01',
  exitDate: null,
  entryPrice: 198.42,
  exitPrice: null,
  entryIBS: 0.14,
  exitIBS: null,
  entryDecisionTime: null,
  exitDecisionTime: null,
  pnlPercent: null,
  pnlAbsolute: null,
  holdingDays: null,
  notes: 'needs manual close',
  source: 'auto',
  isHidden: false,
  isTest: false,
  brokerOrderId: 'entry-order',
  clientOrderId: 'entry-client',
  filledQty: 1,
  quantity: 1,
};

describe('WebullAccountPage broker trade journal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(stores.useAppStore).mockImplementation((selector) => selector({
      resultsQuoteProvider: 'finnhub',
    }));
    vi.mocked(DatasetAPI.getWebullDashboard).mockResolvedValue({
      fetchedAt: '2026-04-02T00:00:00.000Z',
      connection: {
        configured: true,
        hasAccessToken: true,
        hasAccountId: true,
      },
      balance: {},
      accounts: [],
      positions: [],
      openOrders: [],
      todayOrders: [],
      orderHistory: [],
      raw: {},
    } as any);
    vi.mocked(DatasetAPI.getAutotradeConfig).mockResolvedValue({
      config: {
        enabled: false,
        allowNewEntries: true,
        allowExits: true,
        symbols: 'AAPL',
        lowIBS: 0.1,
        highIBS: 0.75,
      },
      state: {},
    } as any);
    vi.mocked(DatasetAPI.getAutotradeLogs).mockResolvedValue({
      monitor: [],
      autotrade: [],
      brokerRaw: [],
    } as any);
    vi.mocked(DatasetAPI.getBrokerTrades).mockResolvedValue({
      trades: [openBrokerTrade],
      openTrade: openBrokerTrade,
      total: 1,
      lastUpdated: '2026-04-02T00:00:00.000Z',
    });
    vi.mocked(DatasetAPI.updateBrokerTrade).mockResolvedValue({
      ...openBrokerTrade,
      status: 'closed',
      exitDate: '2026-04-03',
      exitPrice: 205.75,
      exitIBS: 0.825,
      pnlAbsolute: 7.33,
      pnlPercent: 3.694184,
      holdingDays: 2,
      notes: 'closed manually',
    });
  });

  it('edits an open broker trade from the journal and submits exit fields', async () => {
    render(<WebullAccountPage />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Журнал сделок' }));
    await screen.findByText('AAPL');

    fireEvent.click(screen.getByRole('button', { name: 'Редактировать AAPL' }));
    fireEvent.change(screen.getByLabelText('Дата выхода'), {
      target: { value: '2026-04-03' },
    });
    fireEvent.change(screen.getByLabelText('Цена выхода'), {
      target: { value: '205.75' },
    });
    fireEvent.change(screen.getByLabelText('Exit IBS, %'), {
      target: { value: '82.5' },
    });
    fireEvent.change(screen.getByLabelText('Заметки'), {
      target: { value: 'closed manually' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(DatasetAPI.updateBrokerTrade).toHaveBeenCalledWith(
        'broker-aapl',
        expect.objectContaining({
          exitDate: '2026-04-03',
          exitPrice: 205.75,
          exitIBS: 0.825,
          notes: 'closed manually',
        }),
      );
    });
    expect(await screen.findByText('закрыта')).toBeInTheDocument();
  });
});
