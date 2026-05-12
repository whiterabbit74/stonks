import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { HelpCircle, RefreshCw, ArrowUpRight } from 'lucide-react';
import { MetricsGrid, AnalysisTabs, PageHeader, Select, Input, Button, TickerInput, IconButton, Panel } from './ui';
import { useAppStore } from '../stores';
import type { Strategy, MultiTickerBacktestResults, ChartQuote } from '../types';
import { optimizeTickerData, runSinglePositionBacktest } from '../lib/singlePositionBacktest';
import { runMultiTickerOptionsBacktest } from '../lib/optionsBacktest';
import { StrategyInfoCard } from './StrategyInfoCard';
import { calculateBacktestMetrics } from '../lib/backtest-statistics';
import { createStrategyFromTemplate, STRATEGY_TEMPLATES } from '../lib/strategy';
import { useMultiTickerData } from '../hooks/useMultiTickerData';
import { BacktestPageShell } from './BacktestPageShell';
import { scheduleIdleTask } from '../lib/prefetch';
import { HeroLineChart } from './HeroLineChart';
import { AnimatedPrice } from './AnimatedPrice';
import { DatasetAPI } from '../lib/api';
import { isSameDay } from '../lib/date-utils';
import { getIsMarketOpen } from '../lib/market-utils';
import { lsGet, lsSet } from '../lib/storage';
import { LS } from '../constants';
import { useClickOutside } from '../hooks/useClickOutside';
import { CompactMetrics } from './CompactMetrics';
import { StaleDataWarning } from './StaleDataWarning';
import { OpenPositionBadge } from './OpenPositionBadge';
import { TabContentLoader } from './ui/TabContentLoader';
import { QuoteDetailsPopover } from './QuoteDetailsPopover';
import { HeroChartSettingsPopover } from './HeroChartSettingsPopover';


interface OptionsPageSettings {
  strikePct: number;
  volAdjPct: number;
  capitalPct: number;
  expirationWeeks: number;
  maxHoldingDays: number;
  strategyType: string;
  spreadWidthPct: number;
}

const DEFAULT_OPTIONS_SETTINGS: OptionsPageSettings = {
  strikePct: 10,
  volAdjPct: 20,
  capitalPct: 10,
  expirationWeeks: 4,
  maxHoldingDays: 30,
  strategyType: 'otm_call',
  spreadWidthPct: 5,
};

function loadOptionsSettings(): OptionsPageSettings {
  const saved = lsGet<Partial<OptionsPageSettings> | null>(LS.OPTIONS_SETTINGS, null);
  if (saved && typeof saved === 'object') return { ...DEFAULT_OPTIONS_SETTINGS, ...saved };
  return { ...DEFAULT_OPTIONS_SETTINGS };
}

const importBacktestResultsView = () => import('./BacktestResultsView');
const BacktestResultsView = lazy(() => importBacktestResultsView().then((m) => ({ default: m.BacktestResultsView })));

type BacktestResults = MultiTickerBacktestResults;

export function MultiTickerOptionsPage() {
  const defaultMultiTickerSymbols = useAppStore(s => s.defaultMultiTickerSymbols);
  const resultsQuoteProvider = useAppStore(s => s.resultsQuoteProvider);

  const getDefaultTickers = () => {
    const symbolsStr = defaultMultiTickerSymbols || 'AAPL,MSFT,AMZN,MAGS';
    return symbolsStr.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  };

  const getInitialTickers = () => {
    const saved = lsGet<string[] | null>(LS.TICKERS, null);
    if (saved && saved.length > 0) return saved;
    return getDefaultTickers();
  };

  const getInitialTickersInput = () => {
    const saved = lsGet<string[] | null>(LS.TICKERS, null);
    if (saved && saved.length > 0) return saved.join(', ');
    return defaultMultiTickerSymbols || 'AAPL, MSFT, AMZN, MAGS';
  };

  const getInitialSelectedTicker = () => lsGet<string>(LS.OPTIONS_SELECTED_TICKER, getDefaultTickers()[0] ?? '');

  const [tickers, setTickers] = useState<string[]>(getInitialTickers);
  const [tickersInput, setTickersInput] = useState<string>(getInitialTickersInput);
  const [optSettings, setOptSettings] = useState<OptionsPageSettings>(loadOptionsSettings);

  const strikePct = optSettings.strikePct;
  const volAdjPct = optSettings.volAdjPct;
  const capitalPct = optSettings.capitalPct;
  const expirationWeeks = optSettings.expirationWeeks;
  const maxHoldingDays = optSettings.maxHoldingDays;

  const setStrikePct = (v: number) => setOptSettings(s => ({ ...s, strikePct: v }));
  const setVolAdjPct = (v: number) => setOptSettings(s => ({ ...s, volAdjPct: v }));
  const setCapitalPct = (v: number) => setOptSettings(s => ({ ...s, capitalPct: v }));
  const setExpirationWeeks = (v: number) => setOptSettings(s => ({ ...s, expirationWeeks: v }));
  const setMaxHoldingDays = (v: number) => setOptSettings(s => ({ ...s, maxHoldingDays: v }));

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backtestResults, setBacktestResults] = useState<BacktestResults | null>(null);

  type TabId = 'summary' | 'equity' | 'price' | 'tickerCharts' | 'drawdown' | 'trades' | 'profit' | 'duration' | 'splits';
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [selectedTradeTicker, setSelectedTradeTicker] = useState<'all' | string>('all');

  // Summary tab state
  const [selectedChartTicker, setSelectedChartTicker] = useState<string>(getInitialSelectedTicker);
  const [chartQuote, setChartQuote] = useState<ChartQuote | null>(null);
  const [chartQuoteLoading, setChartQuoteLoading] = useState(false);
  const [heroChartKind, setHeroChartKind] = useState<'line' | 'candles'>(() => lsGet<'line' | 'candles'>(LS.OPTIONS_CHART_KIND, 'line'));
  const [heroShowTrades, setHeroShowTrades] = useState<boolean>(() => lsGet<boolean>(LS.OPTIONS_SHOW_TRADES, true));
  const [heroRange, setHeroRange] = useState<'1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'MAX'>(() => lsGet(LS.OPTIONS_RANGE, '3M'));
  const [showStrategyInfo, setShowStrategyInfo] = useState(false);
  const [isMarketOpen, setIsMarketOpen] = useState(getIsMarketOpen);

  const strategyHelpRef = useRef<HTMLDivElement | null>(null);
  const hasAutoRun = useRef(false);
  const lazyFallback = <TabContentLoader />;

  const prefetchAnalysisTab = (tabId: string) => {
    void importBacktestResultsView().then((module) => {
      module.prefetchBacktestTab(tabId, 'options');
    });
  };

  const {
    tickersData,
    setTickersData,
    loadTickerData,
    handleRefreshTicker,
    refreshingTickers,
    isDataOutdated,
  } = useMultiTickerData();

  const currentStrategy = useAppStore(s => s.currentStrategy);
  const fallbackStrategyRef = useRef<Strategy | null>(null);

  if (!fallbackStrategyRef.current) {
    fallbackStrategyRef.current = createStrategyFromTemplate(STRATEGY_TEMPLATES[0]);
  }

  const activeStrategy = currentStrategy ?? fallbackStrategyRef.current;
  const lowIBS = Number(activeStrategy?.parameters?.lowIBS ?? 0.1);
  const highIBS = Number(activeStrategy?.parameters?.highIBS ?? 0.75);
  const strategyMaxHoldDays = Number(
    typeof activeStrategy?.parameters?.maxHoldDays === 'number'
      ? activeStrategy.parameters.maxHoldDays
      : activeStrategy?.riskManagement?.maxHoldDays ?? 30
  );
  const initialCapital = 10000;

  useClickOutside(strategyHelpRef, showStrategyInfo, () => setShowStrategyInfo(false));

  const runBacktest = async (tickersOverride?: string[]) => {
    if (!activeStrategy) {
      setError('Недоступна стратегия для запуска расчёта');
      return;
    }

    const tickersToRun = tickersOverride ?? tickers;
    setIsLoading(true);
    setError(null);

    try {
      const loadedData = await Promise.all(tickersToRun.map(ticker => loadTickerData(ticker)));

      if (loadedData.length === 0) {
        throw new Error('Нет данных для выбранных тикеров');
      }

      setTickersData(loadedData);

      const optimizedData = optimizeTickerData(loadedData);
      const stockBacktestResult = runSinglePositionBacktest(
        optimizedData,
        activeStrategy,
        1.0,
        { allowSameDayReentry: true }
      );

      const allStockTrades = stockBacktestResult.trades.sort((a, b) =>
        new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
      );

      const optionsResult = runMultiTickerOptionsBacktest(allStockTrades, loadedData, {
        strikePct,
        volAdjPct,
        capitalPct,
        expirationWeeks,
        maxHoldingDays,
      });

      const metrics = calculateBacktestMetrics(
        optionsResult.trades,
        optionsResult.equity,
        initialCapital
      );

      setBacktestResults({
        equity: optionsResult.equity,
        finalValue: optionsResult.finalValue,
        maxDrawdown: metrics.maxDrawdown,
        trades: optionsResult.trades,
        metrics,
      });
      setSelectedTradeTicker('all');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при выполнении бэктеста');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-run on mount
  useEffect(() => {
    if (hasAutoRun.current) return;
    if (!activeStrategy || tickers.length === 0) return;
    hasAutoRun.current = true;
    void runBacktest();
  }, [activeStrategy]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { lsSet(LS.OPTIONS_SETTINGS, optSettings); }, [optSettings]);
  useEffect(() => { lsSet(LS.TICKERS, tickers); }, [tickers]);
  useEffect(() => { lsSet(LS.OPTIONS_CHART_KIND, heroChartKind); }, [heroChartKind]);
  useEffect(() => { lsSet(LS.OPTIONS_SHOW_TRADES, heroShowTrades); }, [heroShowTrades]);
  useEffect(() => { lsSet(LS.OPTIONS_RANGE, heroRange); }, [heroRange]);
  useEffect(() => { lsSet(LS.OPTIONS_SELECTED_TICKER, selectedChartTicker); }, [selectedChartTicker]);

  // Keep selectedChartTicker in sync with tickers list
  useEffect(() => {
    if (tickers.length > 0 && (!selectedChartTicker || !tickers.includes(selectedChartTicker))) {
      setSelectedChartTicker(tickers[0]);
    }
  }, [tickers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefetch after backtest
  useEffect(() => {
    if (!backtestResults) return;
    return scheduleIdleTask(() => {
      void importBacktestResultsView().then((module) => {
        module.prefetchBacktestResultsChunks('options');
      });
    }, 1000);
  }, [backtestResults]);

  // Quote fetch + auto-refresh
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
      } catch { /* quote not critical */ }
      if (!cancelled) setChartQuoteLoading(false);
    };

    void fetchQuote();
    const interval = setInterval(() => void fetchQuote(), 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedChartTicker, resultsQuoteProvider]);

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const selectedTickerChartData = tickersData.find(t => t.ticker === selectedChartTicker)?.data ?? [];
  const selectedTickerEntry = tickersData.find(t => t.ticker === selectedChartTicker);
  const selectedTickerLastDate = selectedTickerEntry?.data?.length
    ? selectedTickerEntry.data[selectedTickerEntry.data.length - 1].date
    : undefined;
  const isSelectedTickerStale = isDataOutdated(selectedTickerLastDate);
  const isRefreshingSelected = refreshingTickers.has(selectedChartTicker);

  // ─── Summary tab ─────────────────────────────────────────────────────────────

  const renderSummaryTab = () => {
    const prevClose = chartQuote?.prevClose ?? null;
    const cur = chartQuote?.current ?? null;
    const delta = cur != null && prevClose != null ? cur - prevClose : null;
    const pct = delta != null && prevClose ? (delta / prevClose) * 100 : null;
    const positive = delta != null ? delta >= 0 : true;
    const priceColor = positive ? 'text-green-600 dark:text-emerald-300' : 'text-orange-600 dark:text-orange-300';

    const lastTrade = backtestResults?.trades[backtestResults.trades.length - 1] ?? null;
    const lastDataDate = selectedTickerChartData.length
      ? selectedTickerChartData[selectedTickerChartData.length - 1].date
      : null;
    const isOpenPosition = !!(lastTrade && lastDataDate && isSameDay(lastTrade.exitDate, lastDataDate));
    const openEntryPrice = isOpenPosition ? lastTrade?.entryPrice ?? null : null;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_240px] lg:grid-cols-[minmax(0,1fr)_280px]">

          {/* ── Left: chart ── */}
          <Panel tone="subtle" padding="sm" className="space-y-3">
            {/* Toolbar */}
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
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Price info */}
              {cur != null && (
                <div className="flex items-baseline gap-1.5 ml-1">
                  <AnimatedPrice value={cur} className="text-base font-bold text-gray-900 dark:text-gray-100" />
                  {delta != null && pct != null && (
                    <span className={`text-xs font-semibold ${priceColor}`}>
                      {delta >= 0 ? '+' : ''}{delta.toFixed(2)} ({delta >= 0 ? '+' : ''}{pct.toFixed(2)}%)
                    </span>
                  )}
                </div>
              )}

              {/* Right buttons */}
              <div className="ml-auto flex items-center gap-1.5">
                {backtestResults && (
                  <Button
                    onClick={() => setActiveTab('equity')}
                    variant="secondary"
                    size="sm"
                    className="h-7 rounded-full px-2.5 text-[11px]"
                    title="Открыть баланс"
                    rightIcon={<ArrowUpRight className="h-3 w-3" />}
                  >
                    Equity
                  </Button>
                )}

                <IconButton
                  onClick={() => {
                    if (!selectedChartTicker) return;
                    setChartQuoteLoading(true);
                    DatasetAPI.getQuote(selectedChartTicker, (resultsQuoteProvider || 'finnhub') as 'alpha_vantage' | 'finnhub' | 'twelve_data' | 'webull')
                      .then(q => { setChartQuote(q); setIsMarketOpen(getIsMarketOpen()); })
                      .catch(() => {})
                      .finally(() => setChartQuoteLoading(false));
                  }}
                  disabled={chartQuoteLoading}
                  variant="outline"
                  size="md"
                  title="Обновить котировку"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${chartQuoteLoading ? 'animate-spin' : ''}`} />
                </IconButton>

                <QuoteDetailsPopover quote={chartQuote} provider={resultsQuoteProvider || 'finnhub'} />

                {/* Chart settings */}
                <HeroChartSettingsPopover
                  chartKind={heroChartKind}
                  onChartKindChange={setHeroChartKind}
                  showTrades={heroShowTrades}
                  onShowTradesChange={setHeroShowTrades}
                />
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
          </Panel>

          {/* ── Right: parameters ── */}
          <Panel as="aside" tone="soft" padding="sm" className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Параметры</span>
              <div ref={strategyHelpRef} className="relative">
                <IconButton
                  onClick={() => setShowStrategyInfo((prev) => !prev)}
                  variant="outline"
                  size="md"
                  title="Показать описание стратегии"
                  aria-expanded={showStrategyInfo}
                >
                  <HelpCircle className="h-4 w-4" />
                </IconButton>
                {showStrategyInfo && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-[min(94vw,430px)]">
                    <StrategyInfoCard
                      strategy={activeStrategy}
                      lowIBS={lowIBS}
                      highIBS={highIBS}
                      maxHoldDays={strategyMaxHoldDays}
                      optionsMode={true}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Tickers */}
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
                    className="mt-1.5 w-full rounded-lg border border-dashed border-gray-300 px-2 py-1 text-left text-[11px] text-gray-500 transition-colors hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/20 dark:hover:text-indigo-300"
                    title="Вернуться к дефолтным тикерам"
                  >
                    ↩ {getDefaultTickers().join(', ')}
                  </button>
                );
              })()}
            </div>

            {/* Options params */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Страйк (+%)</label>
                <Select value={strikePct} onChange={(e) => setStrikePct(Number(e.target.value))}>
                  {[5, 10, 15, 20].map(v => <option key={v} value={v}>+{v}%</option>)}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">IV Adj (+%)</label>
                <Select value={volAdjPct} onChange={(e) => setVolAdjPct(Number(e.target.value))}>
                  {[0, 5, 10, 15, 20, 25, 30, 40, 50].map(v => <option key={v} value={v}>+{v}%</option>)}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Капитал на сделку</label>
                <Select value={capitalPct} onChange={(e) => setCapitalPct(Number(e.target.value))}>
                  {[5, 10, 15, 20, 25, 30, 50].map(v => <option key={v} value={v}>{v}%</option>)}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Экспирация</label>
                <Select value={expirationWeeks} onChange={(e) => setExpirationWeeks(Number(e.target.value))}>
                  <option value={1}>1 неделя</option>
                  <option value={2}>2 недели</option>
                  <option value={4}>1 месяц</option>
                  <option value={8}>2 месяца</option>
                  <option value={12}>3 месяца</option>
                  <option value={24}>6 месяцев</option>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Макс. удержание (дней)</label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={maxHoldingDays}
                  onChange={(e) => setMaxHoldingDays(Number(e.target.value))}
                />
              </div>
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

            {backtestResults && (
              <CompactMetrics metrics={backtestResults.metrics} trades={backtestResults.trades} />
            )}

            {isSelectedTickerStale && selectedChartTicker && (
              <StaleDataWarning
                ticker={selectedChartTicker}
                isRefreshing={isRefreshingSelected}
                onRefresh={() => void handleRefreshTicker(selectedChartTicker)}
              />
            )}

            {backtestResults && (
              <OpenPositionBadge isOpen={isOpenPosition} entryPrice={openEntryPrice} />
            )}
          </Panel>
        </div>
      </div>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <Panel as="section" padding="md">
        <PageHeader className="mb-0" title="Опционы" subtitle="Бэктест опционных стратегий на нескольких активах" />
      </Panel>

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
            tabs={[
              { id: 'summary', label: 'Сводка' },
              ...(backtestResults ? [
                { id: 'equity', label: 'Баланс' },
                { id: 'price', label: 'Цены' },
                { id: 'tickerCharts', label: 'Графики тикеров' },
                { id: 'drawdown', label: 'Просадка' },
                { id: 'trades', label: 'Сделки' },
                { id: 'profit', label: 'Профит Фактор' },
                { id: 'duration', label: 'Длительность' },
                { id: 'splits', label: 'Сплиты' },
              ] : []),
            ]}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as TabId)}
            onTabIntent={prefetchAnalysisTab}
          />

          <div className="p-4 min-h-[420px]">
            {activeTab === 'summary' && renderSummaryTab()}

            {backtestResults && activeTab !== 'summary' && (
              <Suspense fallback={lazyFallback}>
                <BacktestResultsView
                  mode="options"
                  activeTab={activeTab}
                  backtestResults={backtestResults}
                  tickersData={tickersData}
                  strategy={activeStrategy}
                  initialCapital={initialCapital}
                  handlers={{
                    isDataOutdated,
                    handleRefreshTicker,
                    refreshingTickers,
                    selectedTradeTicker,
                    setSelectedTradeTicker,
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
