import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StrategyParameters } from '../StrategyParameters';
import type { Strategy } from '../../types';

// Mock the stores
const mockUseAppStore = vi.fn();
vi.mock('../../stores', () => ({
  useAppStore: () => mockUseAppStore()
}));

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
      { type: 'indicator', indicator: 'IBS', operator: '<', value: 0.1 }
    ],
    exitConditions: [
      { type: 'indicator', indicator: 'IBS', operator: '>', value: 0.75 }
    ],
    riskManagement: {
      initialCapital: 10000,
      capitalUsage: 100,
      maxPositionSize: 1,
      stopLoss: 2,
      takeProfit: 4,
      useStopLoss: false,
      useTakeProfit: false,
      maxPositions: 1,
      maxHoldDays: 30,
      commission: { type: 'percentage', percentage: 0.1 },
      slippage: 0.05
    },
    positionSizing: { type: 'percentage', value: 10 }
  };

  const mockUpdateStrategy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAppStore.mockReturnValue({
      currentStrategy: mockStrategy,
      updateStrategy: mockUpdateStrategy
    });
  });

  it('should render strategy parameters form', () => {
    render(<StrategyParameters />);

    expect(screen.getByText('Параметры стратегии')).toBeInTheDocument();
    expect(screen.getByLabelText(/Низкий IBS/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Высокий IBS/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Максимальные дни удержания/)).toBeInTheDocument();
  });

  it('should display current parameter values', () => {
    render(<StrategyParameters />);

    const lowIBSInput = screen.getByLabelText(/Низкий IBS/) as HTMLInputElement;
    const highIBSInput = screen.getByLabelText(/Высокий IBS/) as HTMLInputElement;
    const maxHoldDaysInput = screen.getByLabelText(/Максимальные дни удержания/) as HTMLInputElement;

    expect(lowIBSInput.value).toBe('0.1');
    expect(highIBSInput.value).toBe('0.75');
    expect(maxHoldDaysInput.value).toBe('30');
  });

  it('should update parameters when values change', () => {
    render(<StrategyParameters />);

    const lowIBSInput = screen.getByLabelText(/Низкий IBS/);

    fireEvent.change(lowIBSInput, { target: { value: '0.05' } });

    expect(mockUpdateStrategy).toHaveBeenCalledWith({
      ...mockStrategy,
      parameters: {
        ...mockStrategy.parameters,
        lowIBS: 0.05
      }
    });
  });

  it('should validate parameter ranges', () => {
    render(<StrategyParameters />);

    const lowIBSInput = screen.getByLabelText(/Низкий IBS/);

    // Try to set invalid value (negative)
    fireEvent.change(lowIBSInput, { target: { value: '-0.1' } });

    // Should not update with invalid value
    expect(mockUpdateStrategy).not.toHaveBeenCalled();
  });

  it('should show parameter descriptions', () => {
    render(<StrategyParameters />);

    expect(screen.getByText(/Порог для входа в позицию/)).toBeInTheDocument();
    expect(screen.getByText(/Порог для выхода из позицию/)).toBeInTheDocument();
    expect(screen.getByText(/Максимальное количество дней/)).toBeInTheDocument();
  });

  it('should handle risk management parameters', () => {
    render(<StrategyParameters />);

    expect(screen.getByText('Управление рисками')).toBeInTheDocument();
    expect(screen.getByLabelText(/Начальный капитал/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Использование капитала/)).toBeInTheDocument();
  });

  it('should update risk management parameters', () => {
    render(<StrategyParameters />);

    const capitalInput = screen.getByLabelText(/Начальный капитал/);

    fireEvent.change(capitalInput, { target: { value: '20000' } });

    expect(mockUpdateStrategy).toHaveBeenCalledWith({
      ...mockStrategy,
      riskManagement: {
        ...mockStrategy.riskManagement,
        initialCapital: 20000
      }
    });
  });

  it('should handle stop loss and take profit toggles', () => {
    render(<StrategyParameters />);

    const stopLossToggle = screen.getByLabelText(/Использовать Stop Loss/);
    const takeProfitToggle = screen.getByLabelText(/Использовать Take Profit/);

    expect(stopLossToggle).not.toBeChecked();
    expect(takeProfitToggle).not.toBeChecked();

    fireEvent.click(stopLossToggle);

    expect(mockUpdateStrategy).toHaveBeenCalledWith({
      ...mockStrategy,
      riskManagement: {
        ...mockStrategy.riskManagement,
        useStopLoss: true
      }
    });
  });

  it('should handle position sizing parameters', () => {
    render(<StrategyParameters />);

    expect(screen.getByText('Размер позиции')).toBeInTheDocument();
    expect(screen.getByLabelText(/Тип размера позиции/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Значение/)).toBeInTheDocument();
  });

  it('should update position sizing type', () => {
    render(<StrategyParameters />);

    const positionSizeTypeSelect = screen.getByLabelText(/Тип размера позиции/);

    fireEvent.change(positionSizeTypeSelect, { target: { value: 'fixed' } });

    expect(mockUpdateStrategy).toHaveBeenCalledWith({
      ...mockStrategy,
      positionSizing: {
        ...mockStrategy.positionSizing,
        type: 'fixed'
      }
    });
  });

  it('should handle commission settings', () => {
    render(<StrategyParameters />);

    expect(screen.getByText('Комиссии')).toBeInTheDocument();
    expect(screen.getByLabelText(/Тип комиссии/)).toBeInTheDocument();
  });

  it('should render without strategy', () => {
    mockUseAppStore.mockReturnValue({
      currentStrategy: null,
      updateStrategy: mockUpdateStrategy
    });

    render(<StrategyParameters />);

    expect(screen.getByText('Нет выбранной стратегии')).toBeInTheDocument();
  });

  it('should handle decimal inputs correctly', () => {
    render(<StrategyParameters />);

    const lowIBSInput = screen.getByLabelText(/Низкий IBS/);

    fireEvent.change(lowIBSInput, { target: { value: '0.125' } });

    expect(mockUpdateStrategy).toHaveBeenCalledWith({
      ...mockStrategy,
      parameters: {
        ...mockStrategy.parameters,
        lowIBS: 0.125
      }
    });
  });

  it('should validate IBS range constraints', () => {
    render(<StrategyParameters />);

    const lowIBSInput = screen.getByLabelText(/Низкий IBS/);
    const highIBSInput = screen.getByLabelText(/Высокий IBS/);

    // Try to set low IBS higher than high IBS
    fireEvent.change(lowIBSInput, { target: { value: '0.8' } });

    // Should show validation error or prevent invalid state
    expect(screen.getByText(/Низкий IBS должен быть меньше высокого IBS/)).toBeInTheDocument();
  });
});