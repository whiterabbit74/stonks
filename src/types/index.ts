// Core data models for the simplified trading backtester
export interface OHLCData {
  date: Date;
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
  entryDate: Date;
  exitDate: Date;
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
    currentCapitalAfterExit?: number;
    initialInvestment?: number;
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
  date: Date;
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

export type IndicatorType = typeof IndicatorType[keyof typeof IndicatorType];

// Simple utility types
export type DataStatus = 'idle' | 'loading' | 'ready' | 'error';
export type BacktestStatus = 'idle' | 'running' | 'complete' | 'error';

// Simple validation types
export interface ValidationResult {
  isValid: boolean;
  errors: string[] | Array<{ code: string; message: string; row?: number }>;
}