import { describe, it } from 'vitest';
import { render } from '@testing-library/react';
import { TradingChart } from '../TradingChart';

describe('TradingChart', () => {
  it('renders without crashing', () => {
    const data = [
      { date: '2023-01-01', open: 100, high: 110, low: 90, close: 105, volume: 1000 },
      { date: '2023-01-02', open: 105, high: 115, low: 100, close: 110, volume: 1200 },
    ];
    render(<TradingChart data={data} trades={[]} />);
  });
});
