import type { OHLCData, Strategy, BacktestResult, Trade, EquityPoint, SplitEvent } from '../types';
import { IndicatorEngine } from './indicators';
import { MetricsCalculator } from './metrics';
import { adjustOHLCForSplits } from './utils';

export interface CleanBacktestOptions {
  // Entry price timing: at current bar close, or at next day's open
  entryExecution?: 'close' | 'nextOpen';
  // If true, do not exit by maxHoldDays (exit only by IBS or end_of_data)
  ignoreMaxHoldDaysExit?: boolean;
  // If true, IBS exit is allowed only when current close > entry price
  ibsExitRequireAboveEntry?: boolean;
  // Stock splits to apply to the data
  splits?: SplitEvent[];
}

/**
 * Чистый бэктест только для IBS стратегии
 * Никаких комиссий, проскальзываний, стоп-лоссов
 */
export class CleanBacktestEngine {
  private data: OHLCData[];
  private strategy: Strategy;
  private trades: Trade[] = [];
  private equity: EquityPoint[] = [];
  private currentCapital: number;
  private ibsValues: number[] = [];
  private options: Required<CleanBacktestOptions>;

  /**
   * Рассчитать комиссию для сделки
   */
  private calculateCommission(tradeValue: number): number {
    const { commission } = this.strategy.riskManagement;
    
    switch (commission.type) {
      case 'fixed':
        return commission.fixed || 0;
      case 'percentage':
        return tradeValue * ((commission.percentage || 0) / 100);
      case 'combined':
        return (commission.fixed || 0) + tradeValue * ((commission.percentage || 0) / 100);
      default:
        return 0;
    }
  }

  constructor(data: OHLCData[], strategy: Strategy, options?: CleanBacktestOptions) {
    // Применяем сплиты к данным если они предоставлены
    this.data = options?.splits ? adjustOHLCForSplits(data, options.splits) : data;
    this.strategy = strategy;
    this.currentCapital = strategy.riskManagement.initialCapital;
    this.options = {
      entryExecution: options?.entryExecution ?? 'close',
      ignoreMaxHoldDaysExit: options?.ignoreMaxHoldDaysExit ?? false,
      ibsExitRequireAboveEntry: options?.ibsExitRequireAboveEntry ?? false,
      splits: options?.splits ?? []
    };
    
    // Рассчитываем IBS для всех баров (без исключений на пустых данных)
    this.ibsValues = this.data && this.data.length > 0 ? IndicatorEngine.calculateIBS(this.data) : [];
  }

  public runBacktest(): BacktestResult {
    console.log('🔧 STRATEGY PARAMETERS:', this.strategy.parameters);
    // Пустые данные -> пустой результат без ошибок
    if (!this.data || this.data.length === 0) {
      return {
        trades: [],
        metrics: new MetricsCalculator([], [], this.strategy.riskManagement.initialCapital).calculateAllMetrics(),
        equity: [],
        chartData: [],
        insights: []
      };
    }
    
    let position: {
      entryDate: Date;
      entryPrice: number;
      quantity: number;
      entryIndex: number;
    } | null = null;

    const lowIBS = Number(this.strategy.parameters.lowIBS ?? 0.1);
    const highIBS = Number(this.strategy.parameters.highIBS ?? 0.75);
    const maxHoldDays = typeof this.strategy.parameters.maxHoldDays === 'number'
      ? this.strategy.parameters.maxHoldDays
      : (this.strategy.riskManagement.maxHoldDays ?? 30);
    const capitalUsage = this.strategy.riskManagement.capitalUsage ?? 100;

    // Проходим по всем барам; обработка входа зависит от типа исполнения
    for (let i = 0; i < this.data.length; i++) {
      const bar = this.data[i];
      const nextBar = this.data[i + 1];
      const ibs = this.ibsValues[i];

      if (isNaN(ibs)) continue; // Пропускаем невалидные IBS

      // Если нет позиции - проверяем вход
      if (!position) {
        // Проверяем, что IBS корректное значение (не NaN)
        if (!isNaN(ibs) && ibs < lowIBS) {
          // СИГНАЛ ВХОДА: IBS текущего дня < lowIBS
          const investmentAmount = (this.currentCapital * capitalUsage) / 100;

          if (this.options.entryExecution === 'nextOpen') {
            // ПОКУПКА: по цене открытия следующего дня
            if (!nextBar) {
              // Если нет следующего дня, покупаем по текущей цене закрытия как fallback
              const quantity = Math.floor(investmentAmount / bar.close);
              if (quantity > 0) {
                const totalCost = quantity * bar.close;
                position = {
                  entryDate: bar.date,
                  entryPrice: bar.close, 
                  quantity: quantity,
                  entryIndex: i
                };
                this.currentCapital -= totalCost;
                console.log(`🟢 ENTRY SIGNAL: IBS=${ibs.toFixed(3)} < ${lowIBS} on ${bar.date.toISOString().split('T')[0]}`);
                console.log(`🟢 ENTRY EXECUTION(fallback-close): bought ${quantity} shares at $${bar.close.toFixed(2)} on ${bar.date.toISOString().split('T')[0]} (no next day available)`);
              }
            } else {
              const quantity = Math.floor(investmentAmount / nextBar.open);
              if (quantity > 0) {
                const totalCost = quantity * nextBar.open;
                position = {
                  entryDate: nextBar.date, // Дата покупки = следующий день
                  entryPrice: nextBar.open, // Цена покупки = открытие следующего дня
                  quantity: quantity,
                  entryIndex: i + 1 // Индекс следующего дня
                };
                this.currentCapital -= totalCost;
                console.log(`🟢 ENTRY SIGNAL: IBS=${ibs.toFixed(3)} < ${lowIBS} on ${bar.date.toISOString().split('T')[0]}`);
                console.log(`🟢 ENTRY EXECUTION(nextOpen): bought ${quantity} shares at $${nextBar.open.toFixed(2)} on ${nextBar.date.toISOString().split('T')[0]}`);
              }
            }
          } else {
            // entryExecution === 'close' -> покупка по цене закрытия текущего дня
            const quantity = Math.floor(investmentAmount / bar.close);
            if (quantity > 0) {
              const totalCost = quantity * bar.close;
              position = {
                entryDate: bar.date,
                entryPrice: bar.close,
                quantity,
                entryIndex: i
              };
              this.currentCapital -= totalCost;
              console.log(`🟢 ENTRY SIGNAL: IBS=${ibs.toFixed(3)} < ${lowIBS} on ${bar.date.toISOString().split('T')[0]}`);
              console.log(`🟢 ENTRY EXECUTION(close): bought ${quantity} shares at $${bar.close.toFixed(2)} on ${bar.date.toISOString().split('T')[0]}`);
            }
          }
        }
      }
      // Если есть позиция — проверяем выход. Разрешаем выход в день входа,
      // если вход был по nextOpen (т.е. покупка утром, выход возможен на закрытии того же дня).
      else {
        const isEntryDay = i === position.entryIndex;
        const canCheckToday = !isEntryDay || this.options.entryExecution === 'nextOpen';

        if (canCheckToday) {
          let shouldExit = false;
          let exitReason = '';

          // Проверяем IBS условие выхода (только если IBS валидное)
          if (!isNaN(ibs) && ibs > highIBS) {
            if (this.options.ibsExitRequireAboveEntry) {
              if (bar.close > position.entryPrice) {
                shouldExit = true;
                exitReason = 'ibs_signal';
              }
            } else {
              shouldExit = true;
              exitReason = 'ibs_signal';
            }
          }
          // Проверяем максимальное время удержания
          else if (!this.options.ignoreMaxHoldDaysExit) {
            const daysDiff = Math.floor((bar.date.getTime() - position.entryDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysDiff >= maxHoldDays) {
              shouldExit = true;
              exitReason = 'max_hold_days';
            }
          }

          if (shouldExit) {
            // ВЫХОД: продаем все акции по цене закрытия
            const exitPrice = bar.close;
            const grossProceeds = position.quantity * exitPrice;
            const grossCost = position.quantity * position.entryPrice;
            const pnl = grossProceeds - grossCost;
            const pnlPercent = (pnl / grossCost) * 100;
            const duration = Math.floor((bar.date.getTime() - position.entryDate.getTime()) / (1000 * 60 * 60 * 24));

            // Создаем сделку
            const trade: Trade = {
              id: `trade-${this.trades.length}`,
              entryDate: position.entryDate,
              exitDate: bar.date,
              entryPrice: position.entryPrice,
              exitPrice: exitPrice,
              quantity: position.quantity,
              pnl: pnl,
              pnlPercent: pnlPercent,
              duration: duration,
              exitReason: exitReason,
              context: {
                marketConditions: 'normal',
                indicatorValues: { IBS: ibs },
                volatility: 0,
                trend: 'sideways',
                initialInvestment: grossCost
              }
            };

            this.trades.push(trade);
            this.currentCapital += grossProceeds;
            
            // Обновляем капитал в контексте сделки
            if (trade.context) {
              (trade.context as any).currentCapitalAfterExit = this.currentCapital;
            }

            console.log(`🔴 EXIT: IBS=${ibs.toFixed(3)}, ${exitReason}, P&L=$${pnl.toFixed(2)}, Duration=${duration} days`);
            
            position = null;
          }
        }
      }

      // Обновляем equity curve
      let totalValue = this.currentCapital;
      if (position) {
        // Учитываем комиссию на выход при расчете equity для открытых позиций
        const grossValue = position.quantity * bar.close;
        const commission = this.calculateCommission(grossValue);
        totalValue += grossValue - commission;
      }

      // Рассчитываем drawdown
      const peakValue = this.equity.length > 0 
        ? Math.max(...this.equity.map(e => e.value), totalValue)
        : totalValue;
      const drawdown = peakValue > 0 ? ((peakValue - totalValue) / peakValue) * 100 : 0;

      this.equity.push({
        date: bar.date,
        value: totalValue,
        drawdown: drawdown
      });
    }

    // Обрабатываем последний бар отдельно (только для equity и выхода)
    const lastBar = this.data[this.data.length - 1];
    const lastIBS = this.ibsValues[this.data.length - 1];
    
    if (position) {
      // Проверяем выход на последнем баре
      let shouldExit = false;
      let exitReason = '';

      if (!isNaN(lastIBS) && lastIBS > highIBS) {
        if (this.options.ibsExitRequireAboveEntry) {
          if (lastBar.close > position.entryPrice) {
            shouldExit = true;
            exitReason = 'ibs_signal';
          }
        } else {
          shouldExit = true;
          exitReason = 'ibs_signal';
        }
      } else {
        const daysDiff = Math.floor((lastBar.date.getTime() - position.entryDate.getTime()) / (1000 * 60 * 60 * 24));
        if (!this.options.ignoreMaxHoldDaysExit && daysDiff >= maxHoldDays) {
          shouldExit = true;
          exitReason = 'max_hold_days';
        } else {
          // Всегда выходим на последнем баре, даже если ignoreMaxHoldDaysExit = true
          shouldExit = true;
          exitReason = 'end_of_data';
        }
      }

      if (shouldExit) {
        const exitPrice = lastBar.close;
        const grossProceeds = position.quantity * exitPrice;
        const grossCost = position.quantity * position.entryPrice;
        const pnl = grossProceeds - grossCost;
        const pnlPercent = (pnl / grossCost) * 100;
        const duration = Math.floor((lastBar.date.getTime() - position.entryDate.getTime()) / (1000 * 60 * 60 * 24));

        const trade: Trade = {
          id: `trade-${this.trades.length}`,
          entryDate: position.entryDate,
          exitDate: lastBar.date,
          entryPrice: position.entryPrice,
          exitPrice: exitPrice,
          quantity: position.quantity,
          pnl: pnl,
          pnlPercent: pnlPercent,
          duration: duration,
          exitReason: exitReason,
          context: {
            marketConditions: 'normal',
            indicatorValues: { IBS: lastIBS },
            volatility: 0,
            trend: 'sideways',
            initialInvestment: grossCost
          }
        };

        this.trades.push(trade);
        this.currentCapital += grossProceeds;
        if (trade.context) {
          (trade.context as any).currentCapitalAfterExit = this.currentCapital;
        }
        position = null;
      }
    }

    // Обновляем последний equity point без дублирования временной метки
    let finalValue = this.currentCapital;
    if (position) {
      // Учитываем комиссию на выход для открытых позиций
      const grossValue = position.quantity * lastBar.close;
      const commission = this.calculateCommission(grossValue);
      finalValue += grossValue - commission;
    }
    const finalPeakValue = this.equity.length > 0 
      ? Math.max(...this.equity.map(e => e.value), finalValue)
      : finalValue;
    const finalDrawdown = finalPeakValue > 0 ? ((finalPeakValue - finalValue) / finalPeakValue) * 100 : 0;
    const lastIdx = this.equity.length - 1;
    if (lastIdx >= 0 && this.equity[lastIdx].date.getTime() === lastBar.date.getTime()) {
      this.equity[lastIdx] = { date: lastBar.date, value: finalValue, drawdown: finalDrawdown };
    } else {
      this.equity.push({ date: lastBar.date, value: finalValue, drawdown: finalDrawdown });
    }



    // Рассчитываем метрики
    const metricsCalculator = new MetricsCalculator(
      this.trades,
      this.equity,
      this.strategy.riskManagement.initialCapital
    );

    const metrics = metricsCalculator.calculateAllMetrics();

    console.log(`✅ Backtest completed: ${this.trades.length} trades, Final capital: $${this.currentCapital.toFixed(2)}`);

    // Generate chart data from OHLC data
    const chartData = this.data.map(bar => ({
      time: bar.date.getTime() / 1000, // Convert to seconds for TradingView
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close
    }));

    return {
      trades: this.trades,
      metrics: metrics,
      equity: this.equity,
      chartData: chartData,
      insights: []
    };
  }
}