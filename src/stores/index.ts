import { create } from 'zustand';
import type { OHLCData, Strategy, BacktestResult, SavedDataset, SplitEvent } from '../types';
import { runBacktest as executeBacktest } from '../lib/backtest';
import { createStrategyFromTemplate, STRATEGY_TEMPLATES } from '../lib/strategy';
import { saveDatasetToJSON, loadDatasetFromJSON } from '../lib/data-persistence';
import { DatasetAPI } from '../lib/api';
import { adjustOHLCForSplits } from '../lib/utils';

interface AppState {
  // Data
  marketData: OHLCData[];
  currentDataset: SavedDataset | null;
  savedDatasets: Omit<SavedDataset, 'data'>[]; // Список метаданных датасетов с сервера
  currentSplits: SplitEvent[];
  lastAppliedSplitsKey: string | null;
  isLoading: boolean;
  error: string | null;
  // Provider settings
  dataProvider: 'alpha_vantage' | 'finnhub';
  // Notification settings
  watchThresholdPct: number; // близость к IBS-цели для уведомления, %
  setWatchThresholdPct: (value: number) => void;
  
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
  dataProvider: 'alpha_vantage',
  resultsQuoteProvider: 'finnhub',
  resultsRefreshProvider: 'finnhub',
  enhancerProvider: 'alpha_vantage',
  watchThresholdPct: 5,
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
      });
    } catch (e) {
      console.warn('Failed to load app settings:', e instanceof Error ? e.message : e);
    }
  },

  saveSettingsToServer: async () => {
    try {
      const { watchThresholdPct, resultsQuoteProvider, enhancerProvider, resultsRefreshProvider } = get();
      await DatasetAPI.saveAppSettings({ watchThresholdPct, resultsQuoteProvider, enhancerProvider, resultsRefreshProvider });
    } catch (e) {
      console.warn('Failed to save app settings:', e instanceof Error ? e.message : e);
    }
  },
  
  updateMarketData: (data: OHLCData[]) => {
    set({ marketData: data });
  },

  setSplits: (splits: SplitEvent[]) => {
    const key = JSON.stringify((splits || []).slice().sort((a, b) => a.date.localeCompare(b.date)));
    const { marketData, lastAppliedSplitsKey } = get();
    // Если данные уже есть и сплиты впервые появились — применим back-adjust на клиенте
    if (Array.isArray(marketData) && marketData.length > 0 && Array.isArray(splits) && splits.length > 0 && !lastAppliedSplitsKey) {
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


  loadJSONData: async (file: File) => {
    set({ isLoading: true, error: null });
    
    try {
      const dataset = await loadDatasetFromJSON(file);
      const { savedDatasets } = get();

      // Применяем back-adjust строго по сплитам из центрального хранилища
      let splits: SplitEvent[] = [];
      try { splits = await DatasetAPI.getSplits(dataset.ticker); } catch { splits = []; }
      const adjustedData = adjustOHLCForSplits(dataset.data, splits);
      const key = JSON.stringify((splits || []).slice().sort((a, b) => a.date.localeCompare(b.date)));
      
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
        console.log(`Датасет добавлен в библиотеку: ${dataset.name}`);
      }
      
      set({ 
        marketData: adjustedData,
        currentDataset: dataset,
        currentSplits: splits || [],
        lastAppliedSplitsKey: (splits && splits.length ? key : null),
        savedDatasets: updatedDatasets,
        isLoading: false 
      });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load JSON file',
        isLoading: false 
      });
    }
  },

  loadDatasetsFromServer: async () => {
    set({ isLoading: true, error: null });
    
    try {
      const datasets = await DatasetAPI.getDatasets();
      // Нормализуем тикер/имя и обеспечим стабильный id
      const normalized = datasets.map(d => {
        const ticker = (d.ticker || (d as unknown as { id?: string }).id || d.name).toUpperCase();
        return { ...d, ticker, name: ticker } as typeof d;
      });
      set({ 
        savedDatasets: normalized,
        isLoading: false 
      });
      console.log(`Загружено ${normalized.length} датасетов с сервера`);
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
    
    if (!marketData.length) {
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
      set({ 
        error: 'Сервер недоступен. Запустите сервер для сохранения данных.',
        isLoading: false 
      });
    }
  },

  loadDatasetFromServer: async (datasetId: string) => {
    set({ isLoading: true, error: null });
    
      try {
        const dataset = await DatasetAPI.getDataset(datasetId);
        // Загружаем только из центрального splits.json
        let splits: SplitEvent[] = [];
        try { splits = await DatasetAPI.getSplits(dataset.ticker); } catch { splits = []; }
        const adjusted = adjustOHLCForSplits(dataset.data, splits);
        const key = JSON.stringify((splits || []).slice().sort((a, b) => a.date.localeCompare(b.date)));
      set({
        marketData: adjusted,
        currentDataset: dataset,
        currentSplits: splits,
        lastAppliedSplitsKey: (splits && splits.length ? key : null),
        isLoading: false,
        error: null
      });

      // Если стратегии нет — создаём IBS по умолчанию и сразу запускаем бэктест
      const state = get();
      if (!state.currentStrategy) {
        const strat = createStrategyFromTemplate(STRATEGY_TEMPLATES[0]);
        set({ currentStrategy: strat });
      }
      // Небольшая задержка, чтобы set() успел примениться
      setTimeout(() => {
        get().runBacktest().catch(() => {});
      }, 0);

      console.log(`Датасет загружен с сервера: ${dataset.name}`);
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load dataset from server',
        isLoading: false 
      });
    }
  },

  updateDatasetOnServer: async () => {
    const { currentDataset, marketData } = get();
    if (!currentDataset) {
      set({ error: 'Нет загруженного датасета для обновления' });
      return;
    }
    if (!marketData.length) {
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
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete dataset from server',
        isLoading: false 
      });
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
      } catch (error) {
        set({ 
          error: error instanceof Error ? error.message : 'Failed to export dataset'
        });
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
        let splits: SplitEvent[] = [];
        try { splits = await DatasetAPI.getSplits(currentDataset.ticker); } catch { splits = []; }
        const adjusted = adjustOHLCForSplits(currentDataset.data as unknown as OHLCData[], splits);
        const key = JSON.stringify((splits || []).slice().sort((a, b) => a.date.localeCompare(b.date)));
        set({ marketData: adjusted, currentSplits: splits, lastAppliedSplitsKey: (splits && splits.length ? key : null) });
        marketData = adjusted;
      } catch (e) {
        console.warn('Failed to adjust OHLC for splits', e);
      }
    }
    if (!marketData.length || !currentStrategy) {
      set({ error: 'Missing data or strategy' });
      return;
    }
    set({ backtestStatus: 'running', error: null });
    try {
      const results = await executeBacktest(marketData, currentStrategy);
      set({ 
        backtestResults: results,
        backtestStatus: 'completed'
      });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Backtest failed',
        backtestStatus: 'error'
      });
    }
  },
  
  clearError: () => {
    set({ error: null });
  }
}));