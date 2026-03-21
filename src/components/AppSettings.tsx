import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { DatasetAPI } from '../lib/api';
import { useAppStore } from '../stores';
import { sanitizeNumericInput, sanitizeTextInput, VALIDATION_CONSTRAINTS } from '../lib/input-validation';
import { Info, X, Save, Loader2, Check } from 'lucide-react';
import type { AutoTradingConfig } from '../types';
import { PageHeader } from './ui/PageHeader';
// import { StrategySettings } from './StrategySettings';

// SettingsData interface removed - not actively used

interface AutotradeTabProps {
  autotradeConfig: AutoTradingConfig | null;
  autotradeLoading: boolean;
  autotradeToggling: boolean;
  autotradeError: string | null;
  autotradeOk: string | null;
  onLoad: () => void;
  onToggle: () => void;
  onChangeProvider: (p: string) => void;
}

function ToggleSwitch({ checked, onChange, disabled = false }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function AutotradeTab({
  autotradeConfig,
  autotradeLoading,
  autotradeToggling,
  autotradeError,
  autotradeOk,
  onLoad,
  onToggle,
  onChangeProvider,
}: AutotradeTabProps) {
  useEffect(() => {
    if (!autotradeConfig && !autotradeLoading) {
      onLoad();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Local pending state — changes accumulate until Save is clicked
  const [pendingEnabled, setPendingEnabled] = useState<boolean | null>(null);
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);

  // Sync pending state when config loads
  useEffect(() => {
    if (autotradeConfig) {
      setPendingEnabled(prev => prev === null ? autotradeConfig.enabled : prev);
      setPendingProvider(prev => prev === null ? (autotradeConfig.provider ?? 'finnhub') : prev);
    }
  }, [autotradeConfig]);

  const effectiveEnabled = pendingEnabled ?? autotradeConfig?.enabled ?? false;
  const effectiveProvider = pendingProvider ?? autotradeConfig?.provider ?? 'finnhub';
  const savedEnabled = autotradeConfig?.enabled ?? false;
  const savedProvider = autotradeConfig?.provider ?? 'finnhub';
  const hasChanges = autotradeConfig !== null && (
    effectiveEnabled !== savedEnabled || effectiveProvider !== savedProvider
  );

  const handleSave = () => {
    if (effectiveEnabled !== savedEnabled) onToggle();
    if (effectiveProvider !== savedProvider) onChangeProvider(effectiveProvider);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-lg border dark:border-gray-700">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Статус автоторговли</div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Включает или выключает автоматическое исполнение ордеров через Webull по сигналам T-1 мониторинга.
        </p>

        {autotradeLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Загрузка…
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className={`text-sm font-medium ${effectiveEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}`}>
                {autotradeToggling ? 'Применяется…' : effectiveEnabled ? 'Включена' : 'Выключена'}
              </div>
              {autotradeConfig?.lastModifiedAt ? (
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  Обновлено: {new Date(autotradeConfig.lastModifiedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/New_York' })} ET
                </div>
              ) : null}
            </div>
            <ToggleSwitch
              checked={effectiveEnabled}
              onChange={() => setPendingEnabled(v => !(v ?? savedEnabled))}
              disabled={autotradeToggling || autotradeConfig === null}
            />
          </div>
        )}
      </div>

      <div className="p-4 rounded-lg border dark:border-gray-700">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Провайдер котировок для автоторговли</div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Цены для расчёта IBS и LIMIT-ордера за 1 минуту до закрытия. Webull — один запрос на все тикеры, цена точнее (реальный intraday). Finnhub — по запросу на тикер с задержкой, надёжнее при высокой нагрузке.
        </p>
        {autotradeLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Загрузка…
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {(['finnhub', 'webull'] as const).map((p) => (
              <label key={p} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="autotradeProvider"
                  value={p}
                  checked={effectiveProvider === p}
                  disabled={autotradeConfig === null}
                  onChange={() => setPendingProvider(p)}
                  className="accent-indigo-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {p === 'finnhub' ? 'Finnhub' : 'Webull'}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || autotradeToggling || autotradeLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {autotradeToggling ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Сохранение…</>
          ) : (
            <><Save className="w-4 h-4" />Сохранить</>
          )}
        </button>
        {autotradeOk && (
          <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
            <Check className="w-4 h-4" />{autotradeOk}
          </span>
        )}
        {autotradeError && (
          <span className="text-sm text-red-600 dark:text-red-400">{autotradeError}</span>
        )}
      </div>

      <div className="p-4 rounded-lg border bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <p>• Подробные настройки автоторговли доступны на странице <strong className="text-gray-700 dark:text-gray-300">/broker → Автоторговля</strong>.</p>
          <p>• Переключатель здесь синхронизирован с переключателем на странице брокера.</p>
        </div>
      </div>
    </div>
  );
}

export function AppSettings() {
  const loadSettingsFromServer = useAppStore(s => s.loadSettingsFromServer);
  const saveSettingsToServer = useAppStore(s => s.saveSettingsToServer);
  const resultsQuoteProvider = useAppStore(s => s.resultsQuoteProvider);
  const resultsRefreshProvider = useAppStore(s => s.resultsRefreshProvider);
  const enhancerProvider = useAppStore(s => s.enhancerProvider);
  const enablePostClosePriceActualization = useAppStore(s => s.enablePostClosePriceActualization);
  const setResultsQuoteProvider = useAppStore(s => s.setResultsQuoteProvider);
  const setResultsRefreshProvider = useAppStore(s => s.setResultsRefreshProvider);
  const setEnhancerProvider = useAppStore(s => s.setEnhancerProvider);
  const setEnablePostClosePriceActualization = useAppStore(s => s.setEnablePostClosePriceActualization);
  const watchThresholdPct = useAppStore(s => s.watchThresholdPct);
  const setWatchThresholdPct = useAppStore(s => s.setWatchThresholdPct);
  const indicatorPanePercent = useAppStore(s => s.indicatorPanePercent);
  const setIndicatorPanePercent = useAppStore(s => s.setIndicatorPanePercent);
  const defaultMultiTickerSymbols = useAppStore(s => s.defaultMultiTickerSymbols);
  const setDefaultMultiTickerSymbols = useAppStore(s => s.setDefaultMultiTickerSymbols);
  const commissionType = useAppStore(s => s.commissionType);
  const commissionFixed = useAppStore(s => s.commissionFixed);
  const commissionPercentage = useAppStore(s => s.commissionPercentage);
  const setCommissionType = useAppStore(s => s.setCommissionType);
  const setCommissionFixed = useAppStore(s => s.setCommissionFixed);
  const setCommissionPercentage = useAppStore(s => s.setCommissionPercentage);
  const analysisTabsConfig = useAppStore(s => s.analysisTabsConfig);
  const setAnalysisTabsConfig = useAppStore(s => s.setAnalysisTabsConfig);

  // Active tab state
  const [activeTab, setActiveTab] = useState<'general' | 'api' | 'telegram' | 'interface' | 'autotrade'>('general');

  // Autotrade state
  const [autotradeConfig, setAutotradeConfig] = useState<AutoTradingConfig | null>(null);
  const [autotradeLoading, setAutotradeLoading] = useState(false);
  const [autotradeToggling, setAutotradeToggling] = useState(false);
  const [autotradeError, setAutotradeError] = useState<string | null>(null);
  const [autotradeOk, setAutotradeOk] = useState<string | null>(null);

  // Loading and initial values for unsaved changes detection
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [initialValues, setInitialValues] = useState<{
    watchThresholdPct: number;
    indicatorPanePercent: number;
    defaultMultiTickerSymbols: string;
    commissionType: 'fixed' | 'percentage' | 'combined';
    commissionFixed: number;
    commissionPercentage: number;
    resultsQuoteProvider: string;
    resultsRefreshProvider: string;
    enhancerProvider: string;
    enablePostClosePriceActualization: boolean;
    analysisTabsConfig: typeof analysisTabsConfig;
  } | null>(null);

  useEffect(() => {
    let isCancelled = false;
    setIsLoadingSettings(true);
    loadSettingsFromServer()
      .catch(() => {
        // Store handles error state separately.
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingSettings(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [loadSettingsFromServer]);

  useEffect(() => {
    if (isLoadingSettings || initialValues) return;
    setInitialValues({
      watchThresholdPct,
      indicatorPanePercent,
      defaultMultiTickerSymbols,
      commissionType,
      commissionFixed,
      commissionPercentage,
      resultsQuoteProvider,
      resultsRefreshProvider,
      enhancerProvider,
      enablePostClosePriceActualization,
      analysisTabsConfig
    });
  }, [
    isLoadingSettings,
    initialValues,
    watchThresholdPct,
    indicatorPanePercent,
    defaultMultiTickerSymbols,
    commissionType,
    commissionFixed,
    commissionPercentage,
    resultsQuoteProvider,
    resultsRefreshProvider,
    enhancerProvider,
    enablePostClosePriceActualization,
    analysisTabsConfig
  ]);

  // Check for unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!initialValues) return false;
    const initial = initialValues;
    return (
      watchThresholdPct !== initial.watchThresholdPct ||
      indicatorPanePercent !== initial.indicatorPanePercent ||
      defaultMultiTickerSymbols !== initial.defaultMultiTickerSymbols ||
      commissionType !== initial.commissionType ||
      commissionFixed !== initial.commissionFixed ||
      commissionPercentage !== initial.commissionPercentage ||
      resultsQuoteProvider !== initial.resultsQuoteProvider ||
      resultsRefreshProvider !== initial.resultsRefreshProvider ||
      enhancerProvider !== initial.enhancerProvider ||
      enablePostClosePriceActualization !== initial.enablePostClosePriceActualization ||
      JSON.stringify(analysisTabsConfig) !== JSON.stringify(initial.analysisTabsConfig)
    );
  }, [initialValues, watchThresholdPct, indicatorPanePercent, defaultMultiTickerSymbols, commissionType, commissionFixed, commissionPercentage, resultsQuoteProvider, resultsRefreshProvider, enhancerProvider, enablePostClosePriceActualization, analysisTabsConfig]);

  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState('Тестовое сообщение ✅');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // API testing state
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success?: boolean; error?: string; price?: string; symbol?: string }>>({});


  // API info modal state
  const [showApiInfo, setShowApiInfo] = useState(false);

  // Drag & Drop состояние
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);
  const [lastInteractionWasDrag, setLastInteractionWasDrag] = useState(false);

  // Функции для управления табами аналитики
  const toggleTabVisibility = useCallback((tabId: string, wasMouseEvent: boolean) => {
    // Блокируем toggle если это был drag (определяем по флагу)
    if (wasMouseEvent && lastInteractionWasDrag) {
      setLastInteractionWasDrag(false);
      return;
    }
    const newConfig = analysisTabsConfig.map(tab =>
      tab.id === tabId ? { ...tab, visible: !tab.visible } : tab
    );
    setAnalysisTabsConfig(newConfig);
  }, [analysisTabsConfig, lastInteractionWasDrag, setAnalysisTabsConfig]);

  // Drag & Drop функции
  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    setDraggedTab(tabId);
    setLastInteractionWasDrag(true);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetTabId?: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (targetTabId && targetTabId !== draggedTab) {
      setDragOverTab(targetTabId);
    }
  };

  const handleDragLeave = () => {
    setDragOverTab(null);
  };

  const handleDrop = (e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTab(null);

    if (!draggedTab || draggedTab === targetTabId) {
      setDraggedTab(null);
      return;
    }

    const draggedIndex = analysisTabsConfig.findIndex(tab => tab.id === draggedTab);
    const targetIndex = analysisTabsConfig.findIndex(tab => tab.id === targetTabId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedTab(null);
      return;
    }

    const newConfig = [...analysisTabsConfig];
    const [draggedItem] = newConfig.splice(draggedIndex, 1);
    newConfig.splice(targetIndex, 0, draggedItem);

    setAnalysisTabsConfig(newConfig);
    setDraggedTab(null);
  };

  const handleDragEnd = () => {
    setDraggedTab(null);
    setDragOverTab(null);
  };

  // Escape key to cancel drag
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && draggedTab) {
      setDraggedTab(null);
      setDragOverTab(null);
      setLastInteractionWasDrag(false);
    }
  }, [draggedTab]);


  const loadAutotradeConfig = async () => {
    try {
      setAutotradeLoading(true);
      setAutotradeError(null);
      const next = await DatasetAPI.getAutotradeConfig();
      setAutotradeConfig(next.config);
    } catch (e) {
      setAutotradeError(e instanceof Error ? e.message : 'Не удалось загрузить настройки автоторговли');
    } finally {
      setAutotradeLoading(false);
    }
  };

  const handleChangeAutotradeProvider = async (provider: string) => {
    try {
      setAutotradeError(null);
      setAutotradeOk(null);
      const next = await DatasetAPI.updateAutotradeConfig({ provider });
      setAutotradeConfig(next.config);
      setAutotradeOk(`Провайдер котировок: ${provider}`);
    } catch (e) {
      setAutotradeError(e instanceof Error ? e.message : 'Не удалось сохранить провайдер');
    }
  };

  const handleToggleAutotrade = async () => {
    if (!autotradeConfig) return;
    const nextEnabled = !autotradeConfig.enabled;
    try {
      setAutotradeToggling(true);
      setAutotradeError(null);
      setAutotradeOk(null);
      const next = await DatasetAPI.updateAutotradeConfig({ enabled: nextEnabled });
      setAutotradeConfig(next.config);
      setAutotradeOk(nextEnabled ? 'Автоторговля включена' : 'Автоторговля выключена');
    } catch (e) {
      setAutotradeError(e instanceof Error ? e.message : 'Не удалось изменить статус автоторговли');
    } finally {
      setAutotradeToggling(false);
    }
  };

  useEffect(() => {
    if (!autotradeOk) return;
    const t = setTimeout(() => setAutotradeOk(null), 3000);
    return () => clearTimeout(t);
  }, [autotradeOk]);

  const sendTest = async () => {
    setSending(true); setError(null); setOk(null);
    try {
      await DatasetAPI.sendTelegramTest(testMsg);
      setOk('Отправлено');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось отправить';
      setError(message);
    } finally {
      setSending(false);
    }
  };

  // Test API provider
  const testProvider = async (provider: string) => {
    setTestingProvider(provider);
    setTestResults({ ...testResults, [provider]: {} });
    try {
      const response = await DatasetAPI.testProvider(provider);
      setTestResults({ ...testResults, [provider]: response });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось протестировать API';
      setTestResults({ ...testResults, [provider]: { error: message } });
    } finally {
      setTestingProvider(null);
    }
  };

  // General Settings Tab
  const GeneralTab = () => (
    <div className="space-y-4">
      {/* Уведомления */}
      <div className="p-4 rounded-lg border dark:border-gray-700">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Уведомления</div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Порог близости к IBS, %</label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Диапазон 0–20%. По умолчанию 5%.</p>
        <div className="flex items-center gap-4">
          <div className="flex-1 flex flex-col">
            <input type="range" min={0} max={20} step={0.5} value={watchThresholdPct} onChange={(e) => {
              const sanitized = sanitizeNumericInput(e.target.value, {
                ...VALIDATION_CONSTRAINTS.thresholdPct,
                max: 20,
                fallback: watchThresholdPct
              });
              setWatchThresholdPct(sanitized);
            }} className="w-full" />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0%</span>
              <span>20%</span>
            </div>
          </div>
          <input type="number" min={0} max={20} step={0.5} value={watchThresholdPct} onChange={(e) => {
            const sanitized = sanitizeNumericInput(e.target.value, {
              ...VALIDATION_CONSTRAINTS.thresholdPct,
              max: 20,
              fallback: watchThresholdPct
            });
            setWatchThresholdPct(sanitized);
          }} className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-base md:text-sm dark:bg-gray-700 dark:text-white" />
          <span className="text-sm text-gray-500 dark:text-gray-400">%</span>
        </div>
      </div>

      {/* График */}
      <div className="p-4 rounded-lg border dark:border-gray-700">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">График</div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Высота панели индикаторов (IBS/Объём), %</label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Диапазон 0–40%. По умолчанию 7%. Больше — выше панель, меньше — ниже.</p>
        <div className="flex items-center gap-4">
          <div className="flex-1 flex flex-col">
            <input type="range" min={0} max={40} step={1} value={indicatorPanePercent} onChange={(e) => {
              const sanitized = sanitizeNumericInput(e.target.value, {
                ...VALIDATION_CONSTRAINTS.indicatorPane,
                max: 40,
                fallback: indicatorPanePercent
              });
              setIndicatorPanePercent(sanitized);
            }} className="w-full" />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0%</span>
              <span>40%</span>
            </div>
          </div>
          <input type="number" min={0} max={40} step={1} value={indicatorPanePercent} onChange={(e) => {
            const sanitized = sanitizeNumericInput(e.target.value, {
              ...VALIDATION_CONSTRAINTS.indicatorPane,
              max: 40,
              fallback: indicatorPanePercent
            });
            setIndicatorPanePercent(sanitized);
          }} className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-base md:text-sm dark:bg-gray-700 dark:text-white" />
          <span className="text-sm text-gray-500 dark:text-gray-400">%</span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Подсказка: чтобы сделать столбики заметно ниже (примерно в 3 раза), установите ~7%.</div>
      </div>

      {/* Тикеры по умолчанию для multi-ticker */}
      <div className="p-4 rounded-lg border dark:border-gray-700">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Страница "Несколько тикеров"</div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Тикеры по умолчанию</label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Список тикеров через запятую, которые будут использоваться при открытии страницы.</p>
        <input
          type="text"
          value={defaultMultiTickerSymbols}
          onChange={(e) => {
            const sanitized = sanitizeTextInput(e.target.value, {
              maxLength: 200,
              allowedChars: /^[A-Za-z0-9,\s]*$/
            });
            setDefaultMultiTickerSymbols(sanitized);
          }}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-base md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
          placeholder="AAPL,MSFT,AMZN,MAGS"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Пример: AAPL,MSFT,AMZN,MAGS</p>
      </div>

      {/* Комиссии */}
      <div className="p-4 rounded-lg border dark:border-gray-700">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Комиссии торговли</div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Тип комиссии</label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm dark:text-gray-300">
                <input
                  type="radio"
                  name="commissionType"
                  checked={commissionType === 'fixed'}
                  onChange={() => setCommissionType('fixed')}
                />
                Фиксированная
              </label>
              <label className="flex items-center gap-2 text-sm dark:text-gray-300">
                <input
                  type="radio"
                  name="commissionType"
                  checked={commissionType === 'percentage'}
                  onChange={() => setCommissionType('percentage')}
                />
                Процентная
              </label>
              <label className="flex items-center gap-2 text-sm dark:text-gray-300">
                <input
                  type="radio"
                  name="commissionType"
                  checked={commissionType === 'combined'}
                  onChange={() => setCommissionType('combined')}
                />
                Комбинированная
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={commissionType === 'percentage' ? 'opacity-50' : ''}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Фиксированная комиссия, $
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={commissionFixed}
                onChange={(e) => {
                  const sanitized = sanitizeNumericInput(e.target.value, {
                    ...VALIDATION_CONSTRAINTS.commission.fixed,
                    fallback: commissionFixed
                  });
                  setCommissionFixed(sanitized);
                }}
                disabled={commissionType === 'percentage'}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-base md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-gray-800 dark:bg-gray-700 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">За каждую сделку (вход + выход)</p>
            </div>

            <div className={commissionType === 'fixed' ? 'opacity-50' : ''}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Процентная комиссия, %
              </label>
              <input
                type="number"
                min="0"
                max="10"
                step="0.01"
                value={commissionPercentage}
                onChange={(e) => {
                  const sanitized = sanitizeNumericInput(e.target.value, {
                    ...VALIDATION_CONSTRAINTS.commission.percentage,
                    fallback: commissionPercentage
                  });
                  setCommissionPercentage(sanitized);
                }}
                disabled={commissionType === 'fixed'}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-base md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-gray-800 dark:bg-gray-700 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">От суммы сделки (например, 0.1%)</p>
            </div>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
            💡 <strong className="dark:text-gray-300">Типы комиссий:</strong><br />
            • <strong className="dark:text-gray-300">Фиксированная:</strong> одинаковая сумма за каждую сделку<br />
            • <strong className="dark:text-gray-300">Процентная:</strong> процент от суммы сделки<br />
            • <strong className="dark:text-gray-300">Комбинированная:</strong> фиксированная часть + процент
          </div>
        </div>
      </div>

    </div>
  );

  // API Settings Tab
  const ApiTab = () => (
    <div className="space-y-4">
      {/* API Testing */}
      <div className="p-4 rounded-lg border dark:border-gray-700">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Тестирование API</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">Проверьте подключение к API провайдерам (используется тестовый символ AAPL)</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <button
              onClick={() => testProvider('alpha_vantage')}
              disabled={testingProvider === 'alpha_vantage'}
              className="w-full px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-700"
            >
              {testingProvider === 'alpha_vantage' ? 'Тестирование...' : 'Тест Alpha Vantage'}
            </button>
            {testResults.alpha_vantage && (
              <div className={`mt-2 text-xs ${testResults.alpha_vantage.error ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {testResults.alpha_vantage.error
                  ? `❌ ${testResults.alpha_vantage.error}`
                  : `✅ ${testResults.alpha_vantage.symbol}: $${testResults.alpha_vantage.price}`}
              </div>
            )}
          </div>
          <div>
            <button
              onClick={() => testProvider('finnhub')}
              disabled={testingProvider === 'finnhub'}
              className="w-full px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-700"
            >
              {testingProvider === 'finnhub' ? 'Тестирование...' : 'Тест Finnhub'}
            </button>
            {testResults.finnhub && (
              <div className={`mt-2 text-xs ${testResults.finnhub.error ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {testResults.finnhub.error
                  ? `❌ ${testResults.finnhub.error}`
                  : `✅ ${testResults.finnhub.symbol}: $${testResults.finnhub.price}`}
              </div>
            )}
          </div>
          <div>
            <button
              onClick={() => testProvider('twelve_data')}
              disabled={testingProvider === 'twelve_data'}
              className="w-full px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-700"
            >
              {testingProvider === 'twelve_data' ? 'Тестирование...' : 'Тест Twelve Data'}
            </button>
            {testResults.twelve_data && (
              <div className={`mt-2 text-xs ${testResults.twelve_data.error ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {testResults.twelve_data.error
                  ? `❌ ${testResults.twelve_data.error}`
                  : `✅ ${testResults.twelve_data.symbol}: $${testResults.twelve_data.price}`}
              </div>
            )}
          </div>
          <div>
            <button
              onClick={() => testProvider('polygon')}
              disabled={testingProvider === 'polygon'}
              className="w-full px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-700"
            >
              {testingProvider === 'polygon' ? 'Тестирование...' : 'Тест Polygon'}
            </button>
            {testResults.polygon && (
              <div className={`mt-2 text-xs ${testResults.polygon.error ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {testResults.polygon.error
                  ? `❌ ${testResults.polygon.error}`
                  : `✅ ${testResults.polygon.symbol}: $${testResults.polygon.price}`}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Провайдеры данных */}
      <div className="p-4 rounded-lg border dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Провайдеры данных</div>
          <button
            onClick={() => setShowApiInfo(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
          >
            <Info className="w-4 h-4" />
            Подробнее
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 border dark:border-gray-700">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">Котировки — страница «Результаты»</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Текущая цена тикера, обновляется каждые 15 сек в торговые часы</div>
            <label className="flex items-center gap-2 text-sm mb-1 dark:text-gray-300">
              <input type="radio" name="quoteProvider" checked={resultsQuoteProvider === 'finnhub'} onChange={() => setResultsQuoteProvider('finnhub')} />
              Finnhub
            </label>
            <label className="flex items-center gap-2 text-sm mb-1 dark:text-gray-300">
              <input type="radio" name="quoteProvider" checked={resultsQuoteProvider === 'alpha_vantage'} onChange={() => setResultsQuoteProvider('alpha_vantage')} />
              Alpha Vantage
            </label>
            <label className="flex items-center gap-2 text-sm mb-1 dark:text-gray-300">
              <input type="radio" name="quoteProvider" checked={resultsQuoteProvider === 'twelve_data'} onChange={() => setResultsQuoteProvider('twelve_data')} />
              Twelve Data
            </label>
            <label className="flex items-center gap-2 text-sm dark:text-gray-300">
              <input type="radio" name="quoteProvider" checked={resultsQuoteProvider === 'webull'} onChange={() => setResultsQuoteProvider('webull')} />
              Webull
            </label>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 border dark:border-gray-700">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">Обновление датасета</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Кнопка «Обновить» — дозагружает историю OHLC за последние дни</div>
            <label className="flex items-center gap-2 text-sm mb-1 dark:text-gray-300">
              <input type="radio" name="refreshProvider" checked={resultsRefreshProvider === 'polygon'} onChange={() => setResultsRefreshProvider('polygon')} />
              Polygon.io
            </label>
            <label className="flex items-center gap-2 text-sm mb-1 dark:text-gray-300">
              <input type="radio" name="refreshProvider" checked={resultsRefreshProvider === 'twelve_data'} onChange={() => setResultsRefreshProvider('twelve_data')} />
              Twelve Data
            </label>
            <label className="flex items-center gap-2 text-sm mb-1 dark:text-gray-300">
              <input type="radio" name="refreshProvider" checked={resultsRefreshProvider === 'finnhub'} onChange={() => setResultsRefreshProvider('finnhub')} />
              Finnhub
            </label>
            <label className="flex items-center gap-2 text-sm dark:text-gray-300">
              <input type="radio" name="refreshProvider" checked={resultsRefreshProvider === 'alpha_vantage'} onChange={() => setResultsRefreshProvider('alpha_vantage')} />
              Alpha Vantage
            </label>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 border dark:border-gray-700">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">Новые данные — страница «Энхансер»</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Загрузка полной истории OHLC для нового датасета</div>
            <label className="flex items-center gap-2 text-sm mb-1 dark:text-gray-300">
              <input type="radio" name="enhancerProvider" checked={enhancerProvider === 'polygon'} onChange={() => setEnhancerProvider('polygon')} />
              Polygon.io
            </label>
            <label className="flex items-center gap-2 text-sm mb-1 dark:text-gray-300">
              <input type="radio" name="enhancerProvider" checked={enhancerProvider === 'twelve_data'} onChange={() => setEnhancerProvider('twelve_data')} />
              Twelve Data
            </label>
            <label className="flex items-center gap-2 text-sm mb-1 dark:text-gray-300">
              <input type="radio" name="enhancerProvider" checked={enhancerProvider === 'alpha_vantage'} onChange={() => setEnhancerProvider('alpha_vantage')} />
              Alpha Vantage
            </label>
            <label className="flex items-center gap-2 text-sm dark:text-gray-300">
              <input type="radio" name="enhancerProvider" checked={enhancerProvider === 'finnhub'} onChange={() => setEnhancerProvider('finnhub')} />
              Finnhub
            </label>
          </div>
        </div>

        <div className="mt-4 rounded p-3 border bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Автоактуализация цен после закрытия рынка</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Серверный запуск через 16-30 минут после закрытия (T+16 мин). По умолчанию выключено.</div>
            </div>
            <ToggleSwitch
              checked={enablePostClosePriceActualization}
              onChange={() => setEnablePostClosePriceActualization(!enablePostClosePriceActualization)}
            />
          </div>
        </div>

      </div>

      {/* API Info Modal */}
      {showApiInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b dark:border-gray-700 p-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Провайдеры данных — лимиты и особенности</h3>
              <button onClick={() => setShowApiInfo(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">

              {/* Quick reference table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800">
                      <th className="text-left p-2 border dark:border-gray-700">Провайдер</th>
                      <th className="text-left p-2 border dark:border-gray-700">Историч. данные</th>
                      <th className="text-left p-2 border dark:border-gray-700">Котировки (real-time)</th>
                      <th className="text-left p-2 border dark:border-gray-700">Лимит (free)</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-700 dark:text-gray-300">
                    <tr>
                      <td className="p-2 border dark:border-gray-700 font-medium">Polygon.io</td>
                      <td className="p-2 border dark:border-gray-700 text-red-600 dark:text-red-400">❌ Только ~500 дней (free)</td>
                      <td className="p-2 border dark:border-gray-700 text-yellow-600 dark:text-yellow-400">⚠️ Задержка 15 мин</td>
                      <td className="p-2 border dark:border-gray-700">500 баров/запрос (free)</td>
                    </tr>
                    <tr className="bg-gray-50 dark:bg-gray-800/50">
                      <td className="p-2 border dark:border-gray-700 font-medium">Twelve Data</td>
                      <td className="p-2 border dark:border-gray-700 text-green-600 dark:text-green-400">✅ Полная история (2 запроса)</td>
                      <td className="p-2 border dark:border-gray-700 text-green-600 dark:text-green-400">✅ Real-time</td>
                      <td className="p-2 border dark:border-gray-700">8 req/мин, 800/день</td>
                    </tr>
                    <tr>
                      <td className="p-2 border dark:border-gray-700 font-medium">Finnhub</td>
                      <td className="p-2 border dark:border-gray-700 text-red-600 dark:text-red-400">❌ Только платный план</td>
                      <td className="p-2 border dark:border-gray-700 text-green-600 dark:text-green-400">✅ Real-time, 60 req/мин</td>
                      <td className="p-2 border dark:border-gray-700">60 req/мин (котировки)</td>
                    </tr>
                    <tr className="bg-gray-50 dark:bg-gray-800/50">
                      <td className="p-2 border dark:border-gray-700 font-medium">Alpha Vantage</td>
                      <td className="p-2 border dark:border-gray-700 text-red-600 dark:text-red-400">❌ outputsize=full — платный</td>
                      <td className="p-2 border dark:border-gray-700 text-green-600 dark:text-green-400">✅ GLOBAL_QUOTE</td>
                      <td className="p-2 border dark:border-gray-700">25 req/день, 5 req/мин</td>
                    </tr>
                    <tr>
                      <td className="p-2 border dark:border-gray-700 font-medium">Webull</td>
                      <td className="p-2 border dark:border-gray-700 text-red-600 dark:text-red-400">❌ Только snapshot дня</td>
                      <td className="p-2 border dark:border-gray-700 text-green-600 dark:text-green-400">✅ Real-time snapshot</td>
                      <td className="p-2 border dark:border-gray-700">Требует APP_KEY + SECRET</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Detailed sections */}
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Котировки (страница «Результаты», Мониторинг)</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Endpoint: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">/api/quote/:symbol</code> — вызывается при каждом обновлении цены (~каждые 15 сек)</p>
                <div className="text-sm space-y-0.5">
                  <div><span className="text-green-600 dark:text-green-400 font-medium">Finnhub:</span> <span className="text-gray-600 dark:text-gray-400">Лучший выбор. 60 req/мин — справится с любым количеством тикеров.</span></div>
                  <div><span className="text-purple-600 dark:text-purple-400 font-medium">Twelve Data:</span> <span className="text-gray-600 dark:text-gray-400">8 req/мин, 800/день — достаточно для 4-5 тикеров с задержкой 15с.</span></div>
                  <div><span className="text-green-600 dark:text-green-400 font-medium">Alpha Vantage:</span> <span className="text-gray-600 dark:text-gray-400">5 req/мин, 25/день — слишком мало для активного мониторинга.</span></div>
                  <div><span className="text-indigo-600 dark:text-indigo-400 font-medium">Webull:</span> <span className="text-gray-600 dark:text-gray-400">Real-time snapshot. Работает при наличии market-data access.</span></div>
                </div>
              </div>

              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Обновление датасета (кнопка «Обновить»)</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Endpoint: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">/api/datasets/:id/refresh</code> — дозагружает последние дни OHLC</p>
                <div className="text-sm space-y-0.5">
                  <div><span className="text-orange-600 dark:text-orange-400 font-medium">Polygon.io:</span> <span className="text-gray-600 dark:text-gray-400">❌ Free-тариф ограничен ~500 барами. Для полной истории нужен платный план.</span></div>
                  <div><span className="text-purple-600 dark:text-purple-400 font-medium">Twelve Data:</span> <span className="text-gray-600 dark:text-gray-400">✅ Хорошо. До 5000 точек за запрос, 2 запроса на полную историю (~40 лет).</span></div>
                  <div><span className="text-blue-600 dark:text-blue-400 font-medium">Finnhub:</span> <span className="text-gray-600 dark:text-gray-400">❌ Исторические данные — только платный план (403 на free).</span></div>
                  <div><span className="text-green-600 dark:text-green-400 font-medium">Alpha Vantage:</span> <span className="text-gray-600 dark:text-gray-400">❌ outputsize=full — только платный план. Free даёт 100 дней.</span></div>
                </div>
              </div>

              <div className="border-l-4 border-purple-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Новые данные — загрузка полной истории</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Endpoint: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">/api/yahoo-finance/:symbol</code> — 1 запрос при создании датасета</p>
                <div className="text-sm space-y-0.5">
                  <div><span className="text-orange-600 dark:text-orange-400 font-medium">Polygon.io:</span> <span className="text-gray-600 dark:text-gray-400">❌ Free-тариф — только ~500 дней. Полная история только на платном плане.</span></div>
                  <div><span className="text-purple-600 dark:text-purple-400 font-medium">Twelve Data:</span> <span className="text-gray-600 dark:text-gray-400">✅ Полная история через 2 запроса. Лимит 800/день не проблема при ручном использовании.</span></div>
                  <div><span className="text-blue-600 dark:text-blue-400 font-medium">Finnhub:</span> <span className="text-gray-600 dark:text-gray-400">❌ /stock/candle — только платный план.</span></div>
                  <div><span className="text-green-600 dark:text-green-400 font-medium">Alpha Vantage:</span> <span className="text-gray-600 dark:text-gray-400">❌ Полная история — только платный план.</span></div>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Рекомендации</h4>
                <div className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
                  <p><strong>Исторические данные:</strong> Twelve Data (до ~27 лет, 8 req/мин). Polygon — только ~500 дней на free.</p>
                  <p><strong>Котировки и мониторинг:</strong> Finnhub (60 req/мин) или Twelve Data.</p>
                  <p><strong>Брокерская интеграция:</strong> Webull как quote provider при наличии market-data доступа.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Interface Settings Tab
  const InterfaceTab = () => (
    <div onKeyDown={handleKeyDown}>
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b border-gray-200 px-4 pt-4 pb-2 dark:border-gray-700">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Вкладки страницы «Акции»</div>
          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Перетащите для изменения порядка · Нажмите, чтобы скрыть или показать
          </div>
        </div>

        {/* Draggable tab row */}
        <div className="overflow-x-auto">
          <div
            className="flex items-stretch border-b border-gray-200 dark:border-gray-700"
            role="listbox"
            aria-label="Порядок вкладок страницы Акции"
          >
            {analysisTabsConfig.map((tab) => (
              <div
                key={tab.id}
                role="option"
                aria-selected={tab.visible}
                draggable
                onDragStart={(e) => handleDragStart(e, tab.id)}
                onDragOver={(e) => handleDragOver(e, tab.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, tab.id)}
                onDragEnd={handleDragEnd}
                onClick={(e) => {
                  if (e.detail > 0) toggleTabVisibility(tab.id, true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleTabVisibility(tab.id, false);
                  }
                }}
                tabIndex={0}
                title={tab.visible ? 'Нажмите, чтобы скрыть' : 'Нажмите, чтобы показать'}
                className={`
                  relative select-none whitespace-nowrap px-5 py-3 text-sm font-medium
                  border-b-2 transition-all duration-150 outline-none
                  cursor-grab active:cursor-grabbing
                  focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500
                  ${tab.visible
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20'
                    : 'border-transparent text-gray-400 opacity-50 hover:opacity-70 dark:text-gray-500'
                  }
                  ${draggedTab === tab.id ? 'opacity-20' : ''}
                  ${dragOverTab === tab.id && draggedTab !== tab.id
                    ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-300'
                    : ''
                  }
                `}
              >
                {tab.label}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-400 dark:text-gray-500">
          <span>
            Сводка — всегда первая и не скрывается
          </span>
          <span>
            {analysisTabsConfig.filter(t => t.visible).length} / {analysisTabsConfig.length} показано
          </span>
        </div>
      </div>
    </div>
  );

  // Telegram Settings Tab
  const TelegramTab = () => (
    <div className="space-y-4">
      {/* Telegram Info */}
      <div className="p-4 rounded-lg border bg-purple-50 dark:bg-purple-900/20 dark:border-purple-900/30">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">📱 Telegram настройки</div>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Telegram Bot Token и Chat ID настраиваются в файле <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">.env</code> на сервере.
          Для изменения отредактируйте файл <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">~/stonks-config/.env</code> на сервере.
        </p>
      </div>

      <div className="p-4 rounded-lg border bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Тестовое сообщение в Telegram</div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={testMsg} onChange={(e) => {
            const sanitized = sanitizeTextInput(e.target.value, {
              maxLength: 500,
              removeHtml: true
            });
            setTestMsg(sanitized);
          }} className="flex-1 min-w-[260px] px-3 py-2 rounded-md border dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          <button onClick={sendTest} disabled={sending} className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-700">
            {sending ? 'Отправка…' : 'Отправить тест'}
          </button>
        </div>
        {error && <div className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</div>}
        {ok && <div className="text-sm text-green-600 dark:text-green-400 mt-2">{ok}</div>}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">Примечание: Telegram-бот и чат должны быть настроены на сервере.</p>
    </div>
  );

  // Auto-dismiss saveOk after 3s
  useEffect(() => {
    if (!saveOk) return;
    const t = setTimeout(() => setSaveOk(null), 3000);
    return () => clearTimeout(t);
  }, [saveOk]);

  // Clear success message immediately when new unsaved changes appear
  useEffect(() => {
    if (hasUnsavedChanges && saveOk) setSaveOk(null);
  }, [hasUnsavedChanges, saveOk]);

  // Global save handler
  const handleGlobalSave = async () => {
    setSaving(true);
    setSaveOk(null);
    setSaveErr(null);
    try {
      await saveSettingsToServer();
      setSaveOk('Все настройки сохранены');
      // Update initial values after successful save
      setInitialValues({
        watchThresholdPct,
        indicatorPanePercent,
        defaultMultiTickerSymbols,
        commissionType,
        commissionFixed,
        commissionPercentage,
        resultsQuoteProvider,
        resultsRefreshProvider,
        enhancerProvider,
        enablePostClosePriceActualization,
        analysisTabsConfig
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось сохранить настройки';
      setSaveErr(message);
    } finally {
      setSaving(false);
    }
  };

  // Loading skeleton component
  const SettingsSkeleton = () => (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="p-4 rounded-lg border">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-10 bg-gray-200 rounded w-full mb-2"></div>
          <div className="h-3 bg-gray-100 rounded w-1/2"></div>
        </div>
      ))}
    </div>
  );

  const tabs = [
    { id: 'general' as const, label: 'Общие' },
    { id: 'api' as const, label: 'API' },
    { id: 'telegram' as const, label: 'Telegram' },
    { id: 'interface' as const, label: 'Интерфейс' },
    { id: 'autotrade' as const, label: 'Автоторговля' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Настройки"
        subtitle="Конфигурация приложения и параметры стратегии"
        actions={
          <div className="flex items-center gap-3">
            {saveErr && <span className="text-sm text-red-600 dark:text-red-400">{saveErr}</span>}
            <button
              onClick={handleGlobalSave}
              disabled={saving || (!hasUnsavedChanges && !saveOk)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                saving
                  ? 'bg-blue-600 text-white opacity-70 cursor-not-allowed'
                  : saveOk
                  ? 'bg-emerald-600 text-white cursor-default'
                  : hasUnsavedChanges
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-500'
              }`}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saveOk ? (
                <Check className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? 'Сохранение…' : saveOk ? 'Сохранено' : 'Сохранить'}
            </button>
          </div>
        }
      />

      {/* Tabs with ARIA */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav
          className="-mb-px flex space-x-8"
          role="tablist"
          aria-label="Настройки"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => {
                const currentIndex = tabs.findIndex(t => t.id === activeTab);
                if (e.key === 'ArrowRight') {
                  const nextIndex = (currentIndex + 1) % tabs.length;
                  setActiveTab(tabs[nextIndex].id);
                } else if (e.key === 'ArrowLeft') {
                  const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
                  setActiveTab(tabs[prevIndex].id);
                }
              }}
              className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm transition-colors outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${activeTab === tab.id
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-600'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-4">
        {isLoadingSettings ? (
          <SettingsSkeleton />
        ) : (
          <>
            <div
              role="tabpanel"
              id="tabpanel-general"
              aria-labelledby="tab-general"
              hidden={activeTab !== 'general'}
            >
              {activeTab === 'general' && GeneralTab()}
            </div>
            <div
              role="tabpanel"
              id="tabpanel-api"
              aria-labelledby="tab-api"
              hidden={activeTab !== 'api'}
            >
              {activeTab === 'api' && ApiTab()}
            </div>
            <div
              role="tabpanel"
              id="tabpanel-telegram"
              aria-labelledby="tab-telegram"
              hidden={activeTab !== 'telegram'}
            >
              {activeTab === 'telegram' && TelegramTab()}
            </div>
            <div
              role="tabpanel"
              id="tabpanel-interface"
              aria-labelledby="tab-interface"
              hidden={activeTab !== 'interface'}
            >
              {activeTab === 'interface' && InterfaceTab()}
            </div>
            <div
              role="tabpanel"
              id="tabpanel-autotrade"
              aria-labelledby="tab-autotrade"
              hidden={activeTab !== 'autotrade'}
            >
              {activeTab === 'autotrade' && (
                <AutotradeTab
                  autotradeConfig={autotradeConfig}
                  autotradeLoading={autotradeLoading}
                  autotradeToggling={autotradeToggling}
                  autotradeError={autotradeError}
                  autotradeOk={autotradeOk}
                  onLoad={() => void loadAutotradeConfig()}
                  onToggle={() => void handleToggleAutotrade()}
                  onChangeProvider={(p) => void handleChangeAutotradeProvider(p)}
                />
              )}
            </div>
          </>
        )}
      </div>

    </div>
  );
}
