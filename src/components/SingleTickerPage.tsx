import { lazy, Suspense, useEffect, useMemo, useState, useTransition } from 'react';
import { Heart, RefreshCw, HelpCircle, ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DatasetAPI } from '../lib/api';
import { isSameDay } from '../lib/date-utils';
import { useAppStore } from '../stores';
import { LS } from '../constants';
import { ChartContainer, AnalysisTabs, MetricsGrid, Button, IconButton, Panel, Select } from './ui';
import { InfoModal } from './InfoModal';
import { AnimatedPrice } from './AnimatedPrice';
import { HeroLineChart } from './HeroLineChart';
import { useSingleTickerData } from '../hooks/useSingleTickerData';
import { BacktestPageShell } from './BacktestPageShell';
import { scheduleIdleTask } from '../lib/prefetch';
import { MetricsCalculator } from '../lib/metrics';
import { formatCurrencyUSD } from '../lib/formatters';
import { simulateMarginByTrades } from '../lib/margin-simulation';
import { lsGet, lsSet } from '../lib/storage';
import { QuoteDetailsPopover } from './QuoteDetailsPopover';
import { HeroChartSettingsPopover } from './HeroChartSettingsPopover';

const importBacktestResultsView = () => import('./BacktestResultsView');
const importBuyAtCloseSimulator = () => import('./BuyAtCloseSimulator');
const importBuyAtClose4Simulator = () => import('./BuyAtClose4Simulator');
const importNoStopLossSimulator = () => import('./NoStopLossSimulator');
const importOptionsAnalysis = () => import('./OptionsAnalysis');
const importOpenDayDrawdownChart = () => import('./OpenDayDrawdownChart');
const importBuyHoldAnalysis = () => import('./BuyHoldAnalysis');

const BacktestResultsView = lazy(() => importBacktestResultsView().then((m) => ({ default: m.BacktestResultsView })));
const BuyAtCloseSimulator = lazy(() => importBuyAtCloseSimulator().then((m) => ({ default: m.BuyAtCloseSimulator })));
const BuyAtClose4Simulator = lazy(() => importBuyAtClose4Simulator().then((m) => ({ default: m.BuyAtClose4Simulator })));
const NoStopLossSimulator = lazy(() => importNoStopLossSimulator().then((m) => ({ default: m.NoStopLossSimulator })));
const OptionsAnalysis = lazy(() => importOptionsAnalysis().then((m) => ({ default: m.OptionsAnalysis })));
const OpenDayDrawdownChart = lazy(() => importOpenDayDrawdownChart().then((m) => ({ default: m.OpenDayDrawdownChart })));
const BuyHoldAnalysis = lazy(() => importBuyHoldAnalysis().then((m) => ({ default: m.BuyHoldAnalysis })));

// Reusable Intl formatters
const ET_YMD_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit'
});
const MARGIN_PERCENT_OPTIONS = [100, 125, 150, 175, 200] as const;
const MAINTENANCE_MARGIN_OPTIONS = [20, 25, 30, 35, 40] as const;
const DEFAULT_MARGIN_PERCENT = 100;
const DEFAULT_MAINTENANCE_MARGIN_PERCENT = 25;

function ResultsSectionLoader() {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/90 p-4 dark:border-gray-700 dark:bg-gray-900/40">
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-40 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-48 rounded bg-gray-200/80 dark:bg-gray-800" />
      </div>
    </div>
  );
}

function normalizeMarginPercent(value: number): number {
  return MARGIN_PERCENT_OPTIONS.includes(value as (typeof MARGIN_PERCENT_OPTIONS)[number])
    ? value
    : DEFAULT_MARGIN_PERCENT;
}

function normalizeMaintenanceMarginPercent(value: number): number {
  return MAINTENANCE_MARGIN_OPTIONS.includes(value as (typeof MAINTENANCE_MARGIN_OPTIONS)[number])
    ? value
    : DEFAULT_MAINTENANCE_MARGIN_PERCENT;
}

function estimateLiquidationDropPct(leverage: number, maintenanceMarginPct: number): number | null {
  if (!Number.isFinite(leverage) || leverage <= 1) return null;
  const m = maintenanceMarginPct / 100;
  if (m >= 1) return 0;
  const liquidationRatio = ((leverage - 1) / leverage) / (1 - m);
  const dropPct = (1 - liquidationRatio) * 100;
  if (!Number.isFinite(dropPct)) return null;
  return Math.max(0, Math.min(99.99, dropPct));
}

export function SingleTickerPage() {
  const navigate = useNavigate();
  const {
    symbol,
    requestedTicker,
    effectiveSymbol,
    isDataReady,
    marketData,
    backtestResults,
    currentStrategy,
    isLoading,
    storeError,
    quote,
    quoteError,
    quoteLoading,
    isTrading,
    lastUpdatedAt,
    isStale,
    staleInfo,
    refreshing,
    refreshError,
    handleRefresh,
    watching,
    watchBusy,
    setWatching,
    setWatchBusy,
    savedDatasets,
    loadDatasetFromServer,
    runBacktest,
    backtestStatus,
    setSearchParams,
    tradingCalendar
  } = useSingleTickerData();

  const currentSplits = useAppStore((s) => s.currentSplits);
  const resultsQuoteProvider = useAppStore((s) => s.resultsQuoteProvider);
  const analysisTabsConfig = useAppStore((s) => s.analysisTabsConfig);

  const [modal, setModal] = useState<{ type: 'info' | 'error' | null; title?: string; message?: string }>({ type: null });
  const [marginPercent, setMarginPercent] = useState<number>(() => {
    const raw = Number(lsGet<number | string>(LS.RESULTS_MARGIN_PCT, DEFAULT_MARGIN_PERCENT));
    return normalizeMarginPercent(raw);
  });
  const [maintenanceMarginPct, setMaintenanceMarginPct] = useState<number>(() => {
    const raw = Number(lsGet<number | string>(LS.RESULTS_MAINTENANCE_MARGIN, DEFAULT_MAINTENANCE_MARGIN_PERCENT));
    return normalizeMaintenanceMarginPercent(raw);
  });

  type ChartTab = 'summary' | 'price' | 'equity' | 'buyhold' | 'drawdown' | 'trades' | 'profit' | 'duration' | 'openDayDrawdown' | 'buyAtClose' | 'buyAtClose4' | 'noStopLoss' | 'splits' | 'options';

  const visibleAnalysisTabs = useMemo(
    () => [
      { id: 'summary', label: 'Сводка' },
      ...analysisTabsConfig
        .filter((tab) => tab.visible && tab.id !== 'summary')
        .map((tab) => ({ id: tab.id, label: tab.label })),
    ],
    [analysisTabsConfig]
  );

  // Determine active tab
  const firstVisibleTab = useMemo(() => {
    return (visibleAnalysisTabs[0]?.id as ChartTab) || 'summary';
  }, [visibleAnalysisTabs]);

  const [activeChart, setActiveChart] = useState<ChartTab>(firstVisibleTab);
  const [, startChartTransition] = useTransition();
  const [heroChartKind, setHeroChartKind] = useState<'line' | 'candles'>('line');
  const [heroShowTrades, setHeroShowTrades] = useState(true);

  useEffect(() => {
    lsSet(LS.RESULTS_MARGIN_PCT, marginPercent);
  }, [marginPercent]);

  useEffect(() => {
    lsSet(LS.RESULTS_MAINTENANCE_MARGIN, maintenanceMarginPct);
  }, [maintenanceMarginPct]);

  useEffect(() => {
    const hasActiveTab = visibleAnalysisTabs.some((tab) => tab.id === activeChart);
    if (!hasActiveTab) {
      setActiveChart(firstVisibleTab);
    }
  }, [visibleAnalysisTabs, activeChart, firstVisibleTab]);

  const prefetchAnalysisTab = (tabId: string) => {
    if (tabId === 'summary') return;
    if (tabId === 'openDayDrawdown') {
      void importOpenDayDrawdownChart();
      return;
    }
    if (tabId === 'buyAtClose') {
      void importBuyAtCloseSimulator();
      return;
    }
    if (tabId === 'buyAtClose4') {
      void importBuyAtClose4Simulator();
      return;
    }
    if (tabId === 'noStopLoss') {
      void importNoStopLossSimulator();
      return;
    }
    if (tabId === 'options') {
      void importOptionsAnalysis();
      return;
    }
    if (tabId === 'buyhold') {
      void importBuyHoldAnalysis();
      return;
    }

    void importBacktestResultsView().then((module) => {
      module.prefetchBacktestTab(tabId, 'single');
    });
  };

  useEffect(() => {
    if (!backtestResults) return;

    return scheduleIdleTask(() => {
      void importBacktestResultsView().then((module) => {
        module.prefetchBacktestResultsChunks('single');
      });
      void importOpenDayDrawdownChart();
      void importBuyAtCloseSimulator();
      void importBuyAtClose4Simulator();
      void importNoStopLossSimulator();
      void importOptionsAnalysis();
      void importBuyHoldAnalysis();
    }, 1000);
  }, [backtestResults]);

  // Check duplicate dates
  const { hasDuplicateDates, duplicateDateKeys } = useMemo(() => {
    try {
      const dateKeyOf = (v: unknown): string => {
        if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : v;
        if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
        return '';
      };
      const countByKey = new Map<string, number>();
      for (const bar of (marketData || [])) {
        const k = dateKeyOf(bar.date as unknown as string);
        if (!k) continue;
        countByKey.set(k, (countByKey.get(k) || 0) + 1);
      }
      const dup = Array.from(countByKey.entries()).filter(([, c]) => c > 1).map(([k, c]) => `${k}×${c}`);
      return { hasDuplicateDates: dup.length > 0, duplicateDateKeys: dup };
    } catch {
      return { hasDuplicateDates: false, duplicateDateKeys: [] };
    }
  }, [marketData]);

  const initialCapital = Number(currentStrategy?.riskManagement?.initialCapital ?? 10000);
  const leverageMultiplier = marginPercent / 100;
  const currentLiquidationDropPct = estimateLiquidationDropPct(leverageMultiplier, maintenanceMarginPct);
  const liquidationDropByLeverage = useMemo(() => {
    return MARGIN_PERCENT_OPTIONS
      .filter((opt) => opt > 100)
      .map((opt) => {
        const drop = estimateLiquidationDropPct(opt / 100, maintenanceMarginPct);
        return { marginPercent: opt, dropPct: drop };
      });
  }, [maintenanceMarginPct]);
  const lazyFallback = <ResultsSectionLoader />;

  // If not data ready, show Shell with loading or selection
  if (!isDataReady) {
    if (requestedTicker || effectiveSymbol) {
      const displaySymbol = requestedTicker || effectiveSymbol || 'данных';
      const isBusy = isLoading || backtestStatus === 'running';
      return (
        <BacktestPageShell
          isLoading={isBusy}
          loadingMessage={
            isLoading
              ? `Загрузка данных ${displaySymbol}...`
              : (storeError
                ? `Ошибка загрузки ${displaySymbol}`
                : (backtestStatus === 'running' ? 'Запуск бэктеста…' : `Подготовка ${displaySymbol}…`))
          }
          error={null}
        >
          {!isBusy && (
            <div className="max-w-lg mx-auto text-center p-4 border rounded-lg bg-white dark:bg-gray-900 dark:border-gray-800 space-y-3">
              <p className={`text-sm ${storeError ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'}`}>
                {storeError
                  ? String(storeError)
                  : `Автозагрузка данных ${displaySymbol} не завершилась. Повторите попытку.`}
              </p>
              <div className="flex justify-center">
                <Button
                  onClick={() => {
                    if (requestedTicker) loadDatasetFromServer(requestedTicker.toUpperCase());
                    else if (effectiveSymbol) loadDatasetFromServer(effectiveSymbol.toUpperCase());
                    else runBacktest();
                  }}
                  className="mt-1"
                >
                  Повторить загрузку
                </Button>
              </div>
            </div>
          )}
        </BacktestPageShell>
      );
    }

    // No ticker requested -> Selection Menu
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Выберите тикер</h2>
          <p className="text-gray-500 dark:text-gray-400">Выберите актив для анализа и бэктеста</p>
        </div>

        <div className="w-full max-w-xs relative">
          {savedDatasets.length > 0 ? (
            <select
              className="w-full px-4 py-3 pr-8 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition appearance-none cursor-pointer"
              onChange={(e) => {
                if (e.target.value) {
                  setSearchParams({ ticker: e.target.value });
                }
              }}
              defaultValue=""
            >
              <option value="" disabled>Список тикеров...</option>
              {savedDatasets.map(d => (
                <option key={d.ticker} value={d.ticker}>{d.ticker}</option>
              ))}
            </select>
          ) : (
            <div className="text-center p-4 border rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Нет доступных данных</p>
              <Button
                onClick={() => navigate('/data')}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Загрузить данные
              </Button>
            </div>
          )}
          {savedDatasets.length > 0 && (
             <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
             </div>
          )}
        </div>

        {storeError && (
          <div className="text-sm text-red-600 mt-4">{String(storeError)}</div>
        )}
      </div>
    );
  }

  if (!backtestResults) return null;
  const baselineResults = {
    ...backtestResults,
    finalValue: backtestResults.equity.length > 0
      ? backtestResults.equity[backtestResults.equity.length - 1].value
      : initialCapital,
    maxDrawdown: Number(backtestResults.metrics?.maxDrawdown ?? 0)
  };

  const marginSimulation = leverageMultiplier > 1
    ? simulateMarginByTrades({
      marketData: marketData || [],
      trades: baselineResults.trades,
      initialCapital,
      leverage: leverageMultiplier,
      maintenanceMarginPct,
      capitalUsagePct: Number(currentStrategy?.riskManagement?.capitalUsage ?? 100),
    })
    : null;

  const selectedResults = (() => {
    if (!marginSimulation) {
      return baselineResults;
    }

    const metrics = new MetricsCalculator(
      marginSimulation.trades,
      marginSimulation.equity,
      initialCapital
    ).calculateAllMetrics();

    return {
      ...baselineResults,
      trades: marginSimulation.trades,
      equity: marginSimulation.equity,
      metrics,
      finalValue: marginSimulation.finalValue,
      maxDrawdown: marginSimulation.maxDrawdown
    };
  })();
  const maintenanceLiquidationEvents = marginSimulation?.maintenanceLiquidationEvents ?? [];
  const lastMaintenanceLiquidationEvent = maintenanceLiquidationEvents[maintenanceLiquidationEvents.length - 1] ?? null;
  const maintenanceLiquidationDates = maintenanceLiquidationEvents.length
    ? Array.from(
      new Set(maintenanceLiquidationEvents.map((event) => new Date(event.date).toLocaleDateString('ru-RU')))
    ).join(', ')
    : '';

  const comparisonResults = leverageMultiplier > 1 ? baselineResults : null;
  const trades = selectedResults.trades;

  const renderSpecificTab = () => {
    if (activeChart === 'openDayDrawdown') {
        return (
          <ChartContainer>
             <OpenDayDrawdownChart trades={trades} data={marketData || []} />
          </ChartContainer>
        );
    }
    if (activeChart === 'buyAtClose') {
        return <BuyAtCloseSimulator data={marketData || []} strategy={currentStrategy} />;
    }
    if (activeChart === 'buyAtClose4') {
        return <BuyAtClose4Simulator strategy={currentStrategy} />;
    }
    if (activeChart === 'noStopLoss') {
        return <NoStopLossSimulator data={marketData || []} strategy={currentStrategy} />;
    }
    if (activeChart === 'options') {
        return <OptionsAnalysis stockTrades={trades} marketData={marketData || []} />;
    }
    if (activeChart === 'buyhold' && marketData) {
        return <BuyHoldAnalysis marketData={marketData} initialCapital={initialCapital} />;
    }
    return null;
  };

  const openMarginHelp = () => {
    setModal({
      type: 'info',
      title: 'Маржинальность: как читать',
      message: [
        'Маржинальность показывает размер позиции относительно собственного капитала.',
        '100% = без плеча (1.0x), 125% = 1.25x, 150% = 1.5x, 200% = 2.0x.',
        '',
        `Пример: при капитале ${formatCurrencyUSD(initialCapital)} и маржинальности 150% размер позиции ≈ ${formatCurrencyUSD(initialCapital * 1.5)}.`,
        '',
        'Чем выше маржинальность, тем меньше падение цены, при котором достигается брокерская ликвидация.',
        '',
        'Оценка падения до ликвидации при текущем Maintenance Margin:',
        ...liquidationDropByLeverage.map(({ marginPercent: mp, dropPct }) => {
          if (dropPct == null) return `${mp}%: ликвидация не применяется.`;
          return `${mp}% (${(mp / 100).toFixed(2)}x): ликвидация около падения ${dropPct.toFixed(2)}% от цены входа.`;
        }),
      ].join('\n'),
    });
  };

  const openMaintenanceMarginHelp = () => {
    setModal({
      type: 'info',
      title: 'Maintenance Margin: брокерская ликвидация',
      message: [
        'Maintenance Margin (%) — минимальная доля собственных средств в открытой позиции, которую требует брокер.',
        'Если маржинальный уровень падает ниже порога, брокер принудительно закрывает позицию (ликвидация).',
        'После маржин-колла расчет всегда продолжается с оставшимся капиталом.',
        '',
        'Маржинальный уровень:',
        'equity / positionValue, где equity = positionValue - debt.',
        '',
        'Реалистичные значения для акций обычно 20-35%.',
        '25% часто используется как базовый уровень; 30-40% — более консервативно для волатильных бумаг.',
        '',
        `Текущие настройки: маржинальность ${marginPercent}%, maintenance ${maintenanceMarginPct}%.`,
        currentLiquidationDropPct == null
          ? 'При 100% (без плеча) брокерская ликвидация по марже не срабатывает.'
          : `Оценочно ликвидация наступает при падении около ${currentLiquidationDropPct.toFixed(2)}% от цены входа.`,
        '',
        'Пример для 2.0x и maintenance 25%: ликвидация примерно при -33.33% от входа.',
        ...(leverageMultiplier > 1
          ? [
            '',
            'Подсказка по текущим настройкам:',
            `При маржинальности ${marginPercent}% и maintenance ${maintenanceMarginPct}% ликвидация наступает примерно при падении позиции на ${currentLiquidationDropPct != null ? `${currentLiquidationDropPct.toFixed(2)}%` : '—'} от цены входа.`,
            '',
            'Итоговый баланс',
            `100%: ${formatCurrencyUSD(comparisonResults?.finalValue ?? baselineResults.finalValue)}`,
            `${marginPercent}%: ${formatCurrencyUSD(selectedResults.finalValue)}`,
            '',
            'Доходность',
            `100%: ${Number(comparisonResults?.metrics?.totalReturn ?? baselineResults.metrics?.totalReturn ?? 0).toFixed(2)}%`,
            `${marginPercent}%: ${Number(selectedResults.metrics?.totalReturn ?? 0).toFixed(2)}%`,
            '',
            'CAGR',
            `100%: ${Number(comparisonResults?.metrics?.cagr ?? baselineResults.metrics?.cagr ?? 0).toFixed(2)}%`,
            `${marginPercent}%: ${Number(selectedResults.metrics?.cagr ?? 0).toFixed(2)}%`,
            '',
            'Макс. просадка',
            `100%: ${Number(comparisonResults?.maxDrawdown ?? baselineResults.maxDrawdown ?? 0).toFixed(2)}%`,
            `${marginPercent}%: ${Number(selectedResults.maxDrawdown ?? 0).toFixed(2)}%`,
          ]
          : []),
      ].join('\n'),
    });
  };

  const lastTrade = trades[trades.length - 1];
  const lastDataDate = marketData.length ? marketData[marketData.length - 1].date : null;
  const isOpenPosition = !!(lastTrade && lastDataDate && isSameDay(lastTrade.exitDate, lastDataDate));
  const openEntryPrice = isOpenPosition ? lastTrade?.entryPrice ?? null : null;
  const companyNameTarget = (symbol || requestedTicker || '').toUpperCase();
  const companyNameMatch = companyNameTarget
    ? savedDatasets.find((dataset) => (dataset.ticker || '').toUpperCase() === companyNameTarget)
    : null;
  const companyName = typeof companyNameMatch?.companyName === 'string'
    ? companyNameMatch.companyName.trim()
    : '';
  const openProfessionalChart = () => {
    setActiveChart('price');
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        document.getElementById('results-analytics')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  };

  const renderHeroSummarySection = () => (
    <>
      <Panel as="section" className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_240px] lg:grid-cols-[minmax(0,1fr)_280px]">
          <Panel tone="subtle" padding="sm" className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl sm:text-4xl font-black tracking-tight text-gray-900 dark:text-gray-100">
                    {symbol || '—'}
                  </div>
                  {companyName && (
                    <div
                      className="max-w-[20rem] truncate text-sm font-medium text-gray-500 dark:text-gray-400"
                      title={companyName}
                    >
                      {companyName}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <AnimatedPrice
                    value={quote?.current}
                    className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  {(() => {
                    const prev = quote?.prevClose ?? null;
                    const cur = quote?.current ?? null;
                    if (prev == null || cur == null) {
                      return <div className="text-sm text-gray-500">{isTrading ? 'Сегодня' : 'Вне сессии'}</div>;
                    }
                    const delta = cur - prev;
                    const pct = prev !== 0 ? (delta / prev) * 100 : 0;
                    const positive = delta >= 0;
                    const color = positive ? 'text-green-600 dark:text-emerald-300' : 'text-orange-600 dark:text-orange-300';
                    const sign = positive ? '+' : '';
                    return (
                      <div className={`text-sm font-semibold ${color}`}>
                        {`${sign}$${delta.toFixed(2)} (${sign}${pct.toFixed(2)}%)`}{' '}
                        <span className="font-normal text-xs text-gray-800 dark:text-gray-300">{isTrading ? 'Сегодня' : 'С предыдущего закрытия'}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="ml-auto flex items-start gap-1.5">
                <Button
                  onClick={openProfessionalChart}
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full px-2.5 text-[11px]"
                  title="Открыть профессиональный график во вкладке Цена"
                  rightIcon={<ArrowUpRight className="h-3 w-3" />}
                >
                  Pro
                </Button>
                <HeroChartSettingsPopover
                  chartKind={heroChartKind}
                  onChartKindChange={setHeroChartKind}
                  showTrades={heroShowTrades}
                  onShowTradesChange={setHeroShowTrades}
                  buttonSize="sm"
                  iconClassName="h-4 w-4"
                />
                <IconButton
                  disabled={!symbol || watchBusy}
                  onClick={async () => {
                    if (!symbol) return;
                    setWatchBusy(true);
                    try {
                      if (!watching) {
                        await DatasetAPI.registerTelegramWatch({
                          symbol,
                          highIBS: Number(currentStrategy?.parameters?.highIBS ?? 0.75),
                          lowIBS: Number(currentStrategy?.parameters?.lowIBS ?? 0.1),
                          entryPrice: isOpenPosition ? openEntryPrice : null,
                          isOpenPosition,
                        });
                        setWatching(true);
                      } else {
                        await DatasetAPI.deleteTelegramWatch(symbol);
                        setWatching(false);
                      }
                    } catch (e) {
                      const message = e instanceof Error ? e.message : 'Операция не выполнена';
                      setModal({ type: 'error', title: watching ? 'Ошибка удаления' : 'Ошибка добавления', message });
                    } finally {
                      setWatchBusy(false);
                    }
                  }}
                  size="sm"
                  className={watching ? 'border-rose-600 bg-rose-600 text-white hover:bg-rose-600 hover:text-white hover:brightness-110 dark:border-rose-500 dark:bg-rose-500' : ''}
                  title={watching ? 'Удалить из мониторинга' : 'Добавить в мониторинг'}
                  aria-label={watching ? 'Удалить из мониторинга' : 'Добавить в мониторинг'}
                >
                  <Heart className={`h-4 w-4 ${watching ? 'fill-current animate-heartbeat' : ''}`} />
                </IconButton>
                <QuoteDetailsPopover
                  quote={quote}
                  provider={resultsQuoteProvider || 'finnhub'}
                  updatedAt={lastUpdatedAt}
                  buttonSize="sm"
                  buttonClassName="h-6 w-6"
                  iconClassName="h-4 w-4"
                />
              </div>
            </div>

            <HeroLineChart
              data={marketData}
              trades={trades}
              currentPrice={quote?.current ?? null}
              todayQuote={quote ? { open: quote.open, high: quote.high, low: quote.low } : null}
              chartKind={heroChartKind}
              showTrades={heroShowTrades}
              isTrading={isTrading}
              isStale={isStale}
              isUpdating={quoteLoading || refreshing}
            />

            <div className="space-y-2">
              {!isTrading && (
                <div className="text-xs text-gray-500">
                  {(() => {
                    const parseHm = (hm?: string) => {
                      if (!hm || hm.indexOf(':') < 0) return null;
                      const [h, m] = hm.split(':');
                      const H = parseInt(h, 10), M = parseInt(m, 10);
                      return Number.isFinite(H) && Number.isFinite(M) ? { H, M } : null;
                    };
                    const now = new Date();
                    const ymd = ET_YMD_FMT
                      .formatToParts(now)
                      .reduce<Record<string, string>>((acc, p) => {
                        if (p.type !== 'literal') acc[p.type] = p.value;
                        return acc;
                      }, {});
                    const y = String(ymd.year);
                    const md = `${ymd.month}-${ymd.day}`;
                    const shortDays = tradingCalendar?.shortDays as Record<string, Record<string, boolean>> | undefined;
                    const short = !!shortDays?.[y]?.[md];
                    const start = parseHm(tradingCalendar?.tradingHours?.normal?.start) || { H: 9, M: 30 };
                    const endHm = short ? (parseHm(tradingCalendar?.tradingHours?.short?.end) || { H: 13, M: 0 }) : (parseHm(tradingCalendar?.tradingHours?.normal?.end) || { H: 16, M: 0 });
                    const fmt = (x: { H: number; M: number }) => `${String(x.H).padStart(2, '0')}:${String(x.M).padStart(2, '0')}`;
                    return `Показываем в торговые часы (NYSE): ${fmt(start)}–${fmt(endHm)} ET${short ? ' (сокр.)' : ''}`;
                  })()}
                </div>
              )}
            </div>
          </Panel>

          <Panel as="aside" tone="soft" padding="sm" className="space-y-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                Маржинальность стратегии
                <IconButton
                  onClick={openMarginHelp}
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-300"
                  title="Пояснение по маржинальности"
                  aria-label="Пояснение по маржинальности"
                >
                  <HelpCircle className="h-4 w-4" />
                </IconButton>
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Оставлен только один риск-триггер: брокерская ликвидация по Maintenance Margin.
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="results-margin-percent" className="text-xs text-gray-600 dark:text-gray-300">
                  Маржинальность, %
                </label>
                <Select
                  id="results-margin-percent"
                  value={marginPercent}
                  onChange={(e) => setMarginPercent(normalizeMarginPercent(Number(e.target.value)))}
                  className="mt-1 px-3 py-2"
                >
                  {MARGIN_PERCENT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}%
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <label htmlFor="results-maintenance-margin" className="text-xs text-gray-600 dark:text-gray-300">
                    Maintenance Margin, %
                  </label>
                  <IconButton
                    onClick={openMaintenanceMarginHelp}
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-300"
                    title="Пояснение по Maintenance Margin"
                    aria-label="Пояснение по Maintenance Margin"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </IconButton>
                </div>
                <Select
                  id="results-maintenance-margin"
                  value={maintenanceMarginPct}
                  onChange={(e) => setMaintenanceMarginPct(normalizeMaintenanceMarginPercent(Number(e.target.value)))}
                  className="mt-1 px-3 py-2"
                >
                  {MAINTENANCE_MARGIN_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}%
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-100">
              <div className="text-[11px] uppercase tracking-wide text-blue-700 dark:text-blue-300">Текущий риск-профиль</div>
              <div className="mt-1 font-semibold">{marginPercent}% ({leverageMultiplier.toFixed(2)}x)</div>
              <div className="mt-1 text-xs text-blue-800 dark:text-blue-200">
                {currentLiquidationDropPct == null
                  ? 'При 100% (без плеча) ликвидация по марже не срабатывает.'
                  : `Оценка ликвидации: падение около ${currentLiquidationDropPct.toFixed(2)}% от цены входа.`}
              </div>
            </div>

            {lastMaintenanceLiquidationEvent && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
                <div className="font-semibold">
                  Ликвидация по Maintenance Margin ({maintenanceMarginPct}%)
                </div>
                <div className="mt-1">
                  Дата: {new Date(lastMaintenanceLiquidationEvent.date).toLocaleDateString('ru-RU')}, падение позиции {lastMaintenanceLiquidationEvent.positionDropPct.toFixed(2)}%, маржинальный уровень {(lastMaintenanceLiquidationEvent.marginRatioAtTrigger * 100).toFixed(2)}%.
                </div>
                <div className="mt-1 text-xs">
                  Срабатываний: {maintenanceLiquidationEvents.length}. Даты: {maintenanceLiquidationDates}. Остаток капитала: {formatCurrencyUSD(lastMaintenanceLiquidationEvent.remainingCapital)}.
                </div>
              </div>
            )}

            {isStale && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                <div className="flex items-start justify-between gap-2">
                  <div>Данные не актуальны{staleInfo ? ` — ${staleInfo}` : ''}</div>
                  <IconButton
                    onClick={handleRefresh}
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 shrink-0 border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200 hover:text-amber-900 dark:border-amber-900/60 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50"
                    title="Обновить данные"
                    aria-label="Обновить данные"
                    disabled={refreshing}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
                {refreshError && <div className="mt-1 text-red-600">{refreshError}</div>}
              </div>
            )}

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
          </Panel>
        </div>
        {quoteError && <div className="mt-3 text-sm text-red-600">{quoteError}</div>}
      </Panel>
    </>
  );

  const handleChartTabChange = (nextTabId: string) => {
    const nextTab = nextTabId as ChartTab;
    if (nextTab === activeChart) return;
    startChartTransition(() => {
      setActiveChart(nextTab);
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-6">
        <div className="space-y-6">
          {hasDuplicateDates && (
            <div className="rounded-lg border p-3 bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-200">
              Дубли дат в данных: {duplicateDateKeys.join(', ')}
            </div>
          )}
          <Panel as="section" id="results-analytics" className="p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">
                Ключевые метрики
              </h2>
              {marginPercent > 100 && (
                <div className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/20 dark:text-indigo-300">
                  Сравнение 100% vs {marginPercent}% доступно в аналитике
                </div>
              )}
            </div>
            <MetricsGrid
              finalValue={selectedResults.finalValue}
              maxDrawdown={selectedResults.maxDrawdown}
              metrics={selectedResults.metrics}
            />
          </Panel>

          <Panel as="section" className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">Аналитика сделок</h2>
            </div>

            <AnalysisTabs
              tabs={visibleAnalysisTabs}
              activeTab={activeChart}
              onChange={handleChartTabChange}
              onTabIntent={prefetchAnalysisTab}
              className="mb-4"
            />

            <div className="min-h-[420px]">
              {activeChart === 'summary' ? (
                renderHeroSummarySection()
              ) : (
                <Suspense fallback={lazyFallback}>
                  {renderSpecificTab() || (
                    <BacktestResultsView
                      mode="single"
                      activeTab={activeChart}
                      backtestResults={selectedResults}
                      comparisonBacktestResults={comparisonResults}
                      primarySeriesLabel={marginPercent > 100 ? `С маржей ${marginPercent}%` : 'Без маржи (100%)'}
                      comparisonSeriesLabel="Без маржи (100%)"
                      marketData={marketData}
                      currentSplits={currentSplits}
                      symbol={symbol}
                      strategy={currentStrategy}
                      initialCapital={initialCapital}
                    />
                  )}
                </Suspense>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <InfoModal open={modal.type != null} title={modal.title || ''} message={modal.message || ''} onClose={() => setModal({ type: null })} kind={modal.type === 'error' ? 'error' : 'info'} />
    </div>
  );
}
