import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CompactMetrics } from '../CompactMetrics';
import type { BacktestMetrics } from '../../lib/backtest-statistics';
import type { Trade } from '../../types';

const metrics: BacktestMetrics = {
  totalReturn: 25,
  cagr: 12.5,
  winRate: 65,
  totalTrades: 20,
  winningTrades: 13,
  losingTrades: 7,
  profitFactor: 1.8,
  netProfit: 2500,
  netReturn: 25,
  maxDrawdown: 8.4,
  totalContribution: 0,
  contributionCount: 0,
};

const trades = [{}, {}, {}] as Trade[];

describe('CompactMetrics', () => {
  it('shows percentage metrics in the same units as MetricsGrid', () => {
    render(<CompactMetrics metrics={metrics} trades={trades} />);

    expect(screen.getByText('12.5%')).toBeTruthy();
    expect(screen.getByText('8.4%')).toBeTruthy();
    expect(screen.getByText('65.0%')).toBeTruthy();
  });

  it('shows profit factor instead of a metric the backtest never provides', () => {
    render(<CompactMetrics metrics={metrics} trades={trades} />);

    expect(screen.getByText('Profit Factor')).toBeTruthy();
    expect(screen.getByText('1.80')).toBeTruthy();
    expect(screen.queryByText('—')).toBeNull();
  });

  it('renders infinite profit factor without losses', () => {
    render(<CompactMetrics metrics={{ ...metrics, profitFactor: Infinity }} trades={trades} />);

    expect(screen.getByText('∞')).toBeTruthy();
  });
});
