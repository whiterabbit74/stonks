import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { DatasetAPI } from '../lib/api';
import { useAppStore } from '../stores';
import { sanitizeNumericInput, sanitizeTextInput, VALIDATION_CONSTRAINTS } from '../lib/input-validation';
import { BarChart3, TrendingUp, ShoppingCart, TrendingDown, Target, Calculator, Clock, AlertTriangle, DollarSign, BarChart2, Layers, Info, X, ChevronUp, ChevronDown, Save, Loader2 } from 'lucide-react';
import type { AutoTradingConfig } from '../types';
// import { StrategySettings } from './StrategySettings';

// SettingsData interface removed - not actively used

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

  // Иконки для табов
  const getTabIcon = (tabId: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      price: <BarChart3 className="w-4 h-4" />,
      equity: <TrendingUp className="w-4 h-4" />,
      buyhold: <ShoppingCart className="w-4 h-4" />,
      drawdown: <TrendingDown className="w-4 h-4" />,
      trades: <Target className="w-4 h-4" />,
      profit: <Calculator className="w-4 h-4" />,
      duration: <Clock className="w-4 h-4" />,
      openDayDrawdown: <AlertTriangle className="w-4 h-4" />,
      singlePosition: <DollarSign className="w-4 h-4" />,
      splits: <Layers className="w-4 h-4" />
    };
    return iconMap[tabId] || <BarChart2 className="w-4 h-4" />;
  };

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

  // Keyboard navigation for reordering
  const moveTab = useCallback((tabId: string, direction: 'up' | 'down') => {
    const currentIndex = analysisTabsConfig.findIndex(tab => tab.id === tabId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= analysisTabsConfig.length) return;

    const newConfig = [...analysisTabsConfig];
    const [movedItem] = newConfig.splice(currentIndex, 1);
    newConfig.splice(newIndex, 0, movedItem);
    setAnalysisTabsConfig(newConfig);
  }, [analysisTabsConfig, setAnalysisTabsConfig]);

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

  const handleToggleAutotrade = async () => {
    if (!autotradeConfig) return;
    const nextEnabled = !autotradeConfig.enabled;
    const confirmed = window.confirm(nextEnabled ? 'Включить автоторговлю в live-режиме?' : 'Выключить автоторговлю?');
    if (!confirmed) return;
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

  const saveProviders = async () => {
    setSaving(true); setSaveOk(null); setSaveErr(null);
    try {
      await saveSettingsToServer();
      setSaveOk('Сохранено');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось сохранить';
      setSaveErr(message);
    } finally {
      setSaving(false);
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
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Котировки (страница «Результаты»)</div>
            <label className="flex items-center gap-2 text-sm mb-1 dark:text-gray-300">
              <input type="radio" name="quoteProvider" checked={resultsQuoteProvider === 'finnhub'} onChange={() => setResultsQuoteProvider('finnhub')} />
              Finnhub
            </label>
            <label className="flex items-center gap-2 text-sm mb-1 dark:text-gray-300">
              <input type="radio" name="quoteProvider" checked={resultsQuoteProvider === 'alpha_vantage'} onChange={() => setResultsQuoteProvider('alpha_vantage')} />
              Alpha Vantage
            </label>
            <label className="flex items-center gap-2 text-sm dark:text-gray-300">
              <input type="radio" name="quoteProvider" checked={resultsQuoteProvider === 'twelve_data'} onChange={() => setResultsQuoteProvider('twelve_data')} />
              Twelve Data
            </label>
            <label className="flex items-center gap-2 text-sm dark:text-gray-300">
              <input type="radio" name="quoteProvider" checked={resultsQuoteProvider === 'webull'} onChange={() => setResultsQuoteProvider('webull')} />
              Webull
            </label>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 border dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Актуализация датасета (серверный refresh)</div>
            <label className="flex items-center gap-2 text-sm mb-1 dark:text-gray-300">
              <input type="radio" name="refreshProvider" checked={resultsRefreshProvider === 'finnhub'} onChange={() => setResultsRefreshProvider('finnhub')} />
              Finnhub
            </label>
            <label className="flex items-center gap-2 text-sm mb-1 dark:text-gray-300">
              <input type="radio" name="refreshProvider" checked={resultsRefreshProvider === 'alpha_vantage'} onChange={() => setResultsRefreshProvider('alpha_vantage')} />
              Alpha Vantage
            </label>
            <label className="flex items-center gap-2 text-sm dark:text-gray-300">
              <input type="radio" name="refreshProvider" checked={resultsRefreshProvider === 'twelve_data'} onChange={() => setResultsRefreshProvider('twelve_data')} />
              Twelve Data
            </label>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 border dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Импорт «Новые данные» (энхансер)</div>
            <label className="flex items-center gap-2 text-sm mb-1 dark:text-gray-300">
              <input type="radio" name="enhancerProvider" checked={enhancerProvider === 'alpha_vantage'} onChange={() => setEnhancerProvider('alpha_vantage')} />
              Alpha Vantage
            </label>
            <label className="flex items-center gap-2 text-sm mb-1 dark:text-gray-300">
              <input type="radio" name="enhancerProvider" checked={enhancerProvider === 'finnhub'} onChange={() => setEnhancerProvider('finnhub')} />
              Finnhub
            </label>
            <label className="flex items-center gap-2 text-sm dark:text-gray-300">
              <input type="radio" name="enhancerProvider" checked={enhancerProvider === 'twelve_data'} onChange={() => setEnhancerProvider('twelve_data')} />
              Twelve Data
            </label>
          </div>
        </div>

        <div className="mt-4 rounded p-3 border bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
          <label className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={enablePostClosePriceActualization}
              onChange={(e) => setEnablePostClosePriceActualization(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-900 dark:border-gray-700"
            />
            <span>
              Автоактуализация цен после закрытия рынка (T+16 минут)
              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">
                Серверный запуск через 16-30 минут после закрытия. По умолчанию выключено.
              </span>
            </span>
          </label>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button onClick={saveProviders} disabled={saving} className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:bg-gray-400">
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          {saveOk && <span className="text-sm text-green-600">{saveOk}</span>}
          {saveErr && <span className="text-sm text-red-600">{saveErr}</span>}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">Подсказка: для refresh используйте провайдера, который стабильно доступен на вашем тарифе.</div>
      </div>

      {/* API Info Modal */}
      {showApiInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b dark:border-gray-700 p-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Подробная информация о провайдерах API</h3>
              <button
                onClick={() => setShowApiInfo(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Quote Provider */}
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">1. Котировки (страница «Результаты»)</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <strong className="dark:text-gray-100">Назначение:</strong> Получение реалтайм цены текущего дня (open, high, low, close, volume) для отображения на странице "Результаты".
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <strong className="dark:text-gray-100">Когда вызывается:</strong> При открытии страницы Results и при обновлении текущей котировки.
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <strong className="dark:text-gray-100">Endpoint:</strong> <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">/api/quote/:symbol</code>
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <strong className="dark:text-gray-100">Объем запросов:</strong> 1 запрос на тикер при загрузке страницы. При работе с 1 тикером: 1-5 запросов в день.
                </p>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-green-600 dark:text-green-400 font-medium">Alpha Vantage:</span>
                    <span className="text-gray-600 dark:text-gray-400">5 запросов/минуту, 500/день. Хорош для редких обновлений.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-blue-600 dark:text-blue-400 font-medium">Finnhub:</span>
                    <span className="text-gray-600 dark:text-gray-400">60 запросов/минуту. Отлично для частых обновлений.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-purple-600 dark:text-purple-400 font-medium">Twelve Data:</span>
                    <span className="text-gray-600 dark:text-gray-400">8 запросов/минуту, 800/день. Баланс между скоростью и лимитами.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-indigo-600 dark:text-indigo-400 font-medium">Webull:</span>
                    <span className="text-gray-600 dark:text-gray-400">Real-time snapshot через OpenAPI market-data. Подходит для /results и мониторинга, если доступен market-data access.</span>
                  </div>
                </div>
              </div>

              {/* Refresh Provider */}
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">2. Актуализация датасета (серверный refresh)</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <strong className="dark:text-gray-100">Назначение:</strong> Обновление существующего датасета новыми историческими данными (последние 7 дней).
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <strong className="dark:text-gray-100">Когда вызывается:</strong> При нажатии кнопки "Обновить" на странице Results.
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <strong className="dark:text-gray-100">Endpoint:</strong> <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">/api/datasets/:id/refresh</code>
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <strong className="dark:text-gray-100">Объем запросов:</strong> 1 запрос на обновление датасета. При регулярном использовании: 1-10 запросов в неделю.
                </p>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-green-600 dark:text-green-400 font-medium">Alpha Vantage:</span>
                    <span className="text-gray-600 dark:text-gray-400">Полный исторический набор данных, но медленный (лимит 5/мин).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-blue-600 dark:text-blue-400 font-medium">Finnhub:</span>
                    <span className="text-gray-600 dark:text-gray-400">Быстрый, но без split-adjusted данных.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-purple-600 dark:text-purple-400 font-medium">Twelve Data:</span>
                    <span className="text-gray-600 dark:text-gray-400">До 5000 точек данных, баланс между скоростью и качеством.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-indigo-600 dark:text-indigo-400 font-medium">Webull:</span>
                    <span className="text-gray-600 dark:text-gray-400">Для historical refresh не выбран по умолчанию. Используй только как quote provider для /results и мониторинга.</span>
                  </div>
                </div>
              </div>

              {/* Enhancer Provider */}
              <div className="border-l-4 border-purple-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">3. Импорт «Новые данные» (энхансер)</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <strong className="dark:text-gray-100">Назначение:</strong> Получение полного исторического набора данных при создании нового датасета (до 40 лет истории).
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <strong className="dark:text-gray-100">Когда вызывается:</strong> На странице "Данные" при вводе тикера и нажатии "Загрузить из API".
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <strong className="dark:text-gray-100">Endpoint:</strong> <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">/api/yahoo-finance/:symbol</code>
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <strong className="dark:text-gray-100">Объем запросов:</strong> 1 запрос на создание датасета. При создании 5 датасетов: 5 запросов.
                </p>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-green-600 dark:text-green-400 font-medium">Alpha Vantage:</span>
                    <span className="text-gray-600 dark:text-gray-400">✅ Лучший выбор! Полная история, split-adjusted данные, ~1 запрос на датасет.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-blue-600 dark:text-blue-400 font-medium">Finnhub:</span>
                    <span className="text-gray-600 dark:text-gray-400">Быстрый, но ограниченная история (несколько лет).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-purple-600 dark:text-purple-400 font-medium">Twelve Data:</span>
                    <span className="text-gray-600 dark:text-gray-400">До 5000 дней истории (~13 лет), хороший баланс.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-indigo-600 dark:text-indigo-400 font-medium">Webull:</span>
                    <span className="text-gray-600 dark:text-gray-400">Можно использовать для котировок /results и мониторинга. Исторический импорт датасетов через него не основной сценарий.</span>
                  </div>
                </div>
              </div>

              {/* Telegram Monitoring */}
              <div className="border-l-4 border-yellow-500 pl-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">4. Мониторинг Telegram (фоновый процесс)</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <strong className="dark:text-gray-100">Назначение:</strong> Автоматическое обновление цен для мониторинга тикеров с отправкой уведомлений в Telegram.
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <strong className="dark:text-gray-100">Когда вызывается:</strong> При ручном обновлении на странице "Мониторинг" или по расписанию (за 11 и 1 минуту до закрытия рынка).
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <strong className="dark:text-gray-100">Endpoint:</strong> <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">/api/quote/:symbol</code> (используется Quote Provider)
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <strong className="dark:text-gray-100">Объем запросов:</strong> С 4-5 тикерами и задержкой 15с+2с джиттер: ~240 запросов/день.
                </p>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-green-600 dark:text-green-400 font-medium">Alpha Vantage:</span>
                    <span className="text-gray-600 dark:text-gray-400">⚠️ Может быть медленно при 5 тикерах (лимит 5/мин). Хватит на 500 запросов/день.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-blue-600 dark:text-blue-400 font-medium">Finnhub:</span>
                    <span className="text-gray-600 dark:text-gray-400">✅ Отлично! 60 запросов/минуту - легко справится с любым количеством тикеров.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-purple-600 dark:text-purple-400 font-medium">Twelve Data:</span>
                    <span className="text-gray-600 dark:text-gray-400">✅ Хорошо! 8 запросов/мин, 800/день - с запасом для 4-5 тикеров (~240/день).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-indigo-600 dark:text-indigo-400 font-medium">Webull:</span>
                    <span className="text-gray-600 dark:text-gray-400">Подходит как quote provider для мониторинга, если market-data subscription активен. Для heavy polling лучше Finnhub.</span>
                  </div>
                </div>
              </div>

              {/* Recommendations */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">💡 Рекомендации</h4>
                <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                  <p><strong>Для начинающих:</strong> Finnhub для котировок и мониторинга, Alpha Vantage для создания датасетов.</p>
                  <p><strong>Для привязки к брокеру:</strong> Webull как quote provider на /results и в /broker мониторинге, если у тебя включён market-data доступ.</p>
                  <p><strong>Для активной торговли:</strong> Twelve Data или Finnhub для всего - стабильные лимиты и хорошая скорость.</p>
                  <p><strong>Для экономии запросов:</strong> Alpha Vantage для редких операций, Twelve Data для ежедневного мониторинга.</p>
                  <p className="pt-2 border-t border-blue-200 dark:border-blue-800"><strong>Важно:</strong> С 15-секундной задержкой между запросами вы находитесь в безопасной зоне для всех провайдеров на бесплатных тарифах!</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // API Settings Tab
  const ApiTab = () => (
    <div className="space-y-4">
      {/* API Keys Info */}
      <div className="p-4 rounded-lg border bg-blue-50 dark:bg-blue-900/20 dark:border-blue-900/30">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">🔑 API ключи</div>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          API ключи настраиваются в файле <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">.env</code> на сервере.
          Для изменения ключей обратитесь к администратору или отредактируйте файл <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">~/stonks-config/.env</code> на сервере.
        </p>
      </div>

      {/* API Testing */}
      <div className="p-4 rounded-lg border dark:border-gray-700">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Тестирование API</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">Проверьте подключение к API провайдерам (используется тестовый символ AAPL)</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        </div>
      </div>
    </div>
  );

  // Interface Settings Tab
  const InterfaceTab = () => (
    <div className="space-y-6" onKeyDown={handleKeyDown}>
      {/* Управление табами аналитики */}
      <div className="p-6 rounded-lg border">
        <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Управление табами "Аналитика сделок"</div>
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          Перетаскивайте блоки для изменения порядка. Нажмите на блок, чтобы скрыть/показать вкладку.
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-500 mb-6">
          💡 Используйте кнопки ↑/↓ для клавиатурной навигации. Нажмите Escape для отмены перетаскивания.
        </div>

        {/* Draggable blocks */}
        <div
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
          role="listbox"
          aria-label="Порядок вкладок аналитики"
        >
          {analysisTabsConfig.map((tab, index) => (
            <div
              key={tab.id}
              role="option"
              aria-selected={draggedTab === tab.id}
              aria-grabbed={draggedTab === tab.id}
              aria-roledescription="Перетаскиваемый элемент"
              tabIndex={0}
              draggable
              onDragStart={(e) => handleDragStart(e, tab.id)}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, tab.id)}
              onDragEnd={handleDragEnd}
              onClick={(e) => {
                // Only toggle if it was a direct click, not drag end
                if (e.detail > 0) { // e.detail === 0 for keyboard "click"
                  toggleTabVisibility(tab.id, true);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleTabVisibility(tab.id, false);
                }
              }}
              className={`
                relative p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 outline-none
                focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                ${tab.visible
                  ? 'bg-white border-blue-200 shadow-sm hover:shadow-md hover:border-blue-300 dark:bg-gray-800 dark:border-gray-600'
                  : 'bg-gray-100 border-gray-300 opacity-60 hover:opacity-80 dark:bg-gray-700 dark:border-gray-600'
                }
                ${draggedTab === tab.id ? 'opacity-50 scale-105 shadow-lg z-10' : ''}
                ${dragOverTab === tab.id && draggedTab !== tab.id ? 'ring-2 ring-blue-500 ring-offset-2 scale-105' : ''}
                hover:scale-105 active:scale-95
              `}
              title={`${tab.visible ? 'Нажмите, чтобы скрыть' : 'Нажмите, чтобы показать'} • Перетаскивайте для изменения порядка`}
            >
              {/* Keyboard navigation buttons */}
              <div className="absolute top-1 right-1 flex flex-col gap-0.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    moveTab(tab.id, 'up');
                  }}
                  disabled={index === 0}
                  className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Переместить выше"
                  aria-label={`Переместить ${tab.label} выше`}
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    moveTab(tab.id, 'down');
                  }}
                  disabled={index === analysisTabsConfig.length - 1}
                  className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Переместить ниже"
                  aria-label={`Переместить ${tab.label} ниже`}
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>

              {/* Icon and label */}
              <div className="flex flex-col items-center text-center space-y-2">
                <div className={`
                  p-3 rounded-full transition-colors
                  ${tab.visible
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300'
                    : 'bg-gray-200 text-gray-500 dark:bg-gray-600 dark:text-gray-400'
                  }
                `}>
                  {getTabIcon(tab.id)}
                </div>

                <div className={`
                  text-sm font-medium leading-tight
                  ${tab.visible
                    ? 'text-gray-900 dark:text-gray-100'
                    : 'text-gray-500 line-through dark:text-gray-400'
                  }
                `}>
                  {tab.label}
                </div>
              </div>

              {/* Status indicator */}
              <div className={`
                absolute bottom-2 left-2 w-2 h-2 rounded-full
                ${tab.visible ? 'bg-green-400' : 'bg-red-400'}
              `} />
            </div>
          ))}
        </div>

        {/* Statistics */}
        <div className="mt-6 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <div>
            Видимые вкладки: <span className="font-medium text-green-600">
              {analysisTabsConfig.filter(tab => tab.visible).length}
            </span> из {analysisTabsConfig.length}
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-400"></div>
              Показана
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-400"></div>
              Скрыта
            </div>
          </div>
        </div>
      </div>

      {/* Предварительный просмотр */}
      <div className="p-4 rounded-lg border bg-gray-50 dark:bg-gray-800">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Предварительный просмотр</div>
        <div className="text-xs text-gray-500 mb-3">Так будут выглядеть вкладки в разделе "Аналитика сделок":</div>

        <div className="flex flex-wrap gap-2">
          {analysisTabsConfig
            .filter(tab => tab.visible)
            .map((tab, index) => (
              <div key={tab.id} className="flex items-center gap-2">
                <button className="flex items-center gap-2 px-3 py-1.5 rounded border bg-white border-gray-200 text-gray-700 text-sm">
                  {getTabIcon(tab.id)}
                  {tab.label}
                </button>
                {index < analysisTabsConfig.filter(tab => tab.visible).length - 1 && (
                  <span className="text-gray-300">•</span>
                )}
              </div>
            ))}
        </div>

        {analysisTabsConfig.filter(tab => tab.visible).length === 0 && (
          <div className="text-gray-500 text-sm italic">Нет видимых вкладок</div>
        )}
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

  // Autotrade Settings Tab
  const AutotradeTab = () => {
    useEffect(() => {
      if (!autotradeConfig && !autotradeLoading) {
        void loadAutotradeConfig();
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const isEnabled = autotradeConfig?.enabled ?? false;

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
            <div className="flex items-center gap-4">
              <button
                type="button"
                role="switch"
                aria-checked={isEnabled}
                onClick={() => void handleToggleAutotrade()}
                disabled={autotradeToggling || autotradeConfig === null}
                className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    isEnabled ? 'translate-x-7' : 'translate-x-0'
                  }`}
                />
              </button>
              <div>
                <div className={`text-sm font-semibold ${isEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}>
                  {autotradeToggling ? 'Применяется…' : isEnabled ? 'LIVE — автоторговля включена' : 'OFF — автоторговля выключена'}
                </div>
                {autotradeConfig?.lastModifiedAt ? (
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    Обновлено: {new Date(autotradeConfig.lastModifiedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/New_York' })} ET
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {autotradeError && (
            <div className="mt-3 text-sm text-red-600 dark:text-red-400">{autotradeError}</div>
          )}
          {autotradeOk && (
            <div className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{autotradeOk}</div>
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
  };

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
      {/* Header with save button */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Настройки</h2>
          {hasUnsavedChanges && (
            <span className="text-orange-500 font-bold text-lg" title="Есть несохранённые изменения">*</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {saveOk && <span className="text-sm text-green-600 dark:text-green-400">{saveOk}</span>}
          {saveErr && <span className="text-sm text-red-600 dark:text-red-400">{saveErr}</span>}
          <button
            onClick={handleGlobalSave}
            disabled={saving || !hasUnsavedChanges}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${hasUnsavedChanges
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-500'
              } disabled:opacity-50`}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Сохранение...' : 'Сохранить всё'}
          </button>
        </div>
      </div>

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
              {activeTab === 'general' && <GeneralTab />}
            </div>
            <div
              role="tabpanel"
              id="tabpanel-api"
              aria-labelledby="tab-api"
              hidden={activeTab !== 'api'}
            >
              {activeTab === 'api' && <ApiTab />}
            </div>
            <div
              role="tabpanel"
              id="tabpanel-telegram"
              aria-labelledby="tab-telegram"
              hidden={activeTab !== 'telegram'}
            >
              {activeTab === 'telegram' && <TelegramTab />}
            </div>
            <div
              role="tabpanel"
              id="tabpanel-interface"
              aria-labelledby="tab-interface"
              hidden={activeTab !== 'interface'}
            >
              {activeTab === 'interface' && <InterfaceTab />}
            </div>
            <div
              role="tabpanel"
              id="tabpanel-autotrade"
              aria-labelledby="tab-autotrade"
              hidden={activeTab !== 'autotrade'}
            >
              {activeTab === 'autotrade' && <AutotradeTab />}
            </div>
          </>
        )}
      </div>

      {/* Unsaved changes warning */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-4 right-4 bg-orange-100 border border-orange-300 rounded-lg p-3 shadow-lg flex items-center gap-3 z-50">
          <AlertTriangle className="w-5 h-5 text-orange-600" />
          <span className="text-sm text-orange-800">Есть несохранённые изменения</span>
          <button
            onClick={handleGlobalSave}
            disabled={saving}
            className="inline-flex items-center gap-1 px-3 py-1 bg-orange-600 text-white rounded text-sm hover:bg-orange-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Сохранить
          </button>
        </div>
      )}
    </div>
  );
}
