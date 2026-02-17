import type { MonitorTradeRecord } from '../types';

export interface MonitorTradeMetrics {
  initialCapital: number;
  finalBalance: number;
  netProfit: number;
  totalReturnPct: number;
  sumReturnPct: number;
  avgReturnPct: number;
  avgHoldingDays: number;
  maxDrawdownPct: number;
  winRatePct: number;
  winCount: number;
  lossCount: number;
  closedTradesCount: number;
  profitFactor: number;
  grossProfitPct: number;
  grossLossPct: number;
}

function safeNumber(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

function getTradeSortKey(trade: MonitorTradeRecord): string {
  return trade.exitDecisionTime || trade.exitDate || trade.entryDecisionTime || trade.entryDate || '';
}

function parseDateMs(value: string | null): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const ts = Date.parse(normalized);
  return Number.isFinite(ts) ? ts : null;
}

function getHoldingDays(trade: MonitorTradeRecord): number | null {
  const holdingDays = safeNumber(trade.holdingDays);
  if (holdingDays != null && holdingDays >= 0) return holdingDays;

  const entryTs = parseDateMs(trade.entryDate);
  const exitTs = parseDateMs(trade.exitDate);
  if (entryTs == null || exitTs == null || exitTs < entryTs) return null;

  return (exitTs - entryTs) / (1000 * 60 * 60 * 24);
}

export function calculateMonitorTradeMetrics(
  trades: MonitorTradeRecord[],
  initialCapital = 10000
): MonitorTradeMetrics {
  const normalizedInitial = Number.isFinite(initialCapital) && initialCapital > 0 ? initialCapital : 10000;

  const closedTrades = trades
    .filter((trade) => trade.status === 'closed' && safeNumber(trade.pnlPercent) !== null)
    .slice()
    .sort((a, b) => getTradeSortKey(a).localeCompare(getTradeSortKey(b)));

  if (closedTrades.length === 0) {
    return {
      initialCapital: normalizedInitial,
      finalBalance: normalizedInitial,
      netProfit: 0,
      totalReturnPct: 0,
      sumReturnPct: 0,
      avgReturnPct: 0,
      avgHoldingDays: 0,
      maxDrawdownPct: 0,
      winRatePct: 0,
      winCount: 0,
      lossCount: 0,
      closedTradesCount: 0,
      profitFactor: 0,
      grossProfitPct: 0,
      grossLossPct: 0,
    };
  }

  let balance = normalizedInitial;
  let peak = normalizedInitial;
  let maxDrawdownPct = 0;
  let sumReturnPct = 0;
  let winCount = 0;
  let lossCount = 0;
  let grossProfitPct = 0;
  let grossLossPct = 0;
  let totalHoldingDays = 0;
  let holdingDaysCount = 0;

  for (const trade of closedTrades) {
    const pct = safeNumber(trade.pnlPercent) ?? 0;
    const factor = 1 + pct / 100;
    balance *= factor;
    sumReturnPct += pct;

    if (pct > 0) {
      winCount += 1;
      grossProfitPct += pct;
    } else {
      lossCount += 1;
      grossLossPct += Math.abs(pct);
    }

    if (balance > peak) peak = balance;
    const drawdownPct = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
    if (drawdownPct > maxDrawdownPct) maxDrawdownPct = drawdownPct;

    const holdingDays = getHoldingDays(trade);
    if (holdingDays != null) {
      totalHoldingDays += holdingDays;
      holdingDaysCount += 1;
    }
  }

  const closedTradesCount = closedTrades.length;
  const totalReturnPct = normalizedInitial > 0 ? ((balance - normalizedInitial) / normalizedInitial) * 100 : 0;
  const avgReturnPct = closedTradesCount > 0 ? sumReturnPct / closedTradesCount : 0;
  const avgHoldingDays = holdingDaysCount > 0 ? totalHoldingDays / holdingDaysCount : 0;
  const winRatePct = closedTradesCount > 0 ? (winCount / closedTradesCount) * 100 : 0;
  const profitFactor = grossLossPct > 0
    ? grossProfitPct / grossLossPct
    : (grossProfitPct > 0 ? Number.POSITIVE_INFINITY : 0);

  return {
    initialCapital: normalizedInitial,
    finalBalance: balance,
    netProfit: balance - normalizedInitial,
    totalReturnPct,
    sumReturnPct,
    avgReturnPct,
    avgHoldingDays,
    maxDrawdownPct,
    winRatePct,
    winCount,
    lossCount,
    closedTradesCount,
    profitFactor,
    grossProfitPct,
    grossLossPct,
  };
}
