import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { AnalysisTabs, Button, ChartContainer, IconButton, Input, PageHeader, Panel, Select, TickerInput } from './ui';
import { MetricsGrid } from './ui/MetricsGrid';
import { LS } from '../constants';
import type { EmaSignalSource, EmaStartMode, EmaZone, MultiTickerBacktestResults } from '../types';
import { lsGet, lsSet } from '../lib/storage';
import { useMultiTickerData } from '../hooks/useMultiTickerData';
import { runEmaZoneBacktest, type EmaZoneBacktestResult } from '../lib/ema-zone-strategy';
import { BacktestPageShell } from './BacktestPageShell';
import { TabContentLoader } from './ui/TabContentLoader';
import { TradingChart } from './TradingChart';
import { EmaDeviationChart } from './EmaDeviationChart';
import { HeroLineChart } from './HeroLineChart';

const importBacktestResultsView = () => import('./BacktestResultsView');
const BacktestResultsView = lazy(() => importBacktestResultsView().then((module) => ({ default: module.BacktestResultsView })));

interface EmaSettings {
  emaPeriod: number;
  leveragePercent: number;
  takeProfit: string;
  noSellAtLoss: boolean;
  signalSource: EmaSignalSource;
  emaStartMode: EmaStartMode;
  buyZones: EmaZone[];
  sellZones: EmaZone[];
}

const DEFAULT_BUY_ZONES: EmaZone[] = [{ id: 'buy-20', levelPct: -20, enabled: true }];
const DEFAULT_SELL_ZONES: EmaZone[] = [{ id: 'sell-40', levelPct: 40, enabled: true }];

// Snapshot of the params that actually produced the current `result`, so the
// deviation chart lines, markers and equity labels always match the displayed
// trades/metrics even after the user edits a zone before re-running.
interface EmaRunParams {
  tickers: string[];
  emaPeriod: number;
  leveragePercent: number;
  // Parsed take-profit (number | null) so equivalent strings ("" vs "0",
  // "5" vs "5.0") don't trigger a false-positive stale badge.
  takeProfit: number | null;
  noSellAtLoss: boolean;
  signalSource: EmaSignalSource;
  emaStartMode: EmaStartMode;
  buyZones: EmaZone[];
  sellZones: EmaZone[];
}

function snapshotRunParams(settings: EmaSettings, tickers: string[]): EmaRunParams {
  return {
    tickers,
    emaPeriod: settings.emaPeriod,
    leveragePercent: settings.leveragePercent,
    takeProfit: parseTakeProfit(settings.takeProfit),
    noSellAtLoss: settings.noSellAtLoss,
    signalSource: settings.signalSource,
    emaStartMode: settings.emaStartMode,
    buyZones: settings.buyZones,
    sellZones: settings.sellZones,
  };
}

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
    emaStartMode: value?.emaStartMode === 'from_start' ? 'from_start' : 'full_history',
    buyZones: Array.isArray(value?.buyZones) && value.buyZones.length ? value.buyZones : DEFAULT_BUY_ZONES,
    sellZones: Array.isArray(value?.sellZones) && value.sellZones.length ? value.sellZones : DEFAULT_SELL_ZONES,
  };
}

interface EmaPreset {
  id: string;
  name: string;
  tickers: string[];
  settings: EmaSettings;
}

// Shallow-clone each zone object so a preset never shares zone references with
// the live settings (editing a zone after save/apply must not mutate the store).
function cloneZones(zones: EmaZone[]): EmaZone[] {
  return zones.map((zone) => ({ ...zone }));
}

// Drop malformed presets from persisted storage (bad id/name/tickers/settings).
function sanitizePresets(value: unknown): EmaPreset[] {
  if (!Array.isArray(value)) return [];
  const result: EmaPreset[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Partial<EmaPreset>;
    if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string') continue;
    if (!Array.isArray(candidate.tickers) || !candidate.tickers.every((t) => typeof t === 'string')) continue;
    if (!candidate.settings || typeof candidate.settings !== 'object') continue;
    result.push({
      id: candidate.id,
      name: candidate.name,
      tickers: [...candidate.tickers],
      settings: candidate.settings as EmaSettings,
    });
  }
  return result;
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
  // Per-row raw edit buffer so the field can be cleared/typed ("-", "") without
  // snapping to 0 or pushing NaN into params/spreads/price-lines. We only commit
  // a parsed number to the model when the current text is a finite number.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const handleLevelChange = (id: string, raw: string) => {
    setDrafts((prev) => ({ ...prev, [id]: raw }));
    const parsed = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(parsed)) {
      onChange(zones.map((item) => (item.id === id ? { ...item, levelPct: parsed } : item)));
    }
  };

  const handleLevelBlur = (id: string) => {
    // Drop the draft so the field falls back to the committed numeric value.
    setDrafts((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">{title}</div>
        <IconButton
          variant="outline"
          size="sm"
          onClick={() => onChange([...zones, makeZone(defaultLevel < 0 ? 'buy' : 'sell', defaultLevel)])}
          title="Добавить зону"
          aria-label="Добавить зону"
        >
          <Plus className="h-3.5 w-3.5" />
        </IconButton>
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
            <div className="relative">
              <Input
                type="number"
                step={1}
                className="pr-7"
                aria-label="Уровень зоны, %"
                value={drafts[zone.id] ?? String(zone.levelPct)}
                onChange={(event) => handleLevelChange(zone.id, event.target.value)}
                onBlur={() => handleLevelBlur(zone.id)}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-400 dark:text-gray-500">%</span>
            </div>
            <IconButton
              variant="outline"
              size="sm"
              onClick={() => onChange(zones.filter((item) => item.id !== zone.id))}
              title="Удалить зону"
              aria-label="Удалить зону"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmaStrategyPage() {
  const [tickers, setTickers] = useState<string[]>(() => {
    const saved = lsGet<string[]>(LS.EMA_TICKERS, ['TQQQ']);
    return saved.length ? saved : ['TQQQ'];
  });
  const [tickersInput, setTickersInput] = useState<string>(() => {
    const saved = lsGet<string[]>(LS.EMA_TICKERS, ['TQQQ']);
    return (saved.length ? saved : ['TQQQ']).join(', ');
  });
  const [selectedTicker, setSelectedTicker] = useState<string>(() => lsGet<string>(LS.EMA_SELECTED_TICKER, 'TQQQ'));
  const [settings, setSettings] = useState<EmaSettings>(() => normalizeSettings(lsGet<Partial<EmaSettings> | null>(LS.EMA_SETTINGS, null)));
  const [runParams, setRunParams] = useState<EmaRunParams | null>(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [selectedTradeTicker, setSelectedTradeTicker] = useState<'all' | string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EmaZoneBacktestResult | null>(null);
  const [comparisonResult, setComparisonResult] = useState<MultiTickerBacktestResults | null>(null);
  const [presets, setPresets] = useState<EmaPreset[]>(() => sanitizePresets(lsGet<EmaPreset[]>(LS.EMA_PRESETS, [])));
  const [presetName, setPresetName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
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
  useEffect(() => { lsSet(LS.EMA_PRESETS, presets); }, [presets]);

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
      { id: 'emaDeviation', label: 'Отклонение' },
      { id: 'equity', label: 'Капитал' },
      { id: 'exposure', label: 'Экспозиция' },
      { id: 'drawdown', label: 'Просадка' },
      { id: 'trades', label: 'Сделки' },
      { id: 'profit', label: 'Профит-фактор' },
      { id: 'duration', label: 'Длительность' },
      { id: 'spreads', label: 'Спреды' },
    ];
  }, [result]);

  // The result reflects `runParams`; if the editable settings/tickers now differ,
  // the chart lines and metrics are out of sync until the user re-runs.
  const isStale = useMemo(() => {
    if (!result || !runParams) return false;
    return JSON.stringify(snapshotRunParams(settings, tickers)) !== JSON.stringify(runParams);
  }, [result, runParams, settings, tickers]);

  // Zones/leverage that actually produced `result` — used for the deviation chart
  // and the equity label so they never drift ahead of the displayed trades.
  const displayBuyZones = runParams?.buyZones ?? settings.buyZones;
  const displaySellZones = runParams?.sellZones ?? settings.sellZones;
  const displayEmaPeriod = runParams?.emaPeriod ?? settings.emaPeriod;
  const displayEmaStartMode = runParams?.emaStartMode ?? settings.emaStartMode;
  const displayLeveragePercent = runParams?.leveragePercent ?? settings.leveragePercent;

  const prefetchAnalysisTab = (tabId: string) => {
    if (['summary', 'price', 'emaDeviation', 'spreads'].includes(tabId)) return;
    void importBacktestResultsView();
  };

  const runBacktest = async (overrideTickers?: string[]) => {
    const tickersToRun = overrideTickers ?? tickers;
    setIsLoading(true);
    setError(null);

    try {
      const loaded = await Promise.all(tickersToRun.map((ticker) => loadTickerData(ticker)));
      if (!loaded.length) throw new Error('Нет данных для выбранных тикеров');
      setTickersData(loaded);

      const source = loaded.map((item) => ({
        ticker: item.ticker,
        data: item.holderData && item.holderData.length ? item.holderData : item.data,
        rawData: item.rawData,
      }));
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
        emaStartMode: settings.emaStartMode,
      };
      const nextResult = runEmaZoneBacktest(source, params);
      const nextComparison = leverage > 1
        ? runEmaZoneBacktest(source, { ...params, leverage: 1 })
        : null;

      setResult(nextResult);
      setComparisonResult(nextComparison);
      setRunParams(snapshotRunParams(settings, tickersToRun));
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

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    // Deep-copy zones so later edits to `settings` don't mutate the stored preset.
    const snapshot: EmaSettings = {
      ...settings,
      buyZones: cloneZones(settings.buyZones),
      sellZones: cloneZones(settings.sellZones),
    };
    const snapshotTickers = [...tickers];
    let savedId = '';
    setPresets((prev) => {
      const existing = prev.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
      if (existing) {
        savedId = existing.id;
        return prev.map((p) =>
          p.id === existing.id ? { ...p, name, tickers: snapshotTickers, settings: snapshot } : p
        );
      }
      savedId = `preset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      return [...prev, { id: savedId, name, tickers: snapshotTickers, settings: snapshot }];
    });
    setSelectedPresetId(savedId);
    setPresetName('');
  };

  const handleApplyPreset = (id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    // normalizeSettings guards malformed stored fields; clone zones so edits stay local.
    const applied = normalizeSettings({
      ...preset.settings,
      buyZones: cloneZones(preset.settings.buyZones ?? []),
      sellZones: cloneZones(preset.settings.sellZones ?? []),
    });
    const appliedTickers = [...preset.tickers];
    setSettings(applied);
    setTickers(appliedTickers);
    setTickersInput(appliedTickers.join(', '));
    setSelectedPresetId(id);
    void runBacktest(appliedTickers);
  };

  const handleDeletePreset = () => {
    if (!selectedPresetId) return;
    setPresets((prev) => prev.filter((p) => p.id !== selectedPresetId));
    setSelectedPresetId('');
  };

  const selectedTickerData = tickersData.find((item) => item.ticker === selectedTicker);

  // The backtest runs on holder-value prices (item.holderData ?? item.data), and
  // the deviation series is built from them too. Feed the price chart the SAME
  // series so its EMA line, zone bands and trade markers line up with the trades
  // and the "Отклонение" tab — the back-adjusted `data` basis drifts around split
  // boundaries and makes buys look like they sit on the EMA.
  const priceChartData = selectedTickerData?.holderData?.length
    ? selectedTickerData.holderData
    : selectedTickerData?.data ?? [];

  const renderSummary = () => (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel tone="subtle" padding="sm" className="space-y-3">
        {result ? (
          <>
            {tickers.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {tickers.map((ticker) => (
                  <button
                    key={ticker}
                    type="button"
                    onClick={() => setSelectedTicker(ticker)}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                      ticker === selectedTicker
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {ticker}
                  </button>
                ))}
              </div>
            )}
            <HeroLineChart
              data={priceChartData}
              trades={result.trades}
              showTrades
            />
          </>
        ) : (
          <div className="flex h-72 items-center justify-center text-gray-500">Запустите расчет EMA-стратегии</div>
        )}
      </Panel>
      <Panel as="aside" tone="soft" padding="sm" className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Пресеты</label>
          <div className="flex items-center gap-2">
            <Select
              value={selectedPresetId}
              onChange={(event) => handleApplyPreset(event.target.value)}
            >
              <option value="" disabled>— Выбрать пресет —</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </Select>
            <IconButton
              variant="outline"
              size="sm"
              onClick={handleDeletePreset}
              disabled={!selectedPresetId}
              title="Удалить пресет"
              aria-label="Удалить пресет"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={presetName}
              onChange={(event) => setPresetName(event.target.value)}
              placeholder="Название пресета"
            />
            <Button
              size="sm"
              onClick={handleSavePreset}
              disabled={!presetName.trim()}
            >
              Сохранить
            </Button>
          </div>
        </div>

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
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Сигнал входа/выхода</label>
          <Select value={settings.signalSource} onChange={(event) => setSettings((prev) => ({ ...prev, signalSource: event.target.value as EmaSignalSource }))}>
            <option value="close">По закрытию свечи</option>
            <option value="intraday">Касание внутри дня (вход по закрытию)</option>
          </Select>
          <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
            «Касание» активирует зону, если её задела тень свечи; сделка всё равно исполняется по закрытию дня.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Старт EMA</label>
          <Select value={settings.emaStartMode} onChange={(event) => setSettings((prev) => ({ ...prev, emaStartMode: event.target.value as EmaStartMode }))}>
            <option value="full_history">После полной истории ({settings.emaPeriod} дней)</option>
            <option value="from_start">С самого начала графика</option>
          </Select>
          <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
            «После полной истории» — сделки только когда накоплено {settings.emaPeriod} баров (реальная EMA {settings.emaPeriod}). «С самого начала» — EMA растёт с первой свечи, сделки могут начаться сразу.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Тейк-профит</label>
          <p className="mb-1 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
            Досрочный выход, если максимум дня достиг процента прибыли от цены входа. Пусто или 0 выключает условие.
          </p>
          <Input
            type="number"
            min={0}
            step={0.1}
            inputMode="decimal"
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

        {isStale && (
          <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-400">
            Параметры изменены — обновите расчёт
          </p>
        )}
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
          {displayBuyZones.filter((zone) => zone.enabled).flatMap((buyZone) =>
            displaySellZones.filter((zone) => zone.enabled).map((sellZone) => (
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

      <BacktestPageShell isLoading={false} error={error} loadingMessage="Расчет EMA-стратегии...">
        {result && (
          <MetricsGrid finalValue={result.finalValue} maxDrawdown={result.maxDrawdown} metrics={result.metrics} />
        )}

        <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <AnalysisTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} onTabIntent={prefetchAnalysisTab} />
          <div className="min-h-[420px] p-4">
            {activeTab === 'summary' && renderSummary()}

            {result && activeTab === 'price' && (
              <ChartContainer height={680}>
                <TradingChart
                  data={priceChartData}
                  trades={result.trades}
                  ticker={selectedTicker}
                  splits={selectedTickerData?.splits}
                  isVisible={activeTab === 'price'}
                  emaZones={{ emaPeriod: displayEmaPeriod, startMode: displayEmaStartMode, buyZones: displayBuyZones, sellZones: displaySellZones }}
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
                  buyZones={displayBuyZones}
                  sellZones={displaySellZones}
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
                  primarySeriesLabel={`${displayLeveragePercent}%`}
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
