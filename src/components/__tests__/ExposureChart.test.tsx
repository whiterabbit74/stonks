import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExposureChart } from '../ExposureChart';

const mockSeries = {
  setData: vi.fn(),
};

const mockChart = {
  addSeries: vi.fn(() => mockSeries),
  timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
  remove: vi.fn(),
};

vi.mock('lightweight-charts', () => ({
  AreaSeries: Symbol('AreaSeries'),
  LineSeries: Symbol('LineSeries'),
  createChart: vi.fn(() => mockChart),
}));

vi.mock('../../hooks/useIsDark', () => ({
  useIsDark: () => false,
}));

describe('ExposureChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows average exposure across all chart points including zero exposure days', () => {
    render(
      <ExposureChart
        exposure={[
          { date: '2024-01-01', equity: 10000, positionValue: 0, exposurePct: 0, activePositions: 0 },
          { date: '2024-01-02', equity: 10000, positionValue: 20000, exposurePct: 200, activePositions: 1 },
          { date: '2024-01-03', equity: 10000, positionValue: 10000, exposurePct: 100, activePositions: 1 },
        ]}
      />
    );

    expect(screen.getByText('Средняя экспозиция')).toBeInTheDocument();
    expect(screen.getByText('100.0%')).toBeInTheDocument();
  });
});
