import type { Strategy, OHLCData, Trade, EquityPoint } from '../types';

export interface TickerDataWithIndex {
  ticker: string;
  data: OHLCData[];
  ibsValues: number[];
  dateIndexMap: Map<number, number>;
}

export interface PortfolioState {
  freeCapital: number;
  totalInvestedCost: number;
  totalPortfolioValue: number;
}

export interface Position {
  ticker: string;
  entryDate: Date;
  entryPrice: number;
  quantity: number;
  entryIndex: number;
  totalCost: number;
  entryCommission: number;
  entryIBS: number;
}

// Utility functions
export function formatCurrencyCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  } else if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  } else {
    return `$${value.toFixed(2)}`;
  }
}

export function formatCurrencyUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function createDateIndexMap(data: OHLCData[]): Map<number, number> {
  const map = new Map<number, number>();
  data.forEach((bar, index) => {
    map.set(bar.date.getTime(), index);
  });
  return map;
}

export function optimizeTickerData(tickersData: Array<{ticker: string; data: OHLCData[]; ibsValues: number[]}>): TickerDataWithIndex[] {
  return tickersData.map(ticker => ({
    ...ticker,
    dateIndexMap: createDateIndexMap(ticker.data)
  }));
}

export function calculateCommission(tradeValue: number, strategy: Strategy): number {
  const { commission } = strategy.riskManagement;

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

export function getPositionMarketValue(
  position: Position,
  currentPrice: number,
  strategy: Strategy
): { marketValue: number; netValue: number; unrealizedPnL: number } {
  const marketValue = position.quantity * currentPrice;
  const exitCommission = calculateCommission(marketValue, strategy);
  const stockPnL = (currentPrice - position.entryPrice) * position.quantity;
  const unrealizedPnL = stockPnL - exitCommission;
  const netPositionValue = position.totalCost + unrealizedPnL;

  return {
    marketValue,
    netValue: netPositionValue,
    unrealizedPnL
  };
}

export function updatePortfolioState(
  portfolio: PortfolioState,
  position: Position | null,
  tickersData: TickerDataWithIndex[],
  currentDateTime: number,
  strategy: Strategy
): PortfolioState {
  let positionValue = 0;

  if (position) {
    const tickerData = tickersData.find(t => t.ticker === position.ticker);
    if (tickerData) {
      const barIndex = tickerData.dateIndexMap.get(currentDateTime) ?? -1;
      if (barIndex !== -1) {
        const currentPrice = tickerData.data[barIndex].close;
        const { netValue } = getPositionMarketValue(position, currentPrice, strategy);
        positionValue = Math.max(0, netValue);
      } else {
        const lastBar = tickerData.data[tickerData.data.length - 1];
        if (lastBar) {
          const { netValue } = getPositionMarketValue(position, lastBar.close, strategy);
          positionValue = Math.max(0, netValue);
        }
      }
    }
  }

  return {
    freeCapital: portfolio.freeCapital,
    totalInvestedCost: portfolio.totalInvestedCost,
    totalPortfolioValue: portfolio.freeCapital + positionValue
  };
}

interface MonthlyContributionOptions {
  amount: number;
  dayOfMonth?: number;
  startDate?: Date;
}

interface BacktestOptions {
  allowSameDayReentry?: boolean;
  monthlyContribution?: MonthlyContributionOptions | null;
}

export function runSinglePositionBacktest(
  tickersData: TickerDataWithIndex[],
  strategy: Strategy,
  leverage: number = 1,
  options: BacktestOptions = {}
): {
  equity: EquityPoint[];
  finalValue: number;
  maxDrawdown: number;
  trades: Trade[];
  metrics: any;
} {
  const { allowSameDayReentry = false, monthlyContribution } = options;

  const monthlyContributionPlan =
    monthlyContribution && monthlyContribution.amount > 0
      ? {
          amount: monthlyContribution.amount,
          dayOfMonth: Math.min(Math.max(monthlyContribution.dayOfMonth ?? 1, 1), 28),
          startDate: monthlyContribution.startDate ?? null
        }
      : null;

  if (!tickersData || tickersData.length === 0) {
    return {
      equity: [],
      finalValue: 0,
      maxDrawdown: 0,
      trades: [],
      metrics: {}
    };
  }

  // Strategy parameters
  const initialCapital = Number(strategy?.riskManagement?.initialCapital ?? 10000);
  const lowIBS = Number(strategy.parameters?.lowIBS ?? 0.1);
  const highIBS = Number(strategy.parameters?.highIBS ?? 0.75);
  const maxHoldDays = Number(strategy.parameters?.maxHoldDays ?? 30);

  // Portfolio state - single position only
  const portfolio: PortfolioState = {
    freeCapital: initialCapital,
    totalInvestedCost: 0,
    totalPortfolioValue: initialCapital
  };

  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];
  let currentPosition: Position | null = null;
  let totalMonthlyContributions = 0;
  let contributionCount = 0;

  // Create unified timeline from all tickers
  const allDates = new Set<number>();
  tickersData.forEach(({ data }) => {
    data.forEach(bar => allDates.add(bar.date.getTime()));
  });
  const sortedDates = Array.from(allDates).sort((a, b) => a - b);

  const contributionStartTime = monthlyContributionPlan
    ? (monthlyContributionPlan.startDate?.getTime() ?? sortedDates[0])
    : null;
  let lastContributionMonthKey: string | null = null;

  console.log(`🚀 SINGLE POSITION MULTI-TICKER BACKTEST START`);
  console.log(`📊 Initial Capital: ${formatCurrencyCompact(initialCapital)} (${formatCurrencyUSD(initialCapital)})`);
  console.log(`📈 Tickers: ${tickersData.map(t => t.ticker).join(', ')}`);
  console.log(`💰 Position Size: 100% депозита на сделку`);
  console.log(`💹 Leverage: ${leverage.toFixed(1)}:1 (${(leverage * 100).toFixed(0)}%)`);

  // Main loop
  for (let index = 0; index < sortedDates.length; index++) {
    const dateTime = sortedDates[index];
    const currentDate = new Date(dateTime);
    const nextDateTime = index < sortedDates.length - 1 ? sortedDates[index + 1] : null;
    const nextDate = nextDateTime ? new Date(nextDateTime) : null;
    let exitedThisBar = false;

    if (monthlyContributionPlan && contributionStartTime !== null && dateTime >= contributionStartTime) {
      const monthKey = `${currentDate.getUTCFullYear()}-${currentDate.getUTCMonth()}`;
      const isNewMonth = monthKey !== lastContributionMonthKey;
      if (isNewMonth) {
        const targetDay = monthlyContributionPlan.dayOfMonth;
        const isLastTradingDayOfMonth =
          !nextDate ||
          nextDate.getUTCMonth() !== currentDate.getUTCMonth() ||
          nextDate.getUTCFullYear() !== currentDate.getUTCFullYear();
        if (currentDate.getUTCDate() >= targetDay || isLastTradingDayOfMonth) {
          portfolio.freeCapital += monthlyContributionPlan.amount;
          totalMonthlyContributions += monthlyContributionPlan.amount;
          contributionCount += 1;
          lastContributionMonthKey = monthKey;
          console.log(
            `➕ CONTRIBUTION: +${formatCurrencyCompact(monthlyContributionPlan.amount)} on ${currentDate.toISOString().slice(0, 10)}`
          );
        }
      }
    }

    // 1. Update portfolio state for current date
    const updatedPortfolio = updatePortfolioState(portfolio, currentPosition, tickersData, dateTime, strategy);
    Object.assign(portfolio, updatedPortfolio);

    // 2. Process current position (exit)
    if (currentPosition !== null) {
      const tickerData = tickersData.find(t => t.ticker === currentPosition!.ticker);
      if (tickerData) {
        const barIndex = tickerData.dateIndexMap.get(dateTime) ?? -1;
        if (barIndex !== -1) {
          const bar = tickerData.data[barIndex];
          const ibs = tickerData.ibsValues[barIndex];

          const daysSinceEntry = Math.floor((bar.date.getTime() - currentPosition.entryDate.getTime()) / (1000 * 60 * 60 * 24));
          let shouldExit = false;
          let exitReason = '';

          if (ibs > highIBS) {
            shouldExit = true;
            exitReason = 'ibs_signal';
          } else if (daysSinceEntry >= maxHoldDays) {
            shouldExit = true;
            exitReason = 'max_hold_days';
          }

          if (shouldExit) {
            const exitPrice = bar.close;
            const stockProceeds = currentPosition.quantity * exitPrice;
            const exitCommission = calculateCommission(stockProceeds, strategy);
            const netProceeds = stockProceeds - exitCommission;

            const stockValueAtEntry = currentPosition.quantity * currentPosition.entryPrice;
            const totalCommissions = currentPosition.entryCommission + exitCommission;
            const stockPnL = (exitPrice - currentPosition.entryPrice) * currentPosition.quantity;
            const totalPnL = stockPnL - totalCommissions;
            const totalCashInvested = currentPosition.totalCost + currentPosition.entryCommission;
            const pnlPercent = totalCashInvested > 0 ? (totalPnL / totalCashInvested) * 100 : 0;

            // Update portfolio
            const capitalBeforeExit = portfolio.freeCapital;
            portfolio.freeCapital += totalCashInvested + totalPnL;
            portfolio.totalInvestedCost = Math.max(0, portfolio.totalInvestedCost - totalCashInvested);

            // Recalculate total portfolio value after exit
            const updatedPortfolioAfterExit = updatePortfolioState(portfolio, null, tickersData, dateTime, strategy);
            Object.assign(portfolio, updatedPortfolioAfterExit);

            // Create trade
            const trade: Trade = {
              id: `trade-${trades.length}`,
              entryDate: currentPosition.entryDate,
              exitDate: bar.date,
              entryPrice: currentPosition.entryPrice,
              exitPrice: exitPrice,
              quantity: currentPosition.quantity,
              pnl: totalPnL,
              pnlPercent: pnlPercent,
              duration: daysSinceEntry,
              exitReason: exitReason,
              context: {
                ticker: currentPosition.ticker,
                marketConditions: 'normal',
                indicatorValues: { IBS: currentPosition.entryIBS, exitIBS: ibs },
                volatility: 0,
                trend: 'sideways',
                initialInvestment: totalCashInvested,
                grossInvestment: currentPosition.quantity * currentPosition.entryPrice,
                leverage: leverage,
                leverageDebt: stockValueAtEntry - currentPosition.totalCost,
                commissionPaid: totalCommissions,
                netProceeds: netProceeds,
                capitalBeforeExit: capitalBeforeExit,
                currentCapitalAfterExit: portfolio.totalPortfolioValue,
                marginUsed: currentPosition.totalCost
              }
            };

            trades.push(trade);
            currentPosition = null;
            exitedThisBar = true;

            console.log(`🔴 EXIT [${trade.context?.ticker}]: IBS=${ibs.toFixed(3)}, ${exitReason}`);
            console.log(`   💰 P&L=${formatCurrencyCompact(totalPnL)} (${pnlPercent.toFixed(2)}%), Duration=${daysSinceEntry} days`);
            console.log(`   📊 Portfolio: ${formatCurrencyCompact(portfolio.totalPortfolioValue)}`);
          }
        }
      }
    }

    // 3. Look for new entry (only if no open position)
    const canEnterThisBar = !currentPosition && (allowSameDayReentry || !exitedThisBar);

    if (canEnterThisBar) {
      let bestSignal: { tickerIndex: number; ibs: number; bar: OHLCData } | null = null;

      // Find best signal among all tickers
      for (let tickerIndex = 0; tickerIndex < tickersData.length; tickerIndex++) {
        const tickerData = tickersData[tickerIndex];
        const barIndex = tickerData.dateIndexMap.get(dateTime) ?? -1;
        if (barIndex === -1) continue;

        const bar = tickerData.data[barIndex];
        const ibs = tickerData.ibsValues[barIndex];

        // Check entry signal
        if (ibs < lowIBS) {
          // Select signal with lowest IBS (strongest signal)
          if (!bestSignal || ibs < bestSignal.ibs) {
            bestSignal = { tickerIndex, ibs, bar };
          }
        }
      }

      // Open position on best signal
      if (bestSignal) {
        const tickerData = tickersData[bestSignal.tickerIndex];
        const { bar, ibs } = bestSignal;

        // Use 100% of available capital with leverage
        const baseTargetInvestment = portfolio.freeCapital;
        const targetInvestment = baseTargetInvestment * leverage;
        const entryPrice = bar.close;
        const quantity = Math.floor(targetInvestment / entryPrice);

        if (quantity > 0) {
          const stockCost = quantity * entryPrice;
          const entryCommission = calculateCommission(stockCost, strategy);
          const marginRequired = stockCost / leverage;
          const totalCashRequired = marginRequired + entryCommission;

          if (portfolio.freeCapital >= totalCashRequired && totalCashRequired > 0) {
            // Create position
            currentPosition = {
              ticker: tickerData.ticker,
              entryDate: bar.date,
              entryPrice: entryPrice,
              quantity: quantity,
              entryIndex: bestSignal.tickerIndex,
              totalCost: marginRequired,
              entryCommission: entryCommission,
              entryIBS: ibs
            };

            // Update portfolio state
            portfolio.freeCapital -= totalCashRequired;
            portfolio.totalInvestedCost += totalCashRequired;

            console.log(`🟢 ENTRY [${tickerData.ticker}]: IBS=${ibs.toFixed(3)} < ${lowIBS}`);
            console.log(`   💰 Stock Value: ${formatCurrencyCompact(stockCost)} | Margin: ${formatCurrencyCompact(marginRequired)} | Commission: ${formatCurrencyCompact(entryCommission)}`);
            console.log(`   📊 Portfolio: Free=${formatCurrencyCompact(portfolio.freeCapital)} | Invested=${formatCurrencyCompact(portfolio.totalInvestedCost)}`);
            console.log(`   🎯 Leverage: ${leverage.toFixed(1)}:1 | Total Cash Required: ${formatCurrencyCompact(totalCashRequired)}`);
          }
        }
      }
    }

    // Update final portfolio state and equity
    const finalPortfolio = updatePortfolioState(portfolio, currentPosition, tickersData, dateTime, strategy);
    Object.assign(portfolio, finalPortfolio);

    // Calculate drawdown
    const peakValue = equity.length > 0
      ? Math.max(...equity.map(e => e.value), portfolio.totalPortfolioValue)
      : portfolio.totalPortfolioValue;
    const drawdown = peakValue > 0 ? ((peakValue - portfolio.totalPortfolioValue) / peakValue) * 100 : 0;

    equity.push({
      date: currentDate,
      value: portfolio.totalPortfolioValue,
      drawdown: drawdown
    });
  }

  // Close remaining position if any
  if (currentPosition) {
    const tickerData = tickersData.find(t => t.ticker === currentPosition.ticker);
    if (tickerData) {
      const lastBarIndex = tickerData.data.length - 1;
      const lastBar = tickerData.data[lastBarIndex];

      const exitPrice = lastBar.close;
      const stockProceeds = currentPosition.quantity * exitPrice;
      const exitCommission = calculateCommission(stockProceeds, strategy);

      const stockValueAtEntry = currentPosition.quantity * currentPosition.entryPrice;
      const totalCommissions = currentPosition.entryCommission + exitCommission;
      const stockPnL = (exitPrice - currentPosition.entryPrice) * currentPosition.quantity;
      const totalPnL = stockPnL - totalCommissions;
      const totalCashInvested = currentPosition.totalCost + currentPosition.entryCommission;
      const pnlPercent = totalCashInvested > 0 ? (totalPnL / totalCashInvested) * 100 : 0;
      const duration = Math.floor((lastBar.date.getTime() - currentPosition.entryDate.getTime()) / (1000 * 60 * 60 * 24));

      portfolio.freeCapital += totalCashInvested + totalPnL;
      portfolio.totalInvestedCost = Math.max(0, portfolio.totalInvestedCost - totalCashInvested);
      portfolio.totalPortfolioValue = portfolio.freeCapital + portfolio.totalInvestedCost;

      const trade: Trade = {
        id: `trade-${trades.length}`,
        entryDate: currentPosition.entryDate,
        exitDate: lastBar.date,
        entryPrice: currentPosition.entryPrice,
        exitPrice: exitPrice,
        quantity: currentPosition.quantity,
        pnl: totalPnL,
        pnlPercent: pnlPercent,
        duration: duration,
        exitReason: 'end_of_data',
        context: {
          ticker: currentPosition.ticker,
          marketConditions: 'normal',
          indicatorValues: { IBS: currentPosition.entryIBS, exitIBS: tickerData.ibsValues[lastBarIndex] },
          volatility: 0,
          trend: 'sideways',
          initialInvestment: totalCashInvested,
          grossInvestment: currentPosition.quantity * currentPosition.entryPrice,
          leverage: leverage,
          leverageDebt: stockValueAtEntry - currentPosition.totalCost,
          commissionPaid: totalCommissions,
          netProceeds: stockProceeds - exitCommission,
          capitalBeforeExit: portfolio.freeCapital - totalCashInvested - totalPnL,
          currentCapitalAfterExit: portfolio.totalPortfolioValue,
          marginUsed: currentPosition.totalCost
        }
      };

      trades.push(trade);
    }
  }

  // Calculate metrics
  const finalValue = portfolio.totalPortfolioValue;
  const totalReturn = ((finalValue - initialCapital) / initialCapital) * 100;
  const maxDrawdown = equity.length > 0 ? Math.max(...equity.map(e => e.drawdown)) : 0;

  const winningTrades = trades.filter(t => (t.pnl ?? 0) > 0).length;
  const losingTrades = trades.filter(t => (t.pnl ?? 0) < 0).length;
  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;

  // Profit factor
  const grossProfit = trades.filter(t => (t.pnl ?? 0) > 0).reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(trades.filter(t => (t.pnl ?? 0) < 0).reduce((sum, t) => sum + (t.pnl ?? 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

  // CAGR calculation
  const daysDiff = equity.length > 0 ?
    (equity[equity.length - 1].date.getTime() - equity[0].date.getTime()) / (1000 * 60 * 60 * 24) : 1;
  const years = daysDiff / 365.25;
  const cagr = years > 0 ? (Math.pow(finalValue / initialCapital, 1 / years) - 1) * 100 : 0;

  const investedCapital = initialCapital + totalMonthlyContributions;
  const netProfit = finalValue - investedCapital;
  const netReturn = investedCapital > 0 ? (netProfit / investedCapital) * 100 : 0;

  const metrics = {
    totalReturn,
    cagr,
    winRate,
    totalTrades: trades.length,
    winningTrades,
    losingTrades,
    profitFactor,
    netProfit,
    netReturn,
    totalContribution: totalMonthlyContributions,
    contributionCount
  };

  console.log(`✅ SINGLE POSITION BACKTEST COMPLETE`);
  console.log(`📊 Final Value: ${formatCurrencyCompact(finalValue)} (${formatCurrencyUSD(finalValue)})`);
  console.log(`📈 Total Return: ${totalReturn.toFixed(2)}%`);
  console.log(`🎯 Total Trades: ${trades.length}`);

  return {
    equity,
    finalValue,
    maxDrawdown,
    trades,
    metrics
  };
}