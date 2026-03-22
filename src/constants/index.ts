/**
 * Application-wide constants for configuration and defaults
 */

/** Default values for IBS strategy parameters */
export const DEFAULT_IBS_PARAMS = {
  lowIBS: 0.1,
  highIBS: 0.75,
  maxHoldDays: 30,
} as const;

/** Default risk management settings */
export const DEFAULT_RISK_MANAGEMENT = {
  initialCapital: 10000,
  maxHoldDays: 30,
  slippage: 0,
  commission: {
    type: 'percentage' as const,
    percentage: 0.1,
    fixed: 1,
  },
} as const;

/** UI Configuration */
export const UI_CONSTANTS = {
  /** Maximum number of events in error console */
  MAX_ERROR_EVENTS: 500,
  /** Default chart indicator pane percentage */
  DEFAULT_INDICATOR_PANE_PERCENT: 10,
  /** Default watch threshold percentage */
  DEFAULT_WATCH_THRESHOLD_PCT: 5,
  /** Debounce delay for search inputs (ms) */
  SEARCH_DEBOUNCE_DELAY: 300,
  /** Chart resize debounce delay (ms) */
  CHART_RESIZE_DEBOUNCE: 150,
} as const;

/** Trading hours configuration */
export const TRADING_HOURS = {
  /** Market open time in ET (24h format) */
  MARKET_OPEN_ET: 9.5, // 9:30 AM
  /** Market close time in ET (24h format) */
  MARKET_CLOSE_ET: 16, // 4:00 PM
  /** Trading days (Monday = 1, Friday = 5) */
  TRADING_DAYS: [1, 2, 3, 4, 5] as const,
} as const;

/** Performance optimization constants */
export const PERFORMANCE = {
  /** Batch size for large dataset processing */
  BATCH_SIZE: 1000,
  /** Throttle limit for frequent operations (ms) */
  THROTTLE_LIMIT: 100,
  /** Maximum equity points to render in charts */
  MAX_CHART_POINTS: 5000,
} as const;

/** localStorage key names — single source of truth for all persisted UI state */
export const LS = {
  // Shared between stocks and options pages
  TICKERS:                    'stocks.tickers',

  // Stocks page (MultiTickerPage)
  STOCKS_CHART_KIND:          'stocks.heroChartKind',
  STOCKS_SHOW_TRADES:         'stocks.heroShowTrades',
  STOCKS_RANGE:               'stocks.heroRange',
  STOCKS_SELECTED_TICKER:     'stocks.selectedChartTicker',

  // Options page (MultiTickerOptionsPage)
  OPTIONS_CHART_KIND:         'options.heroChartKind',
  OPTIONS_SHOW_TRADES:        'options.heroShowTrades',
  OPTIONS_RANGE:              'options.heroRange',
  OPTIONS_SELECTED_TICKER:    'options.selectedChartTicker',
  OPTIONS_SETTINGS:           'optionsPageSettings',

  // Single ticker results page
  RESULTS_MARGIN_PCT:         'results.marginPercent',
  RESULTS_MAINTENANCE_MARGIN: 'results.maintenanceMarginPct',

  // BuyAtClose simulator
  BUY_AT_CLOSE_MARGIN_PCT:    'buyAtClose.marginPct',

  // TradingChart
  CHART_PREFS:                'chart-prefs',

  // TelegramWatches
  MONITOR_MARGIN_PCT:         'monitor.marginPercent',

  // Theme
  THEME:                      'theme',
} as const;

/** Validation limits */
export const VALIDATION_LIMITS = {
  /** Minimum IBS value */
  MIN_IBS: 0,
  /** Maximum IBS value */
  MAX_IBS: 1,
  /** Minimum hold days */
  MIN_HOLD_DAYS: 1,
  /** Maximum hold days */
  MAX_HOLD_DAYS: 365,
  /** Maximum leverage multiplier */
  MAX_LEVERAGE: 10,
  /** Minimum initial capital */
  MIN_INITIAL_CAPITAL: 1000,
} as const;