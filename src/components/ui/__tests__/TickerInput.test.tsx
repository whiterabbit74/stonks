import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TickerInput } from '../TickerInput';

describe('TickerInput', () => {
  it('parses, uppercases, trims, and dedupes tickers on change', () => {
    const onChange = vi.fn();
    const onTickersChange = vi.fn();
    render(
      <TickerInput
        value=""
        onChange={onChange}
        onTickersChange={onTickersChange}
        tickers={[]}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('AAPL, MSFT, AMZN, MAGS'), {
      target: { value: ' aapl, msft, AAPL, ' },
    });

    expect(onChange).toHaveBeenCalledWith(' aapl, msft, AAPL, ');
    expect(onTickersChange).toHaveBeenCalledWith(['AAPL', 'MSFT']);
  });

  it('renders badges from the tickers prop and can hide them', () => {
    const { rerender } = render(
      <TickerInput
        value="AAPL,MSFT"
        onChange={vi.fn()}
        onTickersChange={vi.fn()}
        tickers={['AAPL', 'MSFT']}
      />
    );

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();

    rerender(
      <TickerInput
        value="AAPL,MSFT"
        onChange={vi.fn()}
        onTickersChange={vi.fn()}
        tickers={['AAPL', 'MSFT']}
        showBadges={false}
      />
    );
    expect(screen.queryByText('AAPL')).toBeNull();
  });

  it('uses a custom placeholder when provided', () => {
    render(
      <TickerInput
        value=""
        onChange={vi.fn()}
        onTickersChange={vi.fn()}
        tickers={[]}
        placeholder="QQQ"
      />
    );

    expect(screen.getByPlaceholderText('QQQ')).toBeInTheDocument();
  });
});
