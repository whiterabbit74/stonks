import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HelpCircle, Settings2, RefreshCcw, ArrowUpRight } from 'lucide-react';
import { MetricsGrid, AnalysisTabs, PageHeader, Select, Button, TickerInput, ChartContainer } from './ui';
import { useAppStore } from '../stores';
import type { Strategy, Trade, EquityPoint } from '../types';
import { runSinglePositionBacktest, optimizeTickerData } from '../lib/singlePositionBacktest';
import { StrategyInfoCard } from './StrategyInfoCard';
import { MonthlyContributionAnalysis } from './MonthlyContributionAnalysis';
import type { BacktestMetrics } from '../lib/backtest-statistics';
import { createStrategyFromTemplate, STRATEGY_TEMPLATES } from '../lib/strategy';
import { useMultiTickerData } from '../hooks/useMultiTickerData';
import { BacktestPageShell } from './BacktestPageShell';
import { scheduleIdleTask } from '../lib/prefetch';
import { HeroLineChart } from './HeroLineChart';
import { AnimatedPrice } from './AnimatedPrice';
import { DatasetAPI } from '../lib/api';
import { isSameDay } from '../lib/date-utils';

const importBacktestResultsView = () => import('./BacktestResultsView');
const importTradingChart = () => import('./TradingChart');
const importBuyAtCloseSimulator = () => import('./BuyAtCloseSimulator');
const importBuyAtClose4Simulator = () => import('./BuyAtClose4Simulator');
const importNoStopLossSimulator = () => import('./NoStopLossSimulator');
const importOptionsAnalysis = () => import('./OptionsAnalysis');
const importOpenDayDrawdownChart = () => import('./OpenDayDrawdownChart');
const importBuyHoldAnalysis = () => import('./BuyHoldAnalysis');

const BacktestResultsView = lazy(() => importBacktestResultsView().then((m) => ({ default: m.BacktestResultsView })));
const TradingChart = lazy(() => importTradingChart().then((m) => ({ default: m.TradingChart })));
const BuyAtCloseSimulator = lazy(() => importBuyAtCloseSimulator().then((m) => ({ default: m.BuyAtCloseSimulator })));
const BuyAtClose4Simulator = lazy(() => importBuyAtClose4Simulator().then((m) => ({ default: m.BuyAtClose4Simulator })));
const NoStopLossSimulator = lazy(() => importNoStopLossSimulator().then((m) => ({ default: m.NoStopLossSimulator })));
const OptionsAnalysis = lazy(() => importOptionsAnalysis().then((m) => ({ default: m.OptionsAnalysis })));
const OpenDayDrawdownChart = lazy(() => importOpenDayDrawdownChart().then((m) => ({ default: m.OpenDayDrawdownChart })));
const BuyHoldAnalysis = lazy(() => importBuyHoldAnalysis().then((m) => ({ default: m.BuyHoldAnalysis })));

interface BacktestResults {
  equity: EquityPoint[];
  finalValue: number;
  maxDrawdown: number;
  trades: Trade[];
  metrics: BacktestMetrics;
}

type ChartQuote = { open: number | null; high: number | null; low: number | null; current: number | null; prevClose: number | null };

function ResultsPanelLoader() {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
      Загрузка аналитики...
    </div>
  );
}

function getIsMarketOpen(): boolean {
  const now = new Date();
  const day = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long' });
  const t = now.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' });
  const [h, m] = t.split(':').map(Number);
  const mins = h * 60 + m;
  return !['Saturday', 'Sunday'].includes(day) && mins >= 9 * 60 + 30 && mins < 16 * 60;
}

export function MultiTickerPage() {
  const defaultMultiTickerSymbols = useAppStore(s => s.defaultMultiTickerSymbols);
  const resultsQuoteProvider = useAppStore(s => s.resultsQuoteProvider);
  const [searchParams] = useSearchParams();

  const getDefaultTickers = () => {
    const symbolsStr = defaultMultiTickerSymbols || 'AAPL,MSFT,AMZN,MAGS';
    return symbolsStr.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  };

  // ─── localStorage persistence helpers ────────────────────────────────────────
  const LS_CHART_KIND   = 'stocks.heroChartKind';
  const LS_SHOW_TRADES  = 'stocks.heroShowTrades';
  const LS_RANGE        = 'stocks.heroRange';
  const LS_TICKER       = 'stocks.selectedChartTicker';
  const LS_TICKERS      = 'stocks.tickers';

  const lsGet = <T,>(key: string, fallback: T): T => {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) as T : fallback; } catch { return fallback; }
  };

  const getInitialTickers = () => {
    const urlTickers = searchParams.get('tickers');
    if (urlTickers) {
      return urlTickers.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    }
    const saved = lsGet<string[] | null>(LS_TICKERS, null);
    if (saved && saved.length > 0) return saved;
    return getDefaultTickers();
  };

  const getInitialTickersInput = () => {
    const urlTickers = searchParams.get('tickers');
    if (urlTickers) {
      return urlTickers.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).join(', ');
    }
    const saved = lsGet<string[] | null>(LS_TICKERS, null);
    if (saved && saved.length > 0) return saved.join(', ');
    return defaultMultiTickerSymbols || 'AAPL, MSFT, AMZN, MAGS';
  };

  const getInitialSelectedTicker = () => {
    const urlTickers = searchParams.get('tickers');
    if (urlTickers) {
      const first = urlTickers.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)[0];
      if (first) return first;
    }
    return lsGet<string>(LS_TICKER, getDefaultTickers()[0] ?? '');
  };

  const [tickers, setTickers] = useState<string[]>(getInitialTickers);
  const [tickersInput, setTickersInput] = useState<string>(getInitialTickersInput);
  const [leveragePercent, setLeveragePercent] = useState(200);
  const [monthlyContributionAmount, setMonthlyContributionAmount] = useState<number>(500);
  const [monthlyContributionDay, setMonthlyContributionDay] = useState<number>(1);
  const [showStrategyInfo, setShowStrategyInfo] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backtestResults, setBacktestResults] = useState<BacktestResults | null>(null);
  const [monthlyContributionResults, setMonthlyContributionResults] = useState<BacktestResults | null>(null);

  type TabId = 'summary' | 'price' | 'tickerCharts' | 'equity' | 'trades' | 'profit' | 'monthlyContribution' | 'splits' | 'drawdown' | 'duration' | 'buyhold' | 'openDayDrawdown' | 'buyAtClose' | 'buyAtClose4' | 'noStopLoss' | 'options';
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [selectedPriceTicker, setSelectedPriceTicker] = useState<string>(() => getDefaultTickers()[0] ?? '');
  const [selectedTradeTicker, setSelectedTradeTicker] = useState<'all' | string>('all');

  // Сводка tab state
  const [selectedChartTicker, setSelectedChartTicker] = useState<string>(getInitialSelectedTicker);
  const [chartQuote, setChartQuote] = useState<ChartQuote | null>(null);
  const [chartQuoteLoading, setChartQuoteLoading] = useState(false);
  const [heroChartKind, setHeroChartKind] = useState<'line' | 'candles'>(() => lsGet<'line' | 'candles'>(LS_CHART_KIND, 'line'));
  const [heroShowTrades, setHeroShowTrades] = useState<boolean>(() => lsGet<boolean>(LS_SHOW_TRADES, true));
  const [heroRange, setHeroRange] = useState<'1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'MAX'>(() => lsGet(LS_RANGE, '3M'));
  const [showHeroSettings, setShowHeroSettings] = useState(false);
  const [isMarketOpen, setIsMarketOpen] = useState(getIsMarketOpen);

  const [showQuoteDetails, setShowQuoteDetails] = useState(false);
  const quoteDetailsRef = useRef<HTMLDivElement | null>(null);

  const lazyFallback = <ResultsPanelLoader />;
  const strategyHelpRef = useRef<HTMLDivElement | null>(null);
  const heroSettingsRef = useRef<HTMLDivElement | null>(null);
  const hasAutoRun = useRef(false);

  const prefetchAnalysisTab = (tabId: string) => {
    if (tabId === 'summary' || tabId === 'monthlyContribution') return;
    if (tabId === 'price') { void importTradingChart(); return; }
    if (tabId === 'openDayDrawdown') { void importOpenDayDrawdownChart(); return; }
    if (tabId === 'buyAtClose') { void importBuyAtCloseSimulator(); return; }
    if (tabId === 'buyAtClose4') { void importBuyAtClose4Simulator(); return; }
    if (tabId === 'noStopLoss') { void importNoStopLossSimulator(); return; }
    if (tabId === 'options') { void importOptionsAnalysis(); return; }
    if (tabId === 'buyhold') { void importBuyHoldAnalysis(); return; }
    void importBacktestResultsView().then((module) => {
      module.prefetchBacktestTab(tabId, 'multi');
    });
  };

  const {
    tickersData,
    setTickersData,
    loadTickerData,
    handleRefreshTicker,
    refreshingTickers,
    isDataOutdated
  } = useMultiTickerData();

  const analysisTabsConfig = useAppStore(s => s.analysisTabsConfig);
  const currentStrategy = useAppStore(s => s.currentStrategy);
  const fallbackStrategyRef = useRef<Strategy | null>(null);

  if (!fallbackStrategyRef.current) {
    fallbackStrategyRef.current = createStrategyFromTemplate(STRATEGY_TEMPLATES[0]);
  }

  const activeStrategy = currentStrategy ?? fallbackStrategyRef.current;
  const lowIBS = Number(activeStrategy?.parameters?.lowIBS ?? 0.1);
  const highIBS = Number(activeStrategy?.parameters?.highIBS ?? 0.75);
  const maxHoldDays = Number(
    typeof activeStrategy?.parameters?.maxHoldDays === 'number'
      ? activeStrategy.parameters.maxHoldDays
      : activeStrategy?.riskManagement?.maxHoldDays ?? 30
  );
  const initialCapital = Number(activeStrategy?.riskManagement?.initialCapital ?? 10000);

  // Strategy help popup close-on-outside-click
  useEffect(() => {
    if (!showStrategyInfo) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!strategyHelpRef.current) return;
      if (!strategyHelpRef.current.contains(event.target as Node)) setShowStrategyInfo(false);
    };
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setShowStrategyInfo(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [showStrategyInfo]);

  // Hero settings popup close-on-outside-click
  useEffect(() => {
    if (!showHeroSettings) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!heroSettingsRef.current) return;
      if (!heroSettingsRef.current.contains(event.target as Node)) setShowHeroSettings(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showHeroSettings]);

  // Quote details popup close-on-outside-click
  useEffect(() => {
    if (!showQuoteDetails) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!quoteDetailsRef.current) return;
      if (!quoteDetailsRef.current.contains(event.target as Node)) setShowQuoteDetails(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showQuoteDetails]);

  // ─── Backtest ────────────────────────────────────────────────────────────────

  const runBacktest = async (tickersOverride?: string[]) => {
    if (!activeStrategy) {
      setError('Недоступна стратегия для запуска расчёта');
      return;
    }

    const tickersToRun = tickersOverride ?? tickers;

    setIsLoading(true);
    setError(null);
    setMonthlyContributionResults(null);

    try {
      const loadedData = await Promise.all(tickersToRun.map(ticker => loadTickerData(ticker)));

      if (loadedData.length === 0) {
        throw new Error('Нет данных для выбранных тикеров');
      }

      setTickersData(loadedData);

      const optimizedData = optimizeTickerData(loadedData);
      const backtestResult = runSinglePositionBacktest(
        optimizedData,
        activeStrategy,
        leveragePercent / 100,
        { allowSameDayReentry: true }
      );

      const monthlyResult = runSinglePositionBacktest(
        optimizedData,
        activeStrategy,
        leveragePercent / 100,
        {
          allowSameDayReentry: true,
          monthlyContribution:
            monthlyContributionAmount > 0
              ? {
                amount: monthlyContributionAmount,
                dayOfMonth: monthlyContributionDay,
                startDate: optimizedData[0]?.data?.[0]?.date ? new Date(optimizedData[0].data[0].date) : undefined
              }
              : null
        }
      );

      setBacktestResults({
        equity: backtestResult.equity,
        finalValue: backtestResult.finalValue,
        maxDrawdown: backtestResult.maxDrawdown,
        trades: backtestResult.trades,
        metrics: backtestResult.metrics
      });

      setMonthlyContributionResults({
        equity: monthlyResult.equity,
        finalValue: monthlyResult.finalValue,
        maxDrawdown: monthlyResult.maxDrawdown,
        trades: monthlyResult.trades,
        metrics: monthlyResult.metrics
      });

      setSelectedTradeTicker('all');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при выполнении бэктеста');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-run backtest on mount
  useEffect(() => {
    if (hasAutoRun.current) return;
    if (!activeStrategy || tickers.length === 0) return;
    hasAutoRun.current = true;
    void runBacktest();
  }, [activeStrategy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefetch chunks after backtest
  useEffect(() => {
    if (!backtestResults) return;
    return scheduleIdleTask(() => {
      void importBacktestResultsView().then((module) => {
        module.prefetchBacktestResultsChunks('multi');
      });
      void importTradingChart();
      if (tickers.length === 1) {
        void importOpenDayDrawdownChart();
        void importBuyAtCloseSimulator();
        void importBuyAtClose4Simulator();
        void importNoStopLossSimulator();
        void importOptionsAnalysis();
        void importBuyHoldAnalysis();
      }
    }, 1000);
  }, [backtestResults]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep selectedChartTicker in sync with tickers list
  useEffect(() => {
    if (tickers.length > 0 && (!selectedChartTicker || !tickers.includes(selectedChartTicker))) {
      setSelectedChartTicker(tickers[0]);
    }
  }, [tickers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist chart settings to localStorage
  useEffect(() => { try { localStorage.setItem(LS_CHART_KIND, JSON.stringify(heroChartKind)); } catch {} }, [heroChartKind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem(LS_SHOW_TRADES, JSON.stringify(heroShowTrades)); } catch {} }, [heroShowTrades]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem(LS_RANGE, JSON.stringify(heroRange)); } catch {} }, [heroRange]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem(LS_TICKER, JSON.stringify(selectedChartTicker)); } catch {} }, [selectedChartTicker]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem(LS_TICKERS, JSON.stringify(tickers)); } catch {} }, [tickers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep selectedPriceTicker in sync with tickers list
  useEffect(() => {
    if (tickers.length > 0 && (!selectedPriceTicker || !tickers.includes(selectedPriceTicker))) {
      setSelectedPriceTicker(tickers[0]);
    }
  }, [tickers]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Quote fetch + auto-refresh ──────────────────────────────────────────────

  useEffect(() => {
    if (!selectedChartTicker) return;
    let cancelled = false;

    const fetchQuote = async () => {
      setChartQuoteLoading(true);
      try {
        const q = await DatasetAPI.getQuote(selectedChartTicker, (resultsQuoteProvider || 'finnhub') as 'alpha_vantage' | 'finnhub' | 'twelve_data' | 'webull');
        if (!cancelled) {
          setChartQuote(q);
          setIsMarketOpen(getIsMarketOpen());
        }
      } catch {
        // quote not critical
      }
      if (!cancelled) setChartQuoteLoading(false);
    };

    void fetchQuote();
    const interval = setInterval(() => void fetchQuote(), 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedChartTicker, resultsQuoteProvider]);

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const selectedTickerChartData = tickersData.find(t => t.ticker === selectedChartTicker)?.data ?? [];

  const isSingleTicker = tickers.length === 1;

  // Single-ticker-only tab IDs
  const SINGLE_TICKER_ONLY_TABS = new Set(['buyhold', 'openDayDrawdown', 'buyAtClose', 'buyAtClose4', 'noStopLoss', 'options']);
  // Multi-ticker-only tab IDs
  const MULTI_TICKER_ONLY_TABS = new Set(['tickerCharts']);

  const summaryTabs = useMemo(() => {
    const result: { id: string; label: string }[] = [{ id: 'summary', label: 'Сводка' }];
    if (!backtestResults) return result;

    for (const tab of analysisTabsConfig) {
      if (!tab.visible) continue;
      if (SINGLE_TICKER_ONLY_TABS.has(tab.id) && !isSingleTicker) continue;
      if (MULTI_TICKER_ONLY_TABS.has(tab.id) && isSingleTicker) continue;
      if (tab.id === 'monthlyContribution' && !monthlyContributionResults) continue;
      result.push({ id: tab.id, label: tab.label });
    }

    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisTabsConfig, backtestResults, isSingleTicker, monthlyContributionResults]);

  // ─── Сводка tab ──────────────────────────────────────────────────────────────

  const renderSummaryTab = () => {
    const prevClose = chartQuote?.prevClose ?? null;
    const cur = chartQuote?.current ?? null;
    const delta = cur != null && prevClose != null ? cur - prevClose : null;
    const pct = delta != null && prevClose ? (delta / prevClose) * 100 : null;
    const positive = delta != null ? delta >= 0 : true;
    const priceColor = positive ? 'text-green-600 dark:text-emerald-300' : 'text-orange-600 dark:text-orange-300';

    // Open position check for selected ticker
    const selectedTickerTrades = backtestResults?.trades ?? [];
    const lastDataDate = selectedTickerChartData.length ? selectedTickerChartData[selectedTickerChartData.length - 1].date : null;
    const lastTrade = selectedTickerTrades[selectedTickerTrades.length - 1] ?? null;
    const isOpenPosition = !!(lastTrade && lastDataDate && isSameDay(lastTrade.exitDate, lastDataDate));
    const openEntryPrice = isOpenPosition ? lastTrade?.entryPrice ?? null : null;

    // Stale data check for selected ticker
    const selectedTickerEntry = tickersData.find(t => t.ticker === selectedChartTicker);
    const selectedTickerLastDate = selectedTickerEntry?.data?.length
      ? selectedTickerEntry.data[selectedTickerEntry.data.length - 1].date
      : undefined;
    const isSelectedTickerStale = isDataOutdated(selectedTickerLastDate);
    const isRefreshingSelected = refreshingTickers.has(selectedChartTicker);

    const quoteProviderLabel = resultsQuoteProvider === 'alpha_vantage'
      ? 'Alpha Vantage'
      : (resultsQuoteProvider === 'twelve_data'
        ? 'Twelve Data'
        : (resultsQuoteProvider === 'webull' ? 'Webull' : 'Finnhub'));

    const formatQuoteValue = (value: number | null | undefined) =>
      value != null && Number.isFinite(value) ? Number(value).toFixed(2) : '—';

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
          {/* ── Left: chart ── */}
          <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-950/40">
            {/* Toolbar: ticker pills + chart settings */}
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Ticker pills */}
              <div className="flex flex-wrap gap-1">
                {tickers.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedChartTicker(t)}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                      t === selectedChartTicker
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Price info for selected ticker */}
              {cur != null && (
                <div className="flex items-baseline gap-1.5 ml-1">
                  <AnimatedPrice
                    value={cur}
                    className="text-base font-bold text-gray-900 dark:text-gray-100"
                  />
                  {delta != null && pct != null && (
                    <span className={`text-xs font-semibold ${priceColor}`}>
                      {delta >= 0 ? '+' : ''}{delta.toFixed(2)} ({delta >= 0 ? '+' : ''}{pct.toFixed(2)}%)
                    </span>
                  )}
                </div>
              )}

              {/* Right buttons */}
              <div className="ml-auto flex items-center gap-1.5">
                {/* Pro button */}
                {backtestResults && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('price')}
                    className="inline-flex h-7 items-center gap-1 rounded-full border border-gray-300 px-2 text-[11px] text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    title="Открыть профессиональный график"
                  >
                    Pro
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                )}

                {/* Refresh quote */}
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedChartTicker) return;
                    setChartQuoteLoading(true);
                    DatasetAPI.getQuote(selectedChartTicker, (resultsQuoteProvider || 'finnhub') as 'alpha_vantage' | 'finnhub' | 'twelve_data' | 'webull')
                      .then(q => { setChartQuote(q); setIsMarketOpen(getIsMarketOpen()); })
                      .catch(() => {})
                      .finally(() => setChartQuoteLoading(false));
                  }}
                  disabled={chartQuoteLoading}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  title="Обновить котировку"
                >
                  <RefreshCcw className={`h-3.5 w-3.5 ${chartQuoteLoading ? 'animate-spin' : ''}`} />
                </button>

                {/* Quote details popup */}
                <div ref={quoteDetailsRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setShowQuoteDetails((prev) => !prev)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    title="Детали котировки"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                  {showQuoteDetails && (
                    <div className="absolute right-0 top-full z-20 mt-1.5 w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Детали котировки
                      </div>
                      <div className="mt-2 space-y-1.5 text-xs text-gray-700 dark:text-gray-200">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-gray-500 dark:text-gray-400">Источник</span>
                          <span>{quoteProviderLabel}</span>
                        </div>
                        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                          <div className="rounded border border-gray-200 px-2 py-1 dark:border-gray-700">
                            <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Откр</div>
                            <div className="font-mono text-xs">{formatQuoteValue(chartQuote?.open)}</div>
                          </div>
                          <div className="rounded border border-gray-200 px-2 py-1 dark:border-gray-700">
                            <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Макс</div>
                            <div className="font-mono text-xs">{formatQuoteValue(chartQuote?.high)}</div>
                          </div>
                          <div className="rounded border border-gray-200 px-2 py-1 dark:border-gray-700">
                            <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Мин</div>
                            <div className="font-mono text-xs">{formatQuoteValue(chartQuote?.low)}</div>
                          </div>
                          <div className="rounded border border-gray-200 px-2 py-1 dark:border-gray-700">
                            <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Текущ</div>
                            <div className="font-mono text-xs">{formatQuoteValue(chartQuote?.current)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Chart type settings */}
                <div ref={heroSettingsRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setShowHeroSettings((prev) => !prev)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    title="Настройки графика"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </button>
                  {showHeroSettings && (
                    <div className="absolute right-0 top-full z-20 mt-1.5 w-48 rounded-lg border border-gray-200 bg-white p-2.5 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Тип графика</div>
                      <div className="mt-1.5 grid grid-cols-2 gap-1">
                        {(['line', 'candles'] as const).map((kind) => (
                          <button
                            key={kind}
                            type="button"
                            onClick={() => setHeroChartKind(kind)}
                            className={`rounded px-2 py-1 text-[11px] ${heroChartKind === kind
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                            }`}
                          >
                            {kind === 'line' ? 'Линия' : 'Свечи'}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setHeroShowTrades((prev) => !prev)}
                        className="mt-2 flex w-full items-center justify-between rounded bg-gray-100 px-2 py-1.5 text-[11px] text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        <span>Показывать сделки</span>
                        <span className={heroShowTrades ? 'text-green-600 dark:text-green-300' : 'text-gray-500'}>
                          {heroShowTrades ? 'Вкл' : 'Выкл'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Chart */}
            {isLoading && selectedTickerChartData.length === 0 ? (
              <div className="flex h-[375px] items-center justify-center rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                <div className="text-sm text-gray-500">Загрузка данных...</div>
              </div>
            ) : (
              <HeroLineChart
                data={selectedTickerChartData}
                trades={heroShowTrades ? (backtestResults?.trades ?? []) : []}
                currentPrice={chartQuote?.current ?? null}
                todayQuote={chartQuote ? { open: chartQuote.open, high: chartQuote.high, low: chartQuote.low } : null}
                chartKind={heroChartKind}
                showTrades={heroShowTrades}
                isTrading={isMarketOpen}
                isUpdating={chartQuoteLoading}
                initialRange={heroRange}
                onRangeChange={setHeroRange}
              />
            )}
          </div>

          {/* ── Right: parameters ── */}
          <aside className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900/70">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Параметры</span>
              <div ref={strategyHelpRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowStrategyInfo((prev) => !prev)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                  title="Показать описание стратегии"
                  aria-expanded={showStrategyInfo}
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
                {showStrategyInfo && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-[min(94vw,430px)]">
                    <StrategyInfoCard
                      strategy={activeStrategy}
                      lowIBS={lowIBS}
                      highIBS={highIBS}
                      maxHoldDays={maxHoldDays}
                    />
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Тикеры</label>
              <TickerInput
                value={tickersInput}
                onChange={setTickersInput}
                tickers={tickers}
                onTickersChange={setTickers}
                showBadges={false}
              />
              {(() => {
                const defaults = getDefaultTickers();
                const isAlreadyDefault = defaults.length === tickers.length && defaults.every((t, i) => t === tickers[i]);
                if (isAlreadyDefault) return null;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      const defaultList = getDefaultTickers();
                      setTickers(defaultList);
                      setTickersInput(defaultList.join(', '));
                      void runBacktest(defaultList);
                    }}
                    className="mt-1.5 w-full rounded-md border border-dashed border-gray-300 px-2 py-1 text-left text-[11px] text-gray-500 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-blue-500 dark:hover:bg-blue-950/20 dark:hover:text-blue-300 transition-colors"
                    title="Вернуться к дефолтным тикерам"
                  >
                    ↩ {getDefaultTickers().join(', ')}
                  </button>
                );
              })()}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Маржинальность</label>
              <Select
                value={leveragePercent}
                onChange={(e) => setLeveragePercent(Number(e.target.value))}
              >
                <option value={100}>100%</option>
                <option value={125}>125%</option>
                <option value={150}>150%</option>
                <option value={175}>175%</option>
                <option value={200}>200%</option>
                <option value={225}>225%</option>
                <option value={250}>250%</option>
                <option value={275}>275%</option>
                <option value={300}>300%</option>
              </Select>
            </div>

            <Button
              onClick={() => void runBacktest()}
              disabled={isLoading || !activeStrategy || tickers.length === 0}
              isLoading={isLoading}
              variant="primary"
              size="md"
              className="w-full"
            >
              Запустить бэктест
            </Button>

            {/* Compact metrics after backtest */}
            {backtestResults && (
              <div className="space-y-1.5 border-t border-gray-200 pt-3 dark:border-gray-700">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Результаты</div>
                {(() => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const m = backtestResults.metrics as any;
                  return [
                    { label: 'CAGR', value: m?.cagr != null ? `${Number(m.cagr).toFixed(1)}%` : '—' },
                    { label: 'Макс. просадка', value: m?.maxDrawdown != null ? `${(Number(m.maxDrawdown) * 100).toFixed(1)}%` : '—' },
                    { label: 'Win rate', value: m?.winRate != null ? `${(Number(m.winRate) * 100).toFixed(1)}%` : '—' },
                    { label: 'Sharpe', value: m?.sharpeRatio != null ? Number(m.sharpeRatio).toFixed(2) : '—' },
                    { label: 'Сделок', value: String(backtestResults.trades.length) },
                  ];
                })().map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">{label}</span>
                    <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">{value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Stale data warning */}
            {isSelectedTickerStale && selectedChartTicker && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                <div className="flex items-start justify-between gap-2">
                  <div>Данные {selectedChartTicker} не актуальны</div>
                  <button
                    onClick={() => void handleRefreshTicker(selectedChartTicker)}
                    disabled={isRefreshingSelected}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50 dark:border-amber-900/60 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50"
                    title="Обновить данные"
                  >
                    <RefreshCcw className={`h-3.5 w-3.5 ${isRefreshingSelected ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
            )}

            {/* Open position indicator */}
            {backtestResults && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-200">
                <span>
                  Открытая сделка:{' '}
                  <span className={isOpenPosition ? 'text-emerald-600 dark:text-emerald-300' : 'text-gray-500'}>
                    {isOpenPosition ? 'да' : 'нет'}
                  </span>
                  {isOpenPosition && openEntryPrice != null && (
                    <span className="ml-1 text-gray-600 dark:text-gray-300">вход: ${Number(openEntryPrice).toFixed(2)}</span>
                  )}
                </span>
              </div>
            )}
          </aside>
        </div>
      </div>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <PageHeader title="Акции" subtitle="Бэктест стратегии на нескольких активах" />
      </div>

      <BacktestPageShell isLoading={false} error={error} loadingMessage="Загрузка данных и выполнение бэктеста...">
        {backtestResults && (
          <MetricsGrid
            finalValue={backtestResults.finalValue}
            maxDrawdown={backtestResults.maxDrawdown}
            metrics={backtestResults.metrics}
          />
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <AnalysisTabs
            tabs={summaryTabs}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as TabId)}
            onTabIntent={prefetchAnalysisTab}
          />

          <div className="p-4">
            {activeTab === 'summary' && renderSummaryTab()}

            {activeTab === 'monthlyContribution' && monthlyContributionResults && backtestResults && (
              <MonthlyContributionAnalysis
                monthlyContributionAmount={monthlyContributionAmount}
                monthlyContributionDay={monthlyContributionDay}
                onAmountChange={setMonthlyContributionAmount}
                onDayChange={setMonthlyContributionDay}
                results={monthlyContributionResults}
                baseScenarioResults={backtestResults}
                leveragePercent={leveragePercent}
                initialCapital={initialCapital}
                comparisonEquity={backtestResults.equity}
              />
            )}

            {/* Цены tab: TradingChart with ticker selector pills */}
            {backtestResults && activeTab === 'price' && (
              <Suspense fallback={lazyFallback}>
                <TradingChart
                  data={tickersData.find(t => t.ticker === selectedPriceTicker)?.data ?? []}
                  trades={backtestResults.trades}
                  splits={tickersData.find(t => t.ticker === selectedPriceTicker)?.splits}
                  isVisible={activeTab === 'price'}
                  toolbarPrefix={tickers.length > 1 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {tickers.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setSelectedPriceTicker(t)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                            t === selectedPriceTicker
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  ) : undefined}
                />
              </Suspense>
            )}

            {/* Single-ticker-only tabs */}
            {backtestResults && isSingleTicker && tickersData[0] && (
              <Suspense fallback={lazyFallback}>
                {activeTab === 'openDayDrawdown' && (
                  <ChartContainer>
                    <OpenDayDrawdownChart trades={backtestResults.trades} data={tickersData[0].data} />
                  </ChartContainer>
                )}
                {activeTab === 'buyAtClose' && (
                  <BuyAtCloseSimulator data={tickersData[0].data} strategy={activeStrategy} />
                )}
                {activeTab === 'buyAtClose4' && (
                  <BuyAtClose4Simulator strategy={activeStrategy} />
                )}
                {activeTab === 'noStopLoss' && (
                  <NoStopLossSimulator data={tickersData[0].data} strategy={activeStrategy} />
                )}
                {activeTab === 'options' && (
                  <OptionsAnalysis stockTrades={backtestResults.trades} marketData={tickersData[0].data} />
                )}
                {activeTab === 'buyhold' && (
                  <BuyHoldAnalysis marketData={tickersData[0].data} initialCapital={initialCapital} />
                )}
              </Suspense>
            )}

            {backtestResults && !['summary', 'monthlyContribution', 'price', 'buyhold', 'openDayDrawdown', 'buyAtClose', 'buyAtClose4', 'noStopLoss', 'options'].includes(activeTab) && (
              <Suspense fallback={lazyFallback}>
                <BacktestResultsView
                  mode="multi"
                  activeTab={activeTab}
                  backtestResults={backtestResults}
                  tickersData={tickersData}
                  strategy={activeStrategy}
                  handlers={{
                    isDataOutdated,
                    handleRefreshTicker,
                    refreshingTickers,
                    selectedTradeTicker,
                    setSelectedTradeTicker
                  }}
                />
              </Suspense>
            )}
          </div>
        </div>
      </BacktestPageShell>
    </div>
  );
}
