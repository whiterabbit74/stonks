import { create } from 'zustand';
import type { OHLCData, Strategy, BacktestResult, SavedDataset, SplitEvent } from '../types';

// Interface for analysis tabs configuration
export interface AnalysisTabConfig {
  id: string;
  label: string;
  visible: boolean;
}
import { runBacktest as executeBacktest } from '../lib/backtest';
import { createStrategyFromTemplate, STRATEGY_TEMPLATES } from '../lib/strategy';
import { saveDatasetToJSON, loadDatasetFromJSON } from '../lib/data-persistence';
import { DatasetAPI } from '../lib/api';
import { adjustOHLCForSplits, dedupeDailyOHLC } from '../lib/utils';
import { parseCSV } from '../lib/validation';
import { logError, logInfo } from '../lib/error-logger';

interface AppState {
  // Data
  marketData: OHLCData[];
  currentDataset: SavedDataset | null;
  savedDatasets: Omit<SavedDataset, 'data'>[]; // Список метаданных датасетов с сервера
  currentSplits: SplitEvent[];
  lastAppliedSplitsKey: string | null;
  isLoading: boolean;
  error: string | null;
  // Race condition prevention
  currentLoadOperation: AbortController | null;
  // Provider settings
  dataProvider: 'alpha_vantage' | 'finnhub';
  // Notification settings
  watchThresholdPct: number; // близость к IBS-цели для уведомления, %
  setWatchThresholdPct: (value: number) => void;
  
  // Chart settings
  indicatorPanePercent: number; // высота панели индикаторов (IBS/объём), %
  setIndicatorPanePercent: (value: number) => void;
  
  // Commission settings
  commissionType: 'fixed' | 'percentage' | 'combined';
  commissionFixed: number; // в валюте (например, в долларах)
  commissionPercentage: number; // в процентах (например, 0.1 для 0.1%)
  setCommissionType: (type: 'fixed' | 'percentage' | 'combined') => void;
  setCommissionFixed: (value: number) => void;
  setCommissionPercentage: (value: number) => void;
  
  // Analysis tabs configuration
  analysisTabsConfig: AnalysisTabConfig[];
  setAnalysisTabsConfig: (config: AnalysisTabConfig[]) => void;
  
  // Strategy
  currentStrategy: Strategy | null;
  
  // Backtest
  backtestResults: BacktestResult | null;
  backtestStatus: 'idle' | 'running' | 'completed' | 'error';
  
  // Actions
  updateMarketData: (data: OHLCData[]) => void;
  setSplits: (splits: SplitEvent[]) => void;
  setDataProvider: (provider: 'alpha_vantage' | 'finnhub') => void;
  // Источники API управления из настроек
  resultsQuoteProvider: 'alpha_vantage' | 'finnhub';
  resultsRefreshProvider: 'alpha_vantage' | 'finnhub';
  enhancerProvider: 'alpha_vantage' | 'finnhub';
  setResultsQuoteProvider: (p: 'alpha_vantage' | 'finnhub') => void;
  setResultsRefreshProvider: (p: 'alpha_vantage' | 'finnhub') => void;
  setEnhancerProvider: (p: 'alpha_vantage' | 'finnhub') => void;
  loadJSONData: (file: File) => Promise<void>;
  loadDatasetsFromServer: () => Promise<void>;
  saveDatasetToServer: (ticker: string, name?: string) => Promise<void>;
  loadDatasetFromServer: (datasetId: string) => Promise<void>;
  deleteDatasetFromServer: (datasetId: string) => Promise<void>;
  exportDatasetAsJSON: (datasetId: string) => void;
  setStrategy: (strategy: Strategy | null) => void;
  runBacktest: () => Promise<void>;
  clearError: () => void;
  // Settings persistence
  loadSettingsFromServer: () => Promise<void>;
  saveSettingsToServer: () => Promise<void>;
  // Update current dataset on server
  updateDatasetOnServer: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  marketData: [],
  currentDataset: null,
  savedDatasets: [],
  currentSplits: [],
  lastAppliedSplitsKey: null,
  isLoading: false,
  error: null,
  currentLoadOperation: null,
  dataProvider: 'alpha_vantage',
  resultsQuoteProvider: 'finnhub',
  resultsRefreshProvider: 'finnhub',
  enhancerProvider: 'alpha_vantage',
  watchThresholdPct: 5,
  indicatorPanePercent: 10,
  commissionType: 'percentage',
  commissionFixed: 1.0,
  commissionPercentage: 0.1,
  // ИНИЦИАЛИЗАЦИЯ: Загружаем из localStorage или дефолтные настройки
  analysisTabsConfig: (() => {
    try {
      const saved = localStorage.getItem('analysisTabsConfig');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load analysis tabs config from localStorage:', e);
    }
    // Дефолтные настройки
    return [
      { id: 'price', label: 'Цена', visible: true },
      { id: 'equity', label: 'Equity', visible: true },
      { id: 'buyhold', label: 'Buy and hold', visible: true },
      { id: 'drawdown', label: 'Просадки', visible: true },
      { id: 'trades', label: 'Сделки', visible: true },
      { id: 'profit', label: 'Profit factor', visible: true },
      { id: 'duration', label: 'Длительность', visible: true },
      { id: 'openDayDrawdown', label: 'Стартовая просадка', visible: true },
      { id: 'margin', label: 'Маржа', visible: true },
      { id: 'buyAtClose', label: 'Покупка на открытии', visible: true },
      { id: 'buyAtClose4', label: 'Мультитикер', visible: true },
      { id: 'noStopLoss', label: 'Без stop loss', visible: true },
      { id: 'singlePosition', label: 'Одна позиция', visible: true },
      { id: 'splits', label: 'Сплиты', visible: true }
    ];
  })(),
  currentStrategy: null,
  backtestResults: null,
  backtestStatus: 'idle',
  // Load settings at startup (caller should invoke once)
  loadSettingsFromServer: async () => {
    try {
      const s = await DatasetAPI.getAppSettings();
      set({
        watchThresholdPct: s.watchThresholdPct,
        resultsQuoteProvider: s.resultsQuoteProvider,
        enhancerProvider: s.enhancerProvider,
        resultsRefreshProvider: s.resultsRefreshProvider || s.resultsQuoteProvider,
        indicatorPanePercent: typeof s.indicatorPanePercent === 'number' ? s.indicatorPanePercent : 10,
        commissionType: s.commissionType || 'percentage',
        commissionFixed: typeof s.commissionFixed === 'number' ? s.commissionFixed : 1.0,
        commissionPercentage: typeof s.commissionPercentage === 'number' ? s.commissionPercentage : 0.1,
        // analysisTabsConfig теперь сохраняется в localStorage, не на сервере
      });
    } catch (e) {
      console.warn('Failed to load app settings:', e instanceof Error ? e.message : e);
    }
  },

  saveSettingsToServer: async () => {
    try {
      const { watchThresholdPct, resultsQuoteProvider, enhancerProvider, resultsRefreshProvider, indicatorPanePercent, commissionType, commissionFixed, commissionPercentage } = get();
      await DatasetAPI.saveAppSettings({ watchThresholdPct, resultsQuoteProvider, enhancerProvider, resultsRefreshProvider, indicatorPanePercent, commissionType, commissionFixed, commissionPercentage });
      // analysisTabsConfig теперь сохраняется автоматически в localStorage
    } catch (e) {
      console.warn('Failed to save app settings:', e instanceof Error ? e.message : e);
      throw e; // ИСПРАВЛЕНИЕ: перебрасываем ошибку, чтобы AppSettings мог ее обработать
    }
  },
  
  setIndicatorPanePercent: (value: number) => set({ indicatorPanePercent: value }),
  

  updateMarketData: (data: OHLCData[]) => {
    set({ marketData: dedupeDailyOHLC(data) });
  },

  setSplits: (splits: SplitEvent[]) => {
    const key = JSON.stringify((splits || []).slice().sort((a, b) => a.date.localeCompare(b.date)));
    const { marketData, lastAppliedSplitsKey } = get();
    // Apply splits only if they are different from previously applied ones
    const shouldApplySplits = Array.isArray(marketData) && marketData.length > 0 && 
                             Array.isArray(splits) && splits.length > 0 && 
                             key !== lastAppliedSplitsKey; // Compare actual split keys, not just existence
    
    if (shouldApplySplits) {
      const adjusted = adjustOHLCForSplits(marketData, splits);
      set({ currentSplits: splits, marketData: adjusted, lastAppliedSplitsKey: key });
    } else {
      set({ currentSplits: splits });
    }
  },

  setDataProvider: (provider: 'alpha_vantage' | 'finnhub') => {
    set({ dataProvider: provider });
  },

  setResultsQuoteProvider: (p: 'alpha_vantage' | 'finnhub') => set({ resultsQuoteProvider: p }),
  setResultsRefreshProvider: (p: 'alpha_vantage' | 'finnhub') => set({ resultsRefreshProvider: p }),
  setEnhancerProvider: (p: 'alpha_vantage' | 'finnhub') => set({ enhancerProvider: p }),

  setWatchThresholdPct: (value: number) => {
    set({ watchThresholdPct: value });
  },

  setCommissionType: (type: 'fixed' | 'percentage' | 'combined') => {
    set({ commissionType: type });
  },

  setCommissionFixed: (value: number) => {
    set({ commissionFixed: value });
  },

  setCommissionPercentage: (value: number) => {
    set({ commissionPercentage: value });
  },

  setAnalysisTabsConfig: (config: AnalysisTabConfig[]) => {
    set({ analysisTabsConfig: config });
    // Автосохранение в localStorage
    try {
      localStorage.setItem('analysisTabsConfig', JSON.stringify(config));
    } catch (e) {
      console.warn('Failed to save analysis tabs config to localStorage:', e);
    }
  },

  loadJSONData: async (file: File) => {
    set({ isLoading: true, error: null });
    
    try {
      const dataset = await loadDatasetFromJSON(file);
      const { savedDatasets } = get();

      // Применяем back-adjust по сплитам из самого датасета (если есть)
      const splits: SplitEvent[] = Array.isArray(dataset.splits) ? dataset.splits : [];
      const adjustedData = dedupeDailyOHLC(adjustOHLCForSplits(dataset.data, splits));
      
      // Проверяем, есть ли уже такой датасет в библиотеке
      const existingIndex = savedDatasets.findIndex(d => d.name === dataset.name);
      
      let updatedDatasets;
      if (existingIndex >= 0) {
        // Заменяем существующий
        updatedDatasets = [...savedDatasets];
        updatedDatasets[existingIndex] = dataset;
        console.log(`Датасет обновлен в библиотеке: ${dataset.name}`);
      } else {
        // Добавляем новый в библиотеку
        updatedDatasets = [...savedDatasets, dataset];
        console.log(`Датасет добавлен в библиотеке: ${dataset.name}`);
      }
      
      set({ 
        marketData: adjustedData,
        currentDataset: dataset,
        currentSplits: splits,
        savedDatasets: updatedDatasets,
        isLoading: false 
      });
      try {
        logInfo('data', 'JSON dataset loaded', { name: dataset?.name, points: adjustedData?.length, splits: splits?.length }, 'store.loadJSONData');
      } catch { /* ignore */ }
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load JSON file',
        isLoading: false 
      });
      try { logError('data', 'Failed to load JSON file', { fileName: file?.name }, 'store.loadJSONData', (error as any)?.stack); } catch { /* ignore */ }
    }
  },

  loadDatasetsFromServer: async () => {
    // Cancel any current dataset loading operation since we're refreshing the list
    const currentState = get();
    if (currentState.currentLoadOperation) {
      currentState.currentLoadOperation.abort();
    }

    set({ isLoading: true, error: null, currentLoadOperation: null });
    
    try {
      const datasets = await DatasetAPI.getDatasets();
      // Нормализуем тикер/имя и обеспечим стабильный id
      const normalized = datasets.map(d => {
        // Safe type checking instead of unsafe type assertion
        const hasId = 'id' in d && typeof (d as any).id === 'string';
        const ticker = (d.ticker || (hasId ? (d as any).id : null) || d.name).toUpperCase();
        return { ...d, ticker, name: ticker } as typeof d;
      });
      set({ 
        savedDatasets: normalized,
        isLoading: false 
      });
      console.log(`Загружено ${normalized.length} датасетов с сервера`);
      try { logInfo('network', 'Datasets loaded from server', { count: normalized.length }, 'store.loadDatasetsFromServer'); } catch { /* ignore */ }
    } catch (error) {
      // Если сервер недоступен, просто логируем ошибку, но не показываем пользователю
      console.warn('Сервер недоступен, работаем без сохранения:', error instanceof Error ? error.message : 'Unknown error');
      set({ 
        savedDatasets: [],
        isLoading: false,
        error: null // Не показываем ошибку пользователю
      });
    }
  },

  saveDatasetToServer: async (ticker: string, name?: string) => {
    const { marketData } = get();
    
    if (!marketData || !marketData.length) {
      set({ error: 'Нет данных для сохранения' });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      // Создаем новый датасет (без поля splits)
      const dataset: SavedDataset = {
        name: name || `${ticker}_${new Date().toISOString().split('T')[0]}`,
        ticker: ticker.toUpperCase(),
        data: [...marketData],
        uploadDate: new Date().toISOString(),
        dataPoints: marketData.length,
        dateRange: {
          from: marketData[0].date.toISOString().split('T')[0],
          to: marketData[marketData.length - 1].date.toISOString().split('T')[0]
        }
      } as SavedDataset;

      await DatasetAPI.saveDataset(dataset);
      
      // Обновляем список датасетов
      await get().loadDatasetsFromServer();
      
      set({ 
        currentDataset: dataset,
        isLoading: false 
      });

      console.log(`Датасет сохранен на сервере: ${dataset.name}`);
    } catch (error) {
      console.warn('Не удалось сохранить на сервер:', error instanceof Error ? error.message : 'Unknown error');
      try { logError('network', 'Save dataset failed', { ticker, points: marketData?.length }, 'store.saveDatasetToServer', (error as any)?.stack); } catch { /* ignore */ }
      set({ 
        error: 'Сервер недоступен. Запустите сервер для сохранения данных.',
        isLoading: false 
      });
    }
  },

  loadDatasetFromServer: async (datasetId: string) => {
    // Cancel any previous operation
    const currentState = get();
    if (currentState.currentLoadOperation) {
      currentState.currentLoadOperation.abort();
    }

    // Create new abort controller for this operation
    const abortController = new AbortController();
    set({ isLoading: true, error: null, currentLoadOperation: abortController });
    
    try {
      // Check if operation was cancelled before starting
      if (abortController.signal.aborted) return;

      const dataset = await DatasetAPI.getDataset(datasetId);

      // Check if operation was cancelled after dataset fetch
      if (abortController.signal.aborted) return;

      // Если датасет уже пересчитан на сервере — не применяем сплиты повторно
      const isAdjusted = 'adjustedForSplits' in dataset && Boolean(dataset.adjustedForSplits);
      if (isAdjusted) {
        // Check if still current operation before updating state
        if (get().currentLoadOperation === abortController) {
          set({
            marketData: dedupeDailyOHLC(dataset.data as OHLCData[]),
            currentDataset: dataset,
            currentSplits: [],
            lastAppliedSplitsKey: null,
            isLoading: false,
            error: null,
            currentLoadOperation: null
          });
        }
      } else {
        // Загружаем только из центрального splits.json и применяем локально
        let splits: SplitEvent[] = [];
        try { splits = await DatasetAPI.getSplits(dataset.ticker); } catch { splits = []; }
        
        // Check if operation was cancelled after splits fetch
        if (abortController.signal.aborted) return;

        const adjusted = dedupeDailyOHLC(adjustOHLCForSplits(dataset.data, splits));
        const key = JSON.stringify((splits || []).slice().sort((a, b) => a.date.localeCompare(b.date)));
        
        // Check if still current operation before updating state
        if (get().currentLoadOperation === abortController) {
          set({
            marketData: adjusted,
            currentDataset: dataset,
            currentSplits: splits,
            lastAppliedSplitsKey: (splits && splits.length ? key : null),
            isLoading: false,
            error: null,
            currentLoadOperation: null
          });
        }
      }

      // Only run backtest if this is still the current operation
      if (!abortController.signal.aborted && get().currentLoadOperation === abortController) {
        // Если стратегии нет — создаём IBS по умолчанию
        const state = get();
        if (!state.currentStrategy) {
          const strat = createStrategyFromTemplate(STRATEGY_TEMPLATES[0]);
          set({ currentStrategy: strat });
        }
        // Run backtest asynchronously but don't await to prevent blocking
        get().runBacktest().catch((error) => {
          console.error('Backtest failed after dataset load:', error);
          try { logError('backtest', 'Backtest failed after dataset load', {}, 'store.loadDatasetFromServer', (error as any)?.stack); } catch { /* ignore */ }
        });

        console.log(`Датасет загружен с сервера: ${dataset.name}`);
        try { logInfo('network', 'Dataset loaded', { id: datasetId, points: (dataset?.data as any[])?.length }, 'store.loadDatasetFromServer'); } catch { /* ignore */ }
      }
    } catch (error) {
      // Only update error state if this operation wasn't cancelled
      if (!abortController.signal.aborted && get().currentLoadOperation === abortController) {
        set({ 
          error: error instanceof Error ? error.message : 'Failed to load dataset from server',
          isLoading: false,
          currentLoadOperation: null
        });
        try { logError('network', 'Dataset load failed', { id: datasetId }, 'store.loadDatasetFromServer', (error as any)?.stack); } catch { /* ignore */ }
      }
    }
  },

  updateDatasetOnServer: async () => {
    const { currentDataset, marketData } = get();
    if (!currentDataset) {
      set({ error: 'Нет загруженного датасета для обновления' });
      return;
    }
    if (!marketData || !marketData.length) {
      set({ error: 'Нет данных для обновления датасета' });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const updated: SavedDataset = {
        name: currentDataset.name,
        ticker: currentDataset.ticker,
        data: [...marketData],
        uploadDate: new Date().toISOString(),
        dataPoints: marketData.length,
        dateRange: {
          from: marketData[0].date.toISOString().split('T')[0],
          to: marketData[marketData.length - 1].date.toISOString().split('T')[0],
        },
      } as SavedDataset;
      // Используем стабильный ID по тикеру, а не name
      await DatasetAPI.updateDataset(currentDataset.ticker, updated);
      await get().loadDatasetsFromServer();
      set({ currentDataset: updated, isLoading: false });
      console.log(`Датасет обновлён на сервере: ${updated.name}`);
    } catch (error) {
      console.warn('Не удалось обновить датасет на сервере', error);
      try { logError('network', 'Dataset update failed', { id: currentDataset?.ticker }, 'store.updateDatasetOnServer', (error as any)?.stack); } catch { /* ignore */ }
      set({ error: error instanceof Error ? error.message : 'Failed to update dataset on server', isLoading: false });
    }
  },

  deleteDatasetFromServer: async (datasetId: string) => {
    set({ isLoading: true, error: null });
    
    try {
      await DatasetAPI.deleteDataset(datasetId);
      
      // Обновляем список датасетов
      await get().loadDatasetsFromServer();
      
      // Если удаляем текущий датасет, сбрасываем его
      const { currentDataset } = get();
      if (currentDataset && currentDataset.name === datasetId) {
        set({ currentDataset: null });
      }
      
      set({ isLoading: false });
      console.log(`Датасет удален с сервера: ${datasetId}`);
      try { logInfo('network', 'Dataset deleted', { id: datasetId }, 'store.deleteDatasetFromServer'); } catch { /* ignore */ }
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete dataset from server',
        isLoading: false 
      });
      try { logError('network', 'Dataset delete failed', { id: datasetId }, 'store.deleteDatasetFromServer', (error as any)?.stack); } catch { /* ignore */ }
    }
  },

  exportDatasetAsJSON: (datasetId: string) => {
    const { savedDatasets } = get();
    
    const datasetMeta = savedDatasets.find(d => d.name === datasetId);
    if (!datasetMeta) {
      set({ error: 'Датасет не найден' });
      return;
    }

    (async () => {
      try {
        // Загружаем полный датасет с сервера перед экспортом
        const full = await DatasetAPI.getDataset(datasetMeta.name);
        saveDatasetToJSON(full.data, full.ticker, full.name);
        try { logInfo('network', 'Dataset exported', { id: datasetMeta.name, points: (full?.data as any[])?.length }, 'store.exportDatasetAsJSON'); } catch { /* ignore */ }
      } catch (error) {
        set({ 
          error: error instanceof Error ? error.message : 'Failed to export dataset'
        });
        try { logError('network', 'Dataset export failed', { id: datasetMeta.name }, 'store.exportDatasetAsJSON', (error as any)?.stack); } catch { /* ignore */ }
      }
    })();
  },
  
  setStrategy: (strategy: Strategy | null) => {
    set({ currentStrategy: strategy });
  },
  
  runBacktest: async () => {
    let { marketData, currentStrategy, currentDataset } = get(); // eslint-disable-line prefer-const
    // Гарантируем стратегию IBS по умолчанию (без динамического импорта)
    if (!currentStrategy) {
      currentStrategy = createStrategyFromTemplate(STRATEGY_TEMPLATES[0]);
      set({ currentStrategy });
    }
    // Если данных нет, но есть выбранный датасет — используем его
    if ((!marketData || marketData.length === 0) && currentDataset && Array.isArray(currentDataset.data) && currentDataset.data.length) {
      try {
        // Если датасет уже пересчитан на сервере — используем как есть
        const isAdjusted = 'adjustedForSplits' in currentDataset && Boolean(currentDataset.adjustedForSplits);
        if (isAdjusted) {
          const cleaned = dedupeDailyOHLC(currentDataset.data as OHLCData[]);
          set({ marketData: cleaned, currentSplits: [], lastAppliedSplitsKey: null });
          marketData = cleaned;
        } else {
          let splits: SplitEvent[] = [];
          try { splits = await DatasetAPI.getSplits(currentDataset.ticker); } catch { splits = []; }
          const adjusted = dedupeDailyOHLC(adjustOHLCForSplits(currentDataset.data as OHLCData[], splits));
          const key = JSON.stringify((splits || []).slice().sort((a, b) => a.date.localeCompare(b.date)));
          set({ marketData: adjusted, currentSplits: splits, lastAppliedSplitsKey: (splits && splits.length ? key : null) });
          marketData = adjusted;
        }
      } catch (e) {
        console.warn('Failed to adjust OHLC for splits', e);
      }
    }
    if (!marketData.length || !currentStrategy) {
      set({ error: 'Отсутствуют данные или стратегия' });
      return;
    }
    set({ backtestStatus: 'running', error: null });
    try {
      const results = await executeBacktest(marketData, currentStrategy);
      set({ 
        backtestResults: results,
        backtestStatus: 'completed'
      });
      try { logInfo('backtest', 'Backtest completed', { trades: results?.trades?.length, equity: results?.equity?.length }, 'store.runBacktest'); } catch { /* ignore */ }
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Ошибка бэктеста',
        backtestStatus: 'error'
      });
      try { logError('backtest', 'Backtest failed', {}, 'store.runBacktest', (error as any)?.stack); } catch { /* ignore */ }
    }
  },
  
  clearError: () => {
    set({ error: null });
  }
}));