import type { EquityPoint, OHLCData, Trade } from '../types';
import { daysBetweenTradingDates } from './date-utils';

export type PositionRiskTrigger = 'maintenance_margin';

export interface PositionRiskEvent {
  type: PositionRiskTrigger;
  date: string;
  tradeId: string;
  triggerPrice: number;
  barLow: number;
  remainingCapital: number;
  thresholdPct: number;
  positionDropPct: number;
  marginRatioAtTrigger: number;
}

export interface MarginSimulationByTradesResult {
  equity: EquityPoint[];
  trades: Trade[];
  maxDrawdown: number;
  finalValue: number;
  maintenanceLiquidationEvents: PositionRiskEvent[];
  liquidationEvent: PositionRiskEvent | null;
}

interface ActivePosition {
  template: Trade;
  entryDate: string;
  entryPrice: number;
  quantity: number;
  marginUsed: number;
  borrowed: number;
  plannedExitDate: string;
}

interface SimulateMarginByTradesParams {
  marketData: OHLCData[];
  trades: Trade[];
  initialCapital: number;
  leverage: number;
  maintenanceMarginPct?: number;
  capitalUsagePct?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function simulateMarginByTrades({
  marketData,
  trades,
  initialCapital,
  leverage,
  maintenanceMarginPct = 25,
  capitalUsagePct = 100,
}: SimulateMarginByTradesParams): MarginSimulationByTradesResult {
  if (!Array.isArray(marketData) || marketData.length === 0 || leverage <= 0) {
    return {
      equity: [],
      trades: [],
      maxDrawdown: 0,
      finalValue: Math.max(0, initialCapital || 0),
      maintenanceLiquidationEvents: [],
      liquidationEvent: null,
    };
  }

  const sortedBars = marketData.slice().sort((a, b) => a.date.localeCompare(b.date));
  const sortedTrades = (trades || []).slice().sort((a, b) => {
    if (a.entryDate !== b.entryDate) return a.entryDate.localeCompare(b.entryDate);
    return a.exitDate.localeCompare(b.exitDate);
  });

  const usage = clamp(capitalUsagePct, 0, 100) / 100;
  const maintenanceThreshold = clamp(maintenanceMarginPct, 1, 95);
  const maintenanceFraction = maintenanceThreshold / 100;

  let cash = Math.max(0, initialCapital || 0);
  let peakValue = cash;
  let tradeIndex = 0;
  let position: ActivePosition | null = null;
  let liquidationEvent: PositionRiskEvent | null = null;

  const equity: EquityPoint[] = [];
  const simulatedTrades: Trade[] = [];
  const maintenanceLiquidationEvents: PositionRiskEvent[] = [];

  for (const bar of sortedBars) {
    const currentDate = bar.date;

    if (!position) {
      while (tradeIndex < sortedTrades.length && sortedTrades[tradeIndex].entryDate < currentDate) {
        tradeIndex += 1;
      }

      if (tradeIndex < sortedTrades.length && sortedTrades[tradeIndex].entryDate === currentDate) {
        const template = sortedTrades[tradeIndex];
        tradeIndex += 1;

        const marginBudget = cash * usage;
        const desiredNotional = marginBudget * leverage;
        const quantity = Math.floor(desiredNotional / template.entryPrice);

        if (quantity > 0) {
          const notionalAtEntry = quantity * template.entryPrice;
          const marginUsed = notionalAtEntry / leverage;
          const borrowed = notionalAtEntry - marginUsed;

          cash -= marginUsed;
          position = {
            template,
            entryDate: template.entryDate,
            entryPrice: template.entryPrice,
            quantity,
            marginUsed,
            borrowed,
            plannedExitDate: template.exitDate,
          };
        }
      }
    }

    let totalValue = cash;

    if (position) {
      const canLiquidate = currentDate > position.entryDate;
      const maintenanceDenominator = position.quantity * (1 - maintenanceFraction);
      const maintenancePriceRaw = maintenanceDenominator > 0
        ? position.borrowed / maintenanceDenominator
        : Number.POSITIVE_INFINITY;
      const maintenancePrice = Math.min(position.entryPrice, Math.max(0, maintenancePriceRaw));

      const hitMaintenance = canLiquidate && bar.low <= maintenancePrice;

      if (hitMaintenance) {
        const triggerType: PositionRiskTrigger = 'maintenance_margin';
        const triggerPrice = maintenancePrice;
        const thresholdPct = maintenanceThreshold;
        const forcedExitPrice = Math.max(0, triggerPrice);
        const proceeds = position.quantity * forcedExitPrice;
        const positionEquityAtExit = Math.max(0, proceeds - position.borrowed);
        const marginRatioAtTrigger = proceeds > 0
          ? Math.max(0, Math.min(1, positionEquityAtExit / proceeds))
          : 0;
        const positionDropPct = position.entryPrice > 0
          ? ((position.entryPrice - forcedExitPrice) / position.entryPrice) * 100
          : 0;

        cash += positionEquityAtExit;

        const pnl = positionEquityAtExit - position.marginUsed;
        const pnlPercent = position.marginUsed > 0 ? (pnl / position.marginUsed) * 100 : 0;
        const duration = daysBetweenTradingDates(position.entryDate, currentDate);

        simulatedTrades.push({
          ...position.template,
          quantity: position.quantity,
          exitDate: currentDate,
          exitPrice: forcedExitPrice,
          pnl,
          pnlPercent,
          duration,
          exitReason: 'margin_liquidation',
          context: {
            ...(position.template.context || {}),
            leverage,
            marginUsed: position.marginUsed,
            leverageDebt: position.borrowed,
            grossInvestment: position.quantity * position.entryPrice,
            currentCapitalAfterExit: cash,
            marginTriggerType: triggerType,
            maintenanceMarginPct: maintenanceThreshold,
            marginRatioAtTrigger,
          },
        });

        totalValue = cash;
        const event: PositionRiskEvent = {
          type: triggerType,
          date: currentDate,
          tradeId: position.template.id,
          triggerPrice,
          barLow: bar.low,
          remainingCapital: cash,
          thresholdPct,
          positionDropPct,
          marginRatioAtTrigger,
        };

        liquidationEvent = event;
        maintenanceLiquidationEvents.push(event);

        position = null;
      } else if (currentDate === position.plannedExitDate) {
        const plannedExitPrice = position.template.exitPrice;
        const proceeds = position.quantity * plannedExitPrice;
        const positionEquityAtExit = Math.max(0, proceeds - position.borrowed);
        cash += positionEquityAtExit;

        const pnl = positionEquityAtExit - position.marginUsed;
        const pnlPercent = position.marginUsed > 0 ? (pnl / position.marginUsed) * 100 : 0;
        const duration = daysBetweenTradingDates(position.entryDate, currentDate);

        simulatedTrades.push({
          ...position.template,
          quantity: position.quantity,
          pnl,
          pnlPercent,
          duration,
          context: {
            ...(position.template.context || {}),
            leverage,
            marginUsed: position.marginUsed,
            leverageDebt: position.borrowed,
            grossInvestment: position.quantity * position.entryPrice,
            currentCapitalAfterExit: cash,
          },
        });

        position = null;
        totalValue = cash;
      } else {
        const notionalAtClose = position.quantity * bar.close;
        const positionEquityAtClose = Math.max(0, notionalAtClose - position.borrowed);
        totalValue = cash + positionEquityAtClose;
      }
    }

    peakValue = Math.max(peakValue, totalValue);
    const drawdown = peakValue > 0 ? ((peakValue - totalValue) / peakValue) * 100 : 0;
    equity.push({
      date: currentDate,
      value: totalValue,
      drawdown,
    });
  }

  const finalValue = equity[equity.length - 1]?.value ?? cash;
  const maxDrawdown = equity.reduce((max, point) => Math.max(max, point.drawdown), 0);

  return {
    equity,
    trades: simulatedTrades,
    maxDrawdown,
    finalValue,
    maintenanceLiquidationEvents,
    liquidationEvent,
  };
}
