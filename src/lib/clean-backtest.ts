import type { OHLCData, Strategy, BacktestResult, Trade, EquityPoint } from '../types';
import { IndicatorEngine } from './indicators';
import { MetricsCalculator } from './metrics';

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

  constructor(data: OHLCData[], strategy: Strategy) {
    this.data = data;
    this.strategy = strategy;
    this.currentCapital = strategy.riskManagement.initialCapital;
    
    // Рассчитываем IBS для всех баров (без исключений на пустых данных)
    this.ibsValues = data && data.length > 0 ? IndicatorEngine.calculateIBS(data) : [];
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

    const lowIBS = this.strategy.parameters.lowIBS || 0.1;
    const highIBS = this.strategy.parameters.highIBS || 0.75;
    const maxHoldDays = this.strategy.parameters.maxHoldDays || 30;
    const capitalUsage = this.strategy.riskManagement.capitalUsage || 100;

    // Проходим по всем барам (кроме последнего, так как нужен следующий день для входа)
    for (let i = 0; i < this.data.length - 1; i++) {
      const bar = this.data[i];
      const nextBar = this.data[i + 1];
      const ibs = this.ibsValues[i];

      if (isNaN(ibs)) continue; // Пропускаем невалидные IBS

      // Если нет позиции - проверяем вход
      if (!position) {
        if (ibs < lowIBS) {
          // СИГНАЛ ВХОДА: IBS текущего дня < lowIBS
          // ПОКУПКА: по цене открытия следующего дня
          const investmentAmount = (this.currentCapital * capitalUsage) / 100;
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
            console.log(`🟢 ENTRY EXECUTION: bought ${quantity} shares at $${nextBar.open.toFixed(2)} on ${nextBar.date.toISOString().split('T')[0]}`);
          }
        }
      } 
      // Если есть позиция - проверяем выход (только если это не день входа)
      else if (i + 1 > position.entryIndex) {
        let shouldExit = false;
        let exitReason = '';

        // Проверяем IBS условие выхода
        if (ibs > highIBS) {
          shouldExit = true;
          exitReason = 'ibs_signal';
        }
        // Проверяем максимальное время удержания
        else {
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
              initialInvestment: grossCost,
              currentCapitalAfterExit: 0 // Обновим ниже
            }
          };

          this.trades.push(trade);
          this.currentCapital += grossProceeds;
          
          // Обновляем капитал в контексте сделки
          trade.context!.currentCapitalAfterExit = this.currentCapital;

          console.log(`🔴 EXIT: IBS=${ibs.toFixed(3)}, ${exitReason}, P&L=$${pnl.toFixed(2)}, Duration=${duration} days`);
          
          position = null;
        }
      }

      // Обновляем equity curve
      let totalValue = this.currentCapital;
      if (position) {
        totalValue += position.quantity * bar.close;
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
        shouldExit = true;
        exitReason = 'ibs_signal';
      } else {
        const daysDiff = Math.floor((lastBar.date.getTime() - position.entryDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff >= maxHoldDays) {
          shouldExit = true;
          exitReason = 'max_hold_days';
        } else {
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
            initialInvestment: grossCost,
            currentCapitalAfterExit: this.currentCapital + grossProceeds
          }
        };

        this.trades.push(trade);
        this.currentCapital += grossProceeds;
        position = null;
      }
    }

    // Добавляем последний equity point
    let finalValue = this.currentCapital;
    if (position) {
      finalValue += position.quantity * lastBar.close;
    }

    const finalPeakValue = this.equity.length > 0 
      ? Math.max(...this.equity.map(e => e.value), finalValue)
      : finalValue;
    const finalDrawdown = finalPeakValue > 0 ? ((finalPeakValue - finalValue) / finalPeakValue) * 100 : 0;

    this.equity.push({
      date: lastBar.date,
      value: finalValue,
      drawdown: finalDrawdown
    });



    // Рассчитываем метрики
    const metricsCalculator = new MetricsCalculator(
      this.trades,
      this.equity,
      this.strategy.riskManagement.initialCapital
    );

    const metrics = metricsCalculator.calculateAllMetrics();

    console.log(`✅ Backtest completed: ${this.trades.length} trades, Final capital: $${this.currentCapital.toFixed(2)}`);

    return {
      trades: this.trades,
      metrics: metrics,
      equity: this.equity,
      chartData: [],
      insights: []
    };
  }
}