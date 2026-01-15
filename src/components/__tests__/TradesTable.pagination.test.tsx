import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TradesTable } from '../TradesTable';
import type { Trade } from '../../types';

describe('TradesTable Pagination Logic', () => {
  const generateTrades = (count: number): Trade[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `trade-${i}`,
      entryDate: new Date(2020, 0, 1 + i).toISOString(),
      exitDate: new Date(2020, 0, 2 + i).toISOString(),
      entryPrice: 100 + i,
      exitPrice: 105 + i,
      quantity: 10,
      pnl: 50,
      pnlPercent: 5,
      duration: 1,
      exitReason: 'test',
      context: { ticker: 'TEST' }
    }));
  };

  it('should display the newest trades on the first page', () => {
    const tradeCount = 100;
    const trades = generateTrades(tradeCount);
    // trade-0 is oldest, trade-99 is newest.

    render(<TradesTable trades={trades} />);

    // We expect the first row to be trade-99 (the last one in the input array)
    // The table displays columns. The first column is row number.
    // The price column should show 199.00 (100 + 99)

    // Let's look for text that matches the price of the last trade
    const lastTradePrice = (100 + 99).toFixed(2);
    // Use getAllByText because entry price and exit price could match, or other columns
    expect(screen.getAllByText(lastTradePrice).length).toBeGreaterThan(0);

    // The first trade (oldest) should NOT be visible on page 1 (since page size is 50)
    const firstTradePrice = (100 + 0).toFixed(2);
    expect(screen.queryByText(firstTradePrice)).not.toBeInTheDocument();
  });

  it('should display the oldest trades on the last page', () => {
    const tradeCount = 100;
    const trades = generateTrades(tradeCount);

    render(<TradesTable trades={trades} />);

    // Go to last page
    const forwardButton = screen.getByText('В конец');
    fireEvent.click(forwardButton);

    // Now we should see the oldest trade
    const firstTradePrice = (100 + 0).toFixed(2);
    expect(screen.getAllByText(firstTradePrice).length).toBeGreaterThan(0);
  });
});
