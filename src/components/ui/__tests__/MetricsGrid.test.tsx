import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MetricsGrid } from '../MetricsGrid';

describe('MetricsGrid', () => {
  it('prints percentages as already-scaled 0..100 values', () => {
    render(
      <MetricsGrid
        finalValue={12345.67}
        maxDrawdown={8.4}
        metrics={{
          totalReturn: 25,
          cagr: 12.5,
          winRate: 65,
          totalTrades: 20,
          profitFactor: 1.8,
        }}
      />
    );

    expect(screen.getByText('$12,345.67')).toBeInTheDocument();
    expect(screen.getByText('25.0%')).toBeInTheDocument();
    expect(screen.getByText('12.5%')).toBeInTheDocument();
    expect(screen.getByText('65.0%')).toBeInTheDocument();
    expect(screen.getByText('8.4%')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('1.80')).toBeInTheDocument();
    expect(screen.queryByText('0.3%')).toBeNull();
    expect(screen.queryByText('1250.0%')).toBeNull();
  });

  it('shows infinity for a non-finite profit factor and zero trades when omitted', () => {
    render(
      <MetricsGrid
        finalValue={0}
        maxDrawdown={0}
        metrics={{
          totalReturn: 0,
          cagr: 0,
          winRate: 0,
          profitFactor: Infinity,
        }}
      />
    );

    expect(screen.getByText('∞')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
