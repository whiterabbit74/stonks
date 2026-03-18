// Core data models for the simplified trading backtester

// TradingDate is a string in 'YYYY-MM-DD' format representing a NYSE trading day
// Re-exported from date-utils for convenience
export type { TradingDate } from '../lib/date-utils';
import type { TradingDate } from '../lib/date-utils';

export interface OHLCData {
  date: TradingDate;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose?: number;
  volume: number;
}

export interface SplitEvent {
  date: string; // ISO YYYY-MM-DD
  factor: number; // коэффициент сплита, например 2 для 2:1
}

export interface TickerData {
  ticker: string;
  data: OHLCData[];
  ibsValues: number[];
  splits: SplitEvent[];
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  type?: string;
  parameters: StrategyParameters;
  entryConditions: IndicatorCondition[];
  exitConditions: IndicatorCondition[];
  riskManagement: RiskManagement;
  positionSizing: {
    type: 'fixed' | 'percentage' | 'risk_based';
    value: number;
  };
}

export interface IndicatorCondition {
  type: 'indicator';
  indicator: IndicatorType;
  operator: '>' | '<' | '>=' | '<=' | '==' | 'crossover' | 'crossunder';
  value: number | IndicatorType;
  period?: number;
  lookback?: number;
}

export interface PriceCondition {
  type: 'price';
  operator: '>' | '<' | '>=' | '<=' | '==';
  value: number | 'dynamic';
}

export interface TimeCondition {
  type: 'time';
  operator: '>' | '<' | '>=' | '<=' | '==';
  value: number;
}

export type Condition = IndicatorCondition | PriceCondition | TimeCondition;

export interface RiskManagement {
  initialCapital: number;
  capitalUsage: number; // Процент использования депозита (0-100)
  leverage?: number; // Торговое плечо (1 = без плеча, 2 = 2:1, ит.д.)
  maxPositionSize?: number;
  // Проценты (0-10). Интерпретируются как X% от цены входа
  stopLoss?: number;
  takeProfit?: number;
  // Флаги включения/выключения SL/TP
  useStopLoss?: boolean;
  useTakeProfit?: boolean;
  positionSize?: number;
  maxPositions?: number;
  maxHoldDays?: number;
  commission: {
    type: 'fixed' | 'percentage' | 'combined';
    fixed?: number;
    percentage?: number;
  };
  slippage: number;
}

export interface StrategyParameters {
  [key: string]: number | string | boolean;
}

/**
 * Specific parameters for IBS (Internal Bar Strength) trading strategy
 */
export interface IBSStrategyParameters extends StrategyParameters {
  /** IBS threshold below which to enter positions (0-1) */
  lowIBS: number;
  /** IBS threshold above which to exit positions (0-1) */
  highIBS: number;
  /** Maximum days to hold a position */
  maxHoldDays: number;
}

// Normalized OHLC chart candle for serialization
export interface ChartCandle {
  time: number; // epoch seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface InsightItem {
  type: string;
  message: string;
  [key: string]: unknown;
}

export interface BacktestResult {
  trades: Trade[];
  metrics: PerformanceMetrics;
  equity: EquityPoint[];
  chartData?: ChartCandle[];
  insights?: InsightItem[];
  // Optional metadata that some views read from
  symbol?: string;
  ticker?: string;
  meta?: { ticker?: string };
}

export interface SavedDataset {
  id?: string; // optional server id
  name: string;
  ticker: string;
  data: OHLCData[];
  splits?: SplitEvent[];
  adjustedForSplits?: boolean;
  uploadDate: string;
  dataPoints: number;
  dateRange: {
    from: string;
    to: string;
  };
  tag?: string;
  companyName?: string;
}

export interface Trade {
  id: string;
  entryDate: TradingDate;
  exitDate: TradingDate;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  duration: number;
  exitReason: string;
  context?: {
    ticker?: string;
    marketConditions?: string;
    indicatorValues?: Record<string, number>;
    volatility?: number;
    trend?: string;
    // Additional calculation details for transparency
    grossProceeds?: number;
    grossCost?: number;
    totalCommissions?: number;
    commissionPaid?: number;
    currentCapitalAfterExit?: number;
    capitalBeforeExit?: number;
    initialInvestment?: number;
    grossInvestment?: number;
    leverage?: number;
    leverageDebt?: number;
    netProceeds?: number;
    marginUsed?: number;
    marginTriggerType?: string;
    maintenanceMarginPct?: number;
    marginRatioAtTrigger?: number;
    stopLoss?: number;
    takeProfit?: number;
  };
}

export interface PerformanceMetrics {
  totalReturn: number;
  cagr: number;
  maxDrawdown: number;
  winRate: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  beta: number;
  alpha: number;
  recoveryFactor: number;
  skewness: number;
  kurtosis: number;
  valueAtRisk: number;
  totalTrades?: number;
}

export interface EquityPoint {
  date: TradingDate;
  value: number;
  drawdown: number;
}

// Simple enums for the basic functionality
export const IndicatorType = {
  SMA: 'SMA',
  EMA: 'EMA',
  RSI: 'RSI',
  MACD: 'MACD',
  BB: 'BB',
  STOCH: 'STOCH',
  IBS: 'IBS'
} as const;

export interface MonitorTradeRecord {
  id: string;
  symbol: string;
  status: 'open' | 'closed';
  entryDate: string | null;
  exitDate: string | null;
  entryPrice: number | null;
  exitPrice: number | null;
  entryIBS: number | null;
  exitIBS: number | null;
  entryDecisionTime: string | null;
  exitDecisionTime: string | null;
  pnlPercent: number | null;
  pnlAbsolute: number | null;
  holdingDays: number | null;
}

export interface MonitorTradeHistoryResponse {
  trades: MonitorTradeRecord[];
  openTrade: MonitorTradeRecord | null;
  total: number;
  lastUpdated: string | null;
}

export interface WebullDashboardResponse {
  connection: {
    configured: boolean;
    hasAccessToken: boolean;
    hasAccountId: boolean;
    host: string;
    protocol: string;
    port: string | null;
  };
  accounts: unknown;
  balance: unknown;
  positions: unknown;
  openOrders: unknown;
  orderHistory: unknown;
  fetchedAt: string | null;
}

export interface AutoTradingConfig {
  enabled: boolean;
  provider: string;
  lowIBS: number;
  highIBS: number;
  executionWindowSeconds: number;
  allowNewEntries: boolean;
  allowExits: boolean;
  onlyFromTelegramWatches: boolean;
  symbols: string;
  entrySizingMode: string;
  sizingMode: string;
  fixedQuantity: number;
  fixedNotionalUsd: number;
  maxPositionUsd: number;
  allowFractionalShares: boolean;
  orderType: string;
  timeInForce: string;
  supportTradingSession: string;
  maxSlippageBps: number;
  previewBeforeSend: boolean;
  cancelOpenOrdersBeforeEntry: boolean;
  notes: string;
  lastModifiedAt: string | null;
}

export interface AutoTradeState {
  lastSchedulerAttemptKey: string | null;
  lastRunAt: string | null;
  lastResult: unknown;
}

export interface AutotradeConfigResponse {
  config: AutoTradingConfig;
  webull: WebullDashboardResponse['connection'];
  state: AutoTradeState;
}

export interface AutotradeStatusResponse {
  evaluation: unknown;
  webull: WebullDashboardResponse['connection'];
  state: AutoTradeState;
}

export interface AutotradeLogsResponse {
  fetchedAt: string | null;
  autotrade: string[];
  monitor: string[];
  pending?: Array<{
    clientOrderId: string;
    symbol: string;
    action: string;
    status: string;
    quantity?: number | null;
    startedAt?: string | null;
    lastCheckedAt?: string | null;
    fillPrice?: number | null;
    filledQty?: number | null;
    source?: string | null;
  }>;
  recent?: Array<{
    clientOrderId: string;
    symbol: string;
    action: string;
    status: string;
    quantity?: number | null;
    startedAt?: string | null;
    lastCheckedAt?: string | null;
    fillPrice?: number | null;
    filledQty?: number | null;
    source?: string | null;
  }>;
}

export interface CloseWebullPositionResponse {
  success: boolean;
  clientOrderId: string | null;
  result: {
    clientOrderId?: string | null;
    submitted?: boolean;
    simulated?: boolean;
    error?: string | null;
    order?: {
      client_order_id?: string | null;
    } | null;
  };
}

export interface WebullTestBuyResponse {
  success: boolean;
  clientOrderId: string | null;
  result: {
    clientOrderId?: string | null;
    submitted?: boolean;
    simulated?: boolean;
    error?: string | null;
    order?: {
      client_order_id?: string | null;
    } | null;
  };
}

export type IndicatorType = typeof IndicatorType[keyof typeof IndicatorType];

// Simple utility types
export type DataStatus = 'idle' | 'loading' | 'ready' | 'error';
export type BacktestStatus = 'idle' | 'running' | 'complete' | 'error';

// Simple validation types
export interface ValidationResult {
  isValid: boolean;
  errors: string[] | Array<{ code: string; message: string; row?: number }>;
}
