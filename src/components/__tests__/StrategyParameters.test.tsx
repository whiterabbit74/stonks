import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StrategyParameters } from '../StrategyParameters';
import type { Strategy } from '../../types';

describe('StrategyParameters', () => {
  const mockStrategy: Strategy = {
    id: 'test-strategy',
    name: 'Test IBS Strategy',
    description: 'Test strategy description',
    type: 'ibs-mean-reversion',
    parameters: {
      lowIBS: 0.1,
      highIBS: 0.75,
      maxHoldDays: 30
    },
    entryConditions: [
      { type: 'indicator', indicator: 'ibs', operator: '<', threshold: 0.1 } as any
    ],
    exitConditions: [
      { type: 'indicator', indicator: 'ibs', operator: '>', threshold: 0.75 } as any
    ],
    riskManagement: {
      initialCapital: 10000,
      capitalUsage: 100,
      maxPositionSize: 1,
      stopLoss: 0.02,
      takeProfit: 0.04,
      useStopLoss: true,
      useTakeProfit: true,
      maxPositions: 1,
      maxHoldDays: 30,
      commission: { type: 'percentage', percentage: 0.1 },
      slippage: 0.05,
      leverage: 2
    },
    positionSizing: { type: 'percentage', value: 10 }
  };

  it('should render strategy parameters title', () => {
    render(<StrategyParameters strategy={mockStrategy} />);
    expect(screen.getByText('Параметры стратегии')).toBeInTheDocument();
  });

  it('should display IBS parameters', () => {
    render(<StrategyParameters strategy={mockStrategy} />);

    // Check for IBS Entry
    expect(screen.getByText('IBS входа:')).toBeInTheDocument();
    expect(screen.getByText('< 10.0%')).toBeInTheDocument();

    // Check for IBS Exit
    expect(screen.getByText('IBS выхода:')).toBeInTheDocument();
    expect(screen.getByText('> 75.0%')).toBeInTheDocument();
  });

  it('should display max hold days', () => {
    render(<StrategyParameters strategy={mockStrategy} />);
    expect(screen.getByText('Макс. удержание:')).toBeInTheDocument();
    expect(screen.getByText('30 дней')).toBeInTheDocument();
  });

  it('should display commission', () => {
    render(<StrategyParameters strategy={mockStrategy} />);
    expect(screen.getByText('Комиссия:')).toBeInTheDocument();
    expect(screen.getByText('Процентная: 0.1%')).toBeInTheDocument();
  });

  it('should display leverage', () => {
    render(<StrategyParameters strategy={mockStrategy} />);
    expect(screen.getByText('Плечо:')).toBeInTheDocument();
    expect(screen.getByText('2:1 (с плечом)')).toBeInTheDocument();
  });

  it('should display stop loss and take profit', () => {
    render(<StrategyParameters strategy={mockStrategy} />);

    expect(screen.getByText('Стоп-лосс:')).toBeInTheDocument();
    expect(screen.getByText('-2.0%')).toBeInTheDocument();

    expect(screen.getByText('Тейк-профит:')).toBeInTheDocument();
    expect(screen.getByText('+4.0%')).toBeInTheDocument();
  });

  it('should display additional parameters', () => {
    const additionalParams = {
      'Custom Param': 'Value 123',
      'Numeric Param': 42.5
    };

    render(<StrategyParameters strategy={mockStrategy} additionalParams={additionalParams} />);

    expect(screen.getByText('Custom Param:')).toBeInTheDocument();
    expect(screen.getByText('Value 123')).toBeInTheDocument();

    expect(screen.getByText('Numeric Param:')).toBeInTheDocument();
    expect(screen.getByText('42.50')).toBeInTheDocument();
  });

  it('should return null when strategy is missing', () => {
    const { container } = render(<StrategyParameters strategy={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should handle missing optional parameters gracefully', () => {
    const minimalStrategy: Strategy = {
      ...mockStrategy,
      riskManagement: {
        ...mockStrategy.riskManagement,
        stopLoss: undefined,
        takeProfit: undefined,
        maxHoldDays: undefined
      },
      entryConditions: [],
      exitConditions: []
    };

    render(<StrategyParameters strategy={minimalStrategy} />);

    expect(screen.getByText('Параметры стратегии')).toBeInTheDocument();
    expect(screen.queryByText('Стоп-лосс:')).not.toBeInTheDocument();
    expect(screen.queryByText('Тейк-профит:')).not.toBeInTheDocument();
    expect(screen.queryByText('Макс. удержание:')).not.toBeInTheDocument();
  });
});