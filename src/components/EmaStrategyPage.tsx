import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { AnalysisTabs, Button, ChartContainer, Input, PageHeader, Panel, Select, TickerInput } from './ui';
import { MetricsGrid } from './ui/MetricsGrid';
import { LS } from '../constants';
import type { EmaSignalSource, EmaZone, MultiTickerBacktestResults } from '../types';
import { lsGet, lsSet } from '../lib/storage';
import { useMultiTickerData } from '../hooks/useMultiTickerData';
import { runEmaZoneBacktest, type EmaZoneBacktestResult } from '../lib/ema-zone-strategy';
import { BacktestPageShell } from './BacktestPageShell';
import { TabContentLoader } from './ui/TabContentLoader';
import { TradingChart } from './TradingChart';
import { EmaDeviationChart } from './EmaDeviationChart';

const importBacktestResultsView = () => import('./BacktestResultsView');
const BacktestResultsView = lazy(() => importBacktestResultsView().then((module) => ({ default: module.BacktestResultsView })));

interface EmaSettings {
  emaPeriod: number;
  leveragePercent: number;
  takeProfit: string;
  noSellAtLoss: boolean;
  signalSource: EmaSignalSource;
  buyZones: EmaZone[];
  sellZones: EmaZone[];
}

const DEFAULT_BUY_ZONES: EmaZone[] = [{ id: 'buy-20', levelPct: -20, enabled: true }];
const DEFAULT_SELL_ZONES: EmaZone[] = [{ id: 'sell-40', levelPct: 40, enabled: true }];

function parseTickersInput(value: string): string[] {
  return value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
}

function parseTakeProfit(value: string): number | null {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function makeZone(side: 'buy' | 'sell', levelPct: number): EmaZone {
  return { id: `${side}-${Date.now()}-${Math.random().toString(16).slice(2)}`, levelPct, enabled: true };
}

function normalizeSettings(value: Partial<EmaSettings> | null): EmaSettings {
  return {
    emaPeriod: value?.emaPeriod === 20 ? 20 : 200,
    leveragePercent: Number.isFinite(value?.leveragePercent) ? Number(value?.leveragePercent) : 100,
    takeProfit: typeof value?.takeProfit === 'string' ? value.takeProfit : '',
    noSellAtLoss: value?.noSellAtLoss ?? false,
    signalSource: value?.signalSource === 'intraday' ? 'intraday' : 'close',
    buyZones: Array.isArray(value?.buyZones) && value.buyZones.length ? value.buyZones : DEFAULT_BUY_ZONES,
    sellZones: Array.isArray(value?.sellZones) && value.sellZones.length ? value.sellZones : DEFAULT_SELL_ZONES,
  };
}

function ZoneEditor({
  title,
  zones,
  onChange,
  defaultLevel,
}: {
  title: string;
  zones: EmaZone[];
  onChange: (zones: EmaZone[]) => void;
  defaultLevel: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">{title}</div>
        <button
          type="button"
          onClick={() => onChange([...zones, makeZone(defaultLevel < 0 ? 'buy' : 'sell', defaultLevel)])}
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-gray-300 text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          title="Добавить зону"
          aria-label="Добавить зону"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-1.5">
        {zones.map((zone) => (
          <div key={zone.id} className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
            <input
              type="checkbox"
              checked={zone.enabled}
              onChange={(event) => onChange(zones.map((item) => item.id === zone.id ? { ...item, enabled: event.target.checked } : item))}
              className="h-4 w-4 accent-blue-600"
              aria-label="Включить зону"
            />
            <Input
              type="number"
              step={1}
              value={zone.levelPct}
              onChange={(event) => onChange(zones.map((item) => item.id === zone.id ? { ...item, levelPct: Number(event.target.value) } : item))}
            />
            <button
              type="button"
              onClick={() => onChange(zones.filter((item) => item.id !== zone.id))}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 text-gray-500 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              title="Удалить зону"
              aria-label="Удалить зону"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmaStrategyPage() {
  const savedTickers = lsGet<string[]>(LS.EMA_TICKERS, ['TQQQ']);
  const savedSettings = normalizeSettings(lsGet<Partial<EmaSettings> | null>(LS.EMA_SETTINGS, null));
  const [tickers, setTickers] = useState<string[]>(savedTickers.length ? savedTickers : ['TQQQ']);
  const [tickersInput, setTickersInput] = useState<string>((savedTickers.length ? savedTickers : ['TQQQ']).join(', '));
  const [selectedTicker, setSelectedTicker] = useState<string>(() => lsGet<string>(LS.EMA_SELECTED_TICKER, 'TQQQ'));
  const [settings, setSettings] = useState<EmaSettings>(savedSettings);
  const [activeTab, setActiveTab] = useState('summary');
  const [selectedTradeTicker, setSelectedTradeTicker] = useState<'all' | string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EmaZoneBacktestResult | null>(null);
  const [comparisonResult, setComparisonResult] = useState<MultiTickerBacktestResults | null>(null);
  const hasAutoRun = useRef(false);

  const {
    tickersData,
    setTickersData,
    loadTickerData,
    handleRefreshTicker,
    refreshingTickers,
    isDataOutdated,
  } = useMultiTickerData();

  useEffect(() => { lsSet(LS.EMA_TICKERS, tickers); }, [tickers]);
  useEffect(() => { lsSet(LS.EMA_SETTINGS, settings); }, [settings]);
  useEffect(() => { lsSet(LS.EMA_SELECTED_TICKER, selectedTicker); }, [selectedTicker]);

  useEffect(() => {
    if (tickers.length > 0 && !tickers.includes(selectedTicker)) {
      setSelectedTicker(tickers[0]);
    }
  }, [selectedTicker, tickers]);

  const tabs = useMemo(() => {
    const base = [{ id: 'summary', label: 'Сводка' }];
    if (!result) return base;
    return [
      ...base,
      { id: 'price', label: 'Цены' },
      { id: 'emaDeviation', label: 'Отклонение от EMA' },
      { id: 'equity', label: 'Капитал' },
      { id: 'exposure', label: 'Экспозиция' },
      { id: 'drawdown', label: 'Просадка' },
      { id: 'trades', label: 'Сделки' },
      { id: 'profit', label: 'Профит-фактор' },
      { id: 'duration', label: 'Длительность' },
      { id: 'spreads', label: 'Спреды' },
    ];
  }, [result]);

  const runBacktest = async (overrideTickers?: string[]) => {
    const tickersToRun = overrideTickers ?? tickers;
    setIsLoading(true);
    setError(null);

    try {
      const loaded = await Promise.all(tickersToRun.map((ticker) => loadTickerData(ticker)));
      if (!loaded.length) throw new Error('Нет данных для выбранных тикеров');
      setTickersData(loaded);

      const source = loaded.map((item) => ({ ticker: item.ticker, data: item.data }));
      const leverage = settings.leveragePercent / 100;
      const params = {
        initialCapital: 10000,
        leverage,
        emaPeriod: settings.emaPeriod,
        buyZones: settings.buyZones,
        sellZones: settings.sellZones,
        takeProfitPercent: parseTakeProfit(settings.takeProfit),
        noSellAtLoss: settings.noSellAtLoss,
        signalSource: settings.signalSource,
      };
      const nextResult = runEmaZoneBacktest(source, params);
      const nextComparison = leverage > 1
        ? runEmaZoneBacktest(source, { ...params, leverage: 1 })
        : null;

      setResult(nextResult);
      setComparisonResult(nextComparison);
      setSelectedTradeTicker('all');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка расчета EMA-стратегии');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (hasAutoRun.current) return;
    hasAutoRun.current = true;
    void runBacktest();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedTickerData = tickersData.find((item) => item.ticker === selectedTicker);

  const renderSummary = () => (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel tone="subtle" padding="sm" className="space-y-3">
        {result ? (
          <MetricsGrid finalValue={result.finalValue} maxDrawdown={result.maxDrawdown} metrics={result.metrics} />
        ) : (
          <div className="flex h-72 items-center justify-center text-gray-500">Запустите расчет EMA-стратегии</div>
        )}
      </Panel>
      <Panel as="aside" tone="soft" padding="sm" className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Тикеры</label>
          <TickerInput
            value={tickersInput}
            onChange={setTickersInput}
            tickers={tickers}
            onTickersChange={(next) => {
              setTickers(next);
              setTickersInput(next.join(', '));
            }}
            showBadges={false}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">EMA</label>
            <Select value={settings.emaPeriod} onChange={(event) => setSettings((prev) => ({ ...prev, emaPeriod: Number(event.target.value) }))}>
              <option value={20}>EMA 20</option>
              <option value={200}>EMA 200</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Маржинальность</label>
            <Select value={settings.leveragePercent} onChange={(event) => setSettings((prev) => ({ ...prev, leveragePercent: Number(event.target.value) }))}>
              {[100, 125, 150, 175, 200, 225, 250, 275, 300].map((value) => (
                <option key={value} value={value}>{value}%</option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Данные входа/выхода</label>
          <Select value={settings.signalSource} onChange={(event) => setSettings((prev) => ({ ...prev, signalSource: event.target.value as EmaSignalSource }))}>
            <option value="close">Закрытие свечи</option>
            <option value="intraday">High/Low внутри свечи</option>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Take profit, %</label>
          <Input
            type="number"
            min={0}
            step={0.1}
            value={settings.takeProfit}
            onChange={(event) => setSettings((prev) => ({ ...prev, takeProfit: event.target.value }))}
            placeholder="Пусто выключает"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={settings.noSellAtLoss}
            onChange={(event) => setSettings((prev) => ({ ...prev, noSellAtLoss: event.target.checked }))}
            className="h-4 w-4 accent-blue-600"
          />
          Не продавать в минус
        </label>

        <ZoneEditor
          title="Зоны покупки, % от EMA"
          zones={settings.buyZones}
          defaultLevel={-20}
          onChange={(buyZones) => setSettings((prev) => ({ ...prev, buyZones }))}
        />
        <ZoneEditor
          title="Зоны продажи, % от EMA"
          zones={settings.sellZones}
          defaultLevel={40}
          onChange={(sellZones) => setSettings((prev) => ({ ...prev, sellZones }))}
        />

        <Button
          variant="primary"
          size="md"
          className="w-full"
          isLoading={isLoading}
          disabled={isLoading || tickers.length === 0}
          onClick={() => {
            const nextTickers = parseTickersInput(tickersInput);
            setTickers(nextTickers);
            void runBacktest(nextTickers);
          }}
        >
          Запустить EMA-бэктест
        </Button>
      </Panel>
    </div>
  );

  const renderSpreads = () => (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-900">
          <tr>
            <th className="px-4 py-2 text-left font-semibold text-gray-700 dark:text-gray-200">Покупка</th>
            <th className="px-4 py-2 text-left font-semibold text-gray-700 dark:text-gray-200">Продажа</th>
            <th className="px-4 py-2 text-left font-semibold text-gray-700 dark:text-gray-200">Расстояние</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {settings.buyZones.filter((zone) => zone.enabled).flatMap((buyZone) =>
            settings.sellZones.filter((zone) => zone.enabled).map((sellZone) => (
              <tr key={`${buyZone.id}-${sellZone.id}`}>
                <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{buyZone.levelPct}%</td>
                <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{sellZone.levelPct}%</td>
                <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">{(sellZone.levelPct - buyZone.levelPct).toFixed(2)} п.п.</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <Panel as="section" padding="md">
        <PageHeader className="mb-0" title="EMA" subtitle="Симулятор торговли по отклонению цены от EMA" />
      </Panel>

      <BacktestPageShell isLoading={isLoading && !result} error={error} loadingMessage="Расчет EMA-стратегии...">
        <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <AnalysisTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
          <div className="min-h-[420px] p-4">
            {activeTab === 'summary' && renderSummary()}

            {result && activeTab === 'price' && (
              <ChartContainer height={680}>
                <TradingChart
                  data={selectedTickerData?.data ?? []}
                  trades={result.trades}
                  ticker={selectedTicker}
                  splits={selectedTickerData?.splits}
                  isVisible={activeTab === 'price'}
                  toolbarPrefix={tickers.length > 1 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {tickers.map((ticker) => (
                        <button
                          key={ticker}
                          type="button"
                          onClick={() => setSelectedTicker(ticker)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                            ticker === selectedTicker
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                          }`}
                        >
                          {ticker}
                        </button>
                      ))}
                    </div>
                  ) : undefined}
                />
              </ChartContainer>
            )}

            {result && activeTab === 'emaDeviation' && (
              <ChartContainer title="Отклонение от EMA" height={620}>
                <EmaDeviationChart
                  data={result.deviation}
                  trades={result.trades}
                  buyZones={settings.buyZones}
                  sellZones={settings.sellZones}
                  ticker={selectedTicker}
                />
              </ChartContainer>
            )}

            {result && activeTab === 'spreads' && renderSpreads()}

            {result && !['summary', 'price', 'emaDeviation', 'spreads'].includes(activeTab) && (
              <Suspense fallback={<TabContentLoader />}>
                <BacktestResultsView
                  mode="multi"
                  activeTab={activeTab}
                  backtestResults={result}
                  comparisonBacktestResults={comparisonResult}
                  primarySeriesLabel={`${settings.leveragePercent}%`}
                  comparisonSeriesLabel="Без маржи (100%)"
                  tickersData={tickersData}
                  strategy={null}
                  handlers={{
                    selectedTradeTicker,
                    setSelectedTradeTicker,
                    isDataOutdated,
                    handleRefreshTicker,
                    refreshingTickers,
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
