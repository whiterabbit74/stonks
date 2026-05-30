import type {
  EmaDeviationPoint,
  EmaZone,
  EmaZoneStrategyParams,
  EquityPoint,
  ExposurePoint,
  MultiTickerBacktestResults,
  OHLCData,
  Trade,
  TradingDate,
} from '../types';
import { calculateBacktestMetrics } from './backtest-statistics';
import { calculateExposurePct, calculateTakeProfitPrice, shouldTakeProfit } from './backtest-execution';
import { IndicatorEngine } from './indicators';
import { toTradingDate } from './date-utils';

interface EmaTickerData {
  ticker: string;
  data: OHLCData[];
  rawData?: OHLCData[];
}

interface PreparedTicker {
  ticker: string;
  data: OHLCData[];
  ema: number[];
  byDate: Map<string, { bar: OHLCData; index: number }>;
  rawByDate: Map<string, OHLCData>;
}

interface EmaLot {
  id: string;
  ticker: string;
  zoneId: string;
  entryDate: TradingDate;
  entryPrice: number;
  entryRawPrice?: number;
  entryEma: number;
  entryDeviationPct: number;
  quantity: number;
  initialQuantity: number;
  marginUsed: number;
  closedSellZoneIds: string[];
  priceBasis: NonNullable<OHLCData['priceBasis']>;
}

export interface EmaZoneBacktestResult extends MultiTickerBacktestResults {
  deviation: EmaDeviationPoint[];
}

function enabledZones(zones: EmaZone[]): EmaZone[] {
  return zones.filter((zone) => zone.enabled && Number.isFinite(zone.levelPct));
}

function calculateDeviation(price: number, ema: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(ema) || ema === 0) return 0;
  return ((price / ema) - 1) * 100;
}

function capitalTolerance(value: number): number {
  return Math.max(1e-8, Math.abs(value) * 1e-10);
}

function getPriceBasisLabel(priceBasis: NonNullable<OHLCData['priceBasis']>): string {
  if (priceBasis === 'holder_value') return 'Индексная цена с учетом сплитов';
  if (priceBasis === 'split_adjusted_index') return 'Split-adjusted индексная цена';
  return 'Реальная цена close';
}

function rawCloseForBar(bar: OHLCData): number | undefined {
  return Number.isFinite(bar.rawClose) ? bar.rawClose : undefined;
}

function rawPriceForExecution(bar: OHLCData, executionPrice: number): number | undefined {
  if (!Number.isFinite(executionPrice)) return undefined;
  if (Number.isFinite(bar.rawClose) && executionPrice === bar.close) return bar.rawClose;
  if (bar.priceBasis === 'holder_value' && Number.isFinite(bar.splitFactor) && (bar.splitFactor ?? 0) > 0) {
    return executionPrice / (bar.splitFactor as number);
  }
  return rawCloseForBar(bar);
}

function prepareTickerData(tickersData: EmaTickerData[], emaPeriod: number): PreparedTicker[] {
  return tickersData
    .map((tickerData) => {
      const rawByDate = new Map<string, OHLCData>();
      (tickerData.rawData ?? []).forEach((bar) => rawByDate.set(bar.date, bar));
      const data = [...tickerData.data]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((bar) => {
          const rawBar = rawByDate.get(bar.date);
          return {
            ...bar,
            rawOpen: bar.rawOpen ?? rawBar?.open,
            rawHigh: bar.rawHigh ?? rawBar?.high,
            rawLow: bar.rawLow ?? rawBar?.low,
            rawClose: bar.rawClose ?? rawBar?.close,
            priceBasis: bar.priceBasis ?? 'raw',
          };
        });
      const closes = data.map((bar) => Number(bar.close));
      const ema = closes.length >= emaPeriod ? IndicatorEngine.calculateEMA(closes, emaPeriod) : [];
      const byDate = new Map<string, { bar: OHLCData; index: number }>();
      data.forEach((bar, index) => byDate.set(bar.date, { bar, index }));
      return { ticker: tickerData.ticker.toUpperCase(), data, ema, byDate, rawByDate };
    })
    .filter((tickerData) => tickerData.data.length > 0);
}

function getSignalPrice(bar: OHLCData, ema: number, levelPct: number, side: 'buy' | 'sell', source: EmaZoneStrategyParams['signalSource']): {
  reached: boolean;
  executionPrice: number;
  deviationPct: number;
  rawExecutionPrice?: number;
} {
  if (source === 'intraday') {
    const probePrice = side === 'buy' ? bar.low : bar.high;
    const deviationPct = calculateDeviation(probePrice, ema);
    const reached = side === 'buy' ? deviationPct <= levelPct : deviationPct >= levelPct;
    const executionPrice = ema * (1 + levelPct / 100);
    return {
      reached,
      executionPrice,
      deviationPct,
      rawExecutionPrice: rawPriceForExecution(bar, executionPrice),
    };
  }

  const deviationPct = calculateDeviation(bar.close, ema);
  return {
    reached: side === 'buy' ? deviationPct <= levelPct : deviationPct >= levelPct,
    executionPrice: bar.close,
    deviationPct,
    rawExecutionPrice: rawPriceForExecution(bar, bar.close),
  };
}

function closeLot({
  lot,
  quantity,
  exitDate,
  exitPrice,
  exitRawPrice,
  exitReason,
  exitDeviationPct,
  zoneId,
  tradeIndex,
}: {
  lot: EmaLot;
  quantity: number;
  exitDate: TradingDate;
  exitPrice: number;
  exitRawPrice?: number;
  exitReason: string;
  exitDeviationPct: number;
  zoneId?: string;
  tradeIndex: number;
}): Trade {
  const pnl = (exitPrice - lot.entryPrice) * quantity;
  const entryShare = quantity / lot.quantity;
  const marginUsed = lot.marginUsed * entryShare;
  const pnlPercent = marginUsed > 0 ? (pnl / marginUsed) * 100 : 0;
  const duration = Math.floor((new Date(exitDate).getTime() - new Date(lot.entryDate).getTime()) / 86400000);

  return {
    id: `ema-trade-${tradeIndex}`,
    entryDate: lot.entryDate,
    exitDate,
    entryPrice: lot.entryPrice,
    exitPrice,
    quantity,
    pnl,
    pnlPercent,
    duration,
    exitReason,
    context: {
      ticker: lot.ticker,
      marketConditions: 'ema-zone',
      indicatorValues: {
        entryEma: lot.entryEma,
        entryDeviationPct: lot.entryDeviationPct,
        exitDeviationPct,
      },
      initialInvestment: marginUsed,
      grossInvestment: lot.entryPrice * quantity,
      marginUsed,
      takeProfit: exitReason === 'take_profit' ? exitPrice : undefined,
      priceBasis: lot.priceBasis,
      priceBasisLabel: getPriceBasisLabel(lot.priceBasis),
      quantityBasis: lot.priceBasis === 'raw' ? 'shares' : 'index_units',
      entryRawClose: lot.entryRawPrice,
      exitRawClose: exitRawPrice,
      entryIndexPrice: lot.entryPrice,
      exitIndexPrice: exitPrice,
      trend: zoneId ?? lot.zoneId,
      volatility: 0,
    },
  };
}

export function calculateEmaDeviationData(tickersData: EmaTickerData[], emaPeriod: number): EmaDeviationPoint[] {
  const prepared = prepareTickerData(tickersData, emaPeriod);
  return prepared.flatMap((tickerData) => tickerData.data.map((bar, index) => {
    const ema = tickerData.ema[index];
    if (!Number.isFinite(ema)) return null;
    return {
      date: bar.date,
      ticker: tickerData.ticker,
      price: bar.close,
      ema,
      deviationPct: calculateDeviation(bar.close, ema),
    };
  }).filter((point): point is EmaDeviationPoint => point !== null));
}

export function runEmaZoneBacktest(
  tickersData: EmaTickerData[],
  params: EmaZoneStrategyParams
): EmaZoneBacktestResult {
  const initialCapital = Number.isFinite(params.initialCapital) && params.initialCapital > 0 ? params.initialCapital : 10000;
  const leverage = Number.isFinite(params.leverage) && params.leverage > 0 ? params.leverage : 1;
  const buyZones = enabledZones(params.buyZones).sort((a, b) => b.levelPct - a.levelPct);
  const sellZones = enabledZones(params.sellZones).sort((a, b) => a.levelPct - b.levelPct);
  const prepared = prepareTickerData(tickersData, Math.max(1, Math.round(params.emaPeriod)));
  const allDates = Array.from(new Set(prepared.flatMap((tickerData) => tickerData.data.map((bar) => bar.date)))).sort();
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];
  const exposure: ExposurePoint[] = [];
  const lots: EmaLot[] = [];
  let cash = initialCapital;
  let peak = initialCapital;

  const deviation = calculateEmaDeviationData(tickersData, Math.max(1, Math.round(params.emaPeriod)));

  const currentPositionValue = (date: string): number => {
    return lots.reduce((sum, lot) => {
      const ticker = prepared.find((item) => item.ticker === lot.ticker);
      const close = ticker?.byDate.get(date)?.bar.close ?? lot.entryPrice;
      return sum + lot.quantity * close;
    }, 0);
  };

  const currentLeverageDebt = (): number => lots.reduce((sum, lot) => {
    const grossEntryValue = lot.entryPrice * lot.quantity;
    return sum + Math.max(0, grossEntryValue - lot.marginUsed);
  }, 0);

  const currentEquityValue = (date: string): number => cash + currentPositionValue(date) - currentLeverageDebt();

  for (const date of allDates) {
    for (const tickerData of prepared) {
      const day = tickerData.byDate.get(date);
      if (!day) continue;

      const { bar, index } = day;
      const ema = tickerData.ema[index];
      if (!Number.isFinite(ema)) continue;

      for (const lot of [...lots].filter((item) => item.ticker === tickerData.ticker)) {
        const takeProfitPrice = calculateTakeProfitPrice(lot.entryPrice, params.takeProfitPercent);
        if (!shouldTakeProfit(bar.high, takeProfitPrice)) continue;

        const capitalBeforeExit = currentEquityValue(date);
        const trade = closeLot({
          lot,
          quantity: lot.quantity,
          exitDate: bar.date,
          exitPrice: takeProfitPrice ?? bar.close,
          exitRawPrice: rawPriceForExecution(bar, takeProfitPrice ?? bar.close),
          exitReason: 'take_profit',
          exitDeviationPct: calculateDeviation(takeProfitPrice ?? bar.close, ema),
          tradeIndex: trades.length,
        });
        trades.push(trade);
        cash += lot.marginUsed + trade.pnl;
        lots.splice(lots.indexOf(lot), 1);
        trade.context = {
          ...trade.context,
          capitalBeforeExit,
          currentCapitalAfterExit: currentEquityValue(date),
        };
      }

      for (const sellZone of sellZones) {
        const signal = getSignalPrice(bar, ema, sellZone.levelPct, 'sell', params.signalSource);
        if (!signal.reached) continue;

        const sellZoneIndex = sellZones.findIndex((zone) => zone.id === sellZone.id);
        const isLastSellZone = sellZoneIndex === sellZones.length - 1;
        const tickerLots = lots.filter((lot) => lot.ticker === tickerData.ticker && !lot.closedSellZoneIds.includes(sellZone.id));

        for (const lot of [...tickerLots]) {
          const baseZoneQuantity = sellZones.length > 1
            ? lot.initialQuantity / sellZones.length
            : lot.quantity;
          const quantityToClose = isLastSellZone ? lot.quantity : Math.min(lot.quantity, baseZoneQuantity);
          if (quantityToClose <= 0) continue;
          if (params.noSellAtLoss && signal.executionPrice < lot.entryPrice) continue;

          const capitalBeforeExit = currentEquityValue(date);
          const trade = closeLot({
            lot,
            quantity: quantityToClose,
            exitDate: bar.date,
            exitPrice: signal.executionPrice,
            exitRawPrice: signal.rawExecutionPrice,
            exitReason: `ema_sell_${sellZone.levelPct}`,
            exitDeviationPct: signal.deviationPct,
            zoneId: sellZone.id,
            tradeIndex: trades.length,
          });
          trades.push(trade);

          const marginShare = lot.marginUsed * (quantityToClose / lot.quantity);
          cash += marginShare + trade.pnl;
          lot.quantity -= quantityToClose;
          lot.marginUsed -= marginShare;
          lot.closedSellZoneIds.push(sellZone.id);
          if (lot.quantity <= 0) {
            lots.splice(lots.indexOf(lot), 1);
          }
          trade.context = {
            ...trade.context,
            capitalBeforeExit,
            currentCapitalAfterExit: currentEquityValue(date),
          };
        }
      }

      const equityBeforeBuys = currentEquityValue(date);

      for (const buyZone of buyZones) {
        if (lots.some((lot) => lot.ticker === tickerData.ticker && lot.zoneId === buyZone.id)) continue;

        const signal = getSignalPrice(bar, ema, buyZone.levelPct, 'buy', params.signalSource);
        if (!signal.reached) continue;

        const grossTarget = equityBeforeBuys * leverage / buyZones.length;
        const targetMargin = grossTarget / leverage;
        if (targetMargin > cash + capitalTolerance(cash)) continue;

        const marginUsed = Math.min(targetMargin, cash);
        const quantity = (marginUsed * leverage) / signal.executionPrice;
        if (quantity <= 0 || marginUsed <= 0) continue;

        cash -= marginUsed;
        lots.push({
          id: `ema-lot-${date}-${tickerData.ticker}-${buyZone.id}`,
          ticker: tickerData.ticker,
          zoneId: buyZone.id,
          entryDate: bar.date,
          entryPrice: signal.executionPrice,
          entryRawPrice: signal.rawExecutionPrice,
          entryEma: ema,
          entryDeviationPct: signal.deviationPct,
          quantity,
          initialQuantity: quantity,
          marginUsed,
          closedSellZoneIds: [],
          priceBasis: bar.priceBasis ?? 'raw',
        });
      }
    }

    const positionValue = currentPositionValue(date);
    const equityValue = currentEquityValue(date);
    peak = Math.max(peak, equityValue);
    const drawdown = peak > 0 ? ((peak - equityValue) / peak) * 100 : 0;
    equity.push({ date: toTradingDate(date), value: equityValue, drawdown });
    exposure.push({
      date: toTradingDate(date),
      equity: equityValue,
      positionValue,
      exposurePct: calculateExposurePct(positionValue, equityValue),
      activePositions: lots.length,
    });
  }

  const lastDate = allDates[allDates.length - 1];
  if (lastDate) {
    for (const lot of [...lots]) {
      const ticker = prepared.find((item) => item.ticker === lot.ticker);
      const lastBar = ticker?.byDate.get(lastDate)?.bar ?? ticker?.data[ticker.data.length - 1];
      if (!lastBar) continue;

      const capitalBeforeExit = currentEquityValue(lastBar.date);
      const trade = closeLot({
        lot,
        quantity: lot.quantity,
        exitDate: lastBar.date,
        exitPrice: lastBar.close,
        exitRawPrice: rawPriceForExecution(lastBar, lastBar.close),
        exitReason: 'end_of_data',
        exitDeviationPct: calculateDeviation(lastBar.close, ticker?.ema[ticker.data.length - 1] ?? lastBar.close),
        tradeIndex: trades.length,
      });
      trades.push(trade);
      cash += lot.marginUsed + trade.pnl;
      lots.splice(lots.indexOf(lot), 1);
      trade.context = {
        ...trade.context,
        capitalBeforeExit,
        currentCapitalAfterExit: currentEquityValue(lastBar.date),
      };
    }
  }

  const finalValue = cash;
  const metrics = calculateBacktestMetrics(trades, equity, initialCapital);

  return {
    equity,
    exposure,
    finalValue,
    maxDrawdown: metrics.maxDrawdown,
    trades,
    metrics,
    deviation,
  };
}
