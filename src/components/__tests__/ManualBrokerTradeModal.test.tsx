import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ManualBrokerTradeModal } from '../ManualBrokerTradeModal';

describe('ManualBrokerTradeModal', () => {
  it('validates required symbol before submit', async () => {
    const onSubmit = vi.fn();

    render(
      <ManualBrokerTradeModal
        open
        onClose={() => {}}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сделку' }));

    expect(await screen.findByText('Укажите тикер.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('normalizes payload and submits broker trade data', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ManualBrokerTradeModal
        open
        onClose={() => {}}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText('Тикер'), { target: { value: ' msft ' } });
    fireEvent.change(screen.getByLabelText('Количество'), { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText('Дата входа'), { target: { value: '2026-04-20' } });
    fireEvent.change(screen.getByLabelText('Дата выхода'), { target: { value: '2026-04-21' } });
    fireEvent.change(screen.getByLabelText('Цена входа'), { target: { value: '321.45' } });
    fireEvent.change(screen.getByLabelText('Цена выхода'), { target: { value: '325.1' } });
    fireEvent.change(screen.getByLabelText('Заметки'), { target: { value: '  imported from statement  ' } });

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сделку' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        symbol: 'MSFT',
        quantity: 2.5,
        entryDate: '2026-04-20',
        exitDate: '2026-04-21',
        entryPrice: 321.45,
        exitPrice: 325.1,
        notes: 'imported from statement',
      });
    });
  });
});
