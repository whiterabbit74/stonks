import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TradesTable } from '../TradesTable';
import type { Trade } from '../../types';

describe('TradesTable', () => {
  const mockTrades: Trade[] = [
    {
      id: 'trade-1',
      entryDate: '2023-12-01',
      exitDate: '2023-12-05',
      entryPrice: 100.50,
      exitPrice: 105.75,
      quantity: 100,
      pnl: 525,
      pnlPercent: 5.22,
      duration: 4,
      exitReason: 'ibs_signal',
      context: {
        ticker: 'AAPL',
        currentCapitalAfterExit: 10525
      }
    },
    {
      id: 'trade-2',
      entryDate: '2023-12-06',
      exitDate: '2023-12-10',
      entryPrice: 105.75,
      exitPrice: 98.25,
      quantity: 100,
      pnl: -750,
      pnlPercent: -7.09,
      duration: 4,
      exitReason: 'max_hold_days',
      context: {
        ticker: 'AAPL',
        currentCapitalAfterExit: 9775
      }
    }
  ];

  it('should render trades table with data', () => {
    render(<TradesTable trades={mockTrades} />);

    // Check if table headers are present
    expect(screen.getByText('#')).toBeInTheDocument();
    expect(screen.getByText('Тикер')).toBeInTheDocument();
    expect(screen.getByText('Дата сделки')).toBeInTheDocument();
    expect(screen.getByText('Цена входа')).toBeInTheDocument();
    expect(screen.getByText('Цена выхода')).toBeInTheDocument();
    expect(screen.getByText('Кол-во')).toBeInTheDocument();
    expect(screen.getByText('PnL, $')).toBeInTheDocument();
    expect(screen.getByText('PnL, %')).toBeInTheDocument();
    expect(screen.getByText('Депозит, $')).toBeInTheDocument();
    expect(screen.getByText('Дней')).toBeInTheDocument();
    expect(screen.getByText('Причина выхода')).toBeInTheDocument();
  });

  it('should display trade data correctly', () => {
    render(<TradesTable trades={mockTrades} />);

    // Check first trade data
    expect(screen.getByText('1')).toBeInTheDocument(); // Trade number
    expect(screen.getAllByText('AAPL')[0]).toBeInTheDocument(); // Ticker (first occurrence)
    expect(screen.getByText('100.50')).toBeInTheDocument(); // Entry price
    expect(screen.getAllByText('105.75')[0]).toBeInTheDocument(); // Exit price (first occurrence)
    expect(screen.getAllByText('100')[0]).toBeInTheDocument(); // Quantity
    expect(screen.getByText('525.00')).toBeInTheDocument(); // PnL
    expect(screen.getByText('5.22%')).toBeInTheDocument(); // PnL percentage
    expect(screen.getByText('10525.00')).toBeInTheDocument(); // Capital after exit
    expect(screen.getAllByText('4')[0]).toBeInTheDocument(); // Duration
    expect(screen.getByText('ibs_signal')).toBeInTheDocument(); // Exit reason
  });

  it('should display profitable trades in green', () => {
    render(<TradesTable trades={[mockTrades[0]]} />);

    const pnlCell = screen.getByText('525.00');
    const pnlPercentCell = screen.getByText('5.22%');

    expect(pnlCell).toHaveClass('text-emerald-600');
    expect(pnlPercentCell).toHaveClass('text-emerald-600');
  });

  it('should display losing trades in orange', () => {
    render(<TradesTable trades={[mockTrades[1]]} />);

    const pnlCell = screen.getByText('-750.00');
    const pnlPercentCell = screen.getByText('-7.09%');

    expect(pnlCell).toHaveClass('text-orange-600');
    expect(pnlPercentCell).toHaveClass('text-orange-600');
  });

  it('should format dates correctly', () => {
    render(<TradesTable trades={[mockTrades[0]]} />);

    // Check if dates are formatted (Russian locale)
    expect(screen.getByText(/01\.12\.2023/)).toBeInTheDocument(); // Entry date
    expect(screen.getByText(/05\.12\.2023/)).toBeInTheDocument(); // Exit date
  });

  it('should handle empty trades array', () => {
    render(<TradesTable trades={[]} />);

    expect(screen.getByText('Нет сделок для отображения')).toBeInTheDocument();
  });

  it('should handle null trades', () => {
    render(<TradesTable trades={null as any} />);

    expect(screen.getByText('Нет сделок для отображения')).toBeInTheDocument();
  });

  it('should hide ticker column when no ticker data', () => {
    const tradesWithoutTicker = mockTrades.map(trade => ({
      ...trade,
      context: { ...trade.context, ticker: undefined }
    }));

    render(<TradesTable trades={tradesWithoutTicker} />);

    expect(screen.queryByText('Тикер')).not.toBeInTheDocument();
  });

  it('should handle missing context data', () => {
    const tradesWithoutContext = mockTrades.map(trade => ({
      ...trade,
      context: undefined
    }));

    render(<TradesTable trades={tradesWithoutContext} />);

    // Should still render the table
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('100.50')).toBeInTheDocument();
  });

  it('should handle missing currentCapitalAfterExit', () => {
    const tradesWithoutCapital = mockTrades.map(trade => ({
      ...trade,
      context: { ...trade.context, currentCapitalAfterExit: undefined }
    }));

    render(<TradesTable trades={tradesWithoutCapital} />);

    // Should show dash for missing capital data
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('should format large numbers correctly', () => {
    const largeTrade: Trade = {
      id: 'trade-large',
      entryDate: '2023-12-01',
      exitDate: '2023-12-05',
      entryPrice: 100.50,
      exitPrice: 105.75,
      quantity: 10000,
      pnl: 52500,
      pnlPercent: 5.22,
      duration: 4,
      exitReason: 'ibs_signal',
      context: {
        ticker: 'AAPL',
        currentCapitalAfterExit: 1052500
      }
    };

    render(<TradesTable trades={[largeTrade]} />);

    expect(screen.getByText('10,000')).toBeInTheDocument(); // Quantity with comma
    expect(screen.getByText('52500.00')).toBeInTheDocument(); // PnL
    expect(screen.getByText('1052500.00')).toBeInTheDocument(); // Capital
  });

  it('labels EMA holder-value prices as index prices and shows raw close separately', () => {
    const holderTrade: Trade = {
      id: 'ema-holder',
      entryDate: '2024-01-04',
      exitDate: '2024-01-05',
      entryPrice: 100,
      exitPrice: 150,
      quantity: 100.25,
      pnl: 5012.5,
      pnlPercent: 50.125,
      duration: 1,
      exitReason: 'ema_sell_0',
      context: {
        ticker: 'TQQQ',
        priceBasis: 'holder_value',
        priceBasisLabel: 'Индексная цена с учетом сплитов',
        quantityBasis: 'index_units',
        entryRawClose: 50,
        exitRawClose: 75,
        currentCapitalAfterExit: 15012.5,
      },
    };

    render(<TradesTable trades={[holderTrade]} />);

    expect(screen.getByText('Цена входа (индекс)')).toBeInTheDocument();
    expect(screen.getByText('Цена выхода (индекс)')).toBeInTheDocument();
    expect(screen.getByText(/Индексная цена с учетом сплитов/)).toBeInTheDocument();
    expect(screen.getByText('close 50.00')).toBeInTheDocument();
    expect(screen.getByText('close 75.00')).toBeInTheDocument();
    expect(screen.getByText('100.25')).toBeInTheDocument();
  });
});
