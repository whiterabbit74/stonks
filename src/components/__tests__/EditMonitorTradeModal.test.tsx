import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditMonitorTradeModal } from '../EditMonitorTradeModal';
import type { MonitorTradeRecord } from '../../types';

function makeTrade(overrides: Partial<MonitorTradeRecord> = {}): MonitorTradeRecord {
  return {
    id: 'trade-aapl',
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
    notes: null,
    source: 'manual',
    isHidden: false,
    isTest: false,
    brokerOrderId: null,
    clientOrderId: null,
    filledQty: null,
    quantity: 1,
    linkedBrokerTradeId: null,
    ...overrides,
  };
}

describe('EditMonitorTradeModal', () => {
  it('allows setting exit fields for an open monitor trade', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <EditMonitorTradeModal
        open
        trade={makeTrade()}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText('Дата выхода (ET)'), {
      target: { value: '2026-04-03' },
    });
    fireEvent.change(screen.getByLabelText('Цена выхода'), {
      target: { value: '205.75' },
    });
    fireEvent.change(screen.getByLabelText('Exit IBS, %'), {
      target: { value: '82.5' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        exitDate: '2026-04-03',
        exitPrice: 205.75,
        exitIBS: 0.825,
      }));
    });
  });
});
