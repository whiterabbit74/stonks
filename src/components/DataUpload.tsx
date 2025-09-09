import React, { useRef, useEffect } from 'react';
import { Upload, CheckCircle, ArrowRight, Download, TrendingUp, Loader2, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../stores';
import { DatasetLibrary } from './DatasetLibrary';
import { API_BASE_URL, DatasetAPI } from '../lib/api';
import { createStrategyFromTemplate, STRATEGY_TEMPLATES } from '../lib/strategy';
import { useNavigate } from 'react-router-dom';

interface DataUploadProps {
  onNext?: () => void;
}

export function DataUpload({ onNext }: DataUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const { marketData, currentDataset, isLoading, error, /* uploadData, */ loadJSONData, loadDatasetsFromServer } = useAppStore();

  // Загружаем список датасетов при монтировании компонента ТОЛЬКО после успешной авторизации
  useEffect(() => {
    fetch(`${API_BASE_URL}/auth/check`, { credentials: 'include' }).then(r => {
      if (r.ok) loadDatasetsFromServer();
    }).catch(() => {});
  }, [loadDatasetsFromServer]);

  const handleFileSelect = async (file: File) => {
    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      await loadJSONData(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    // Only accept JSON
    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      handleFileSelect(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  // Удаляем использование тестовых данных

  if (marketData.length > 0) {
    return (
      <div className="space-y-6">
        {/* Список тикеров показан ниже карточки */}

        {/* Summary card */}
        {currentDataset ? (
          <div className="mx-auto max-w-2xl">
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-b from-blue-50 to-white p-5 shadow-sm dark:from-gray-900 dark:to-gray-900 dark:border-gray-800">
              <div className="flex items-center gap-3 mb-2">
                <div className="inline-flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full dark:bg-blue-950/40">
                  <CheckCircle className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm text-blue-700 dark:text-blue-300">Датасет загружен</div>
                  <div className="text-xl font-semibold text-blue-900 dark:text-blue-200">{currentDataset.companyName || currentDataset.ticker}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-200 dark:border-blue-900/50">{currentDataset.ticker}</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700">{currentDataset.dataPoints.toLocaleString()} точек</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700">{currentDataset.dateRange.from} — {currentDataset.dateRange.to}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4 dark:bg-green-900/30">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 dark:text-gray-100">Данные загружены</h3>
            <p className="text-gray-600 mb-4 dark:text-gray-300">{marketData.length} строк готовы для бэктеста</p>

          </div>
        )}

        {/* Библиотека датасетов (всегда доступна) */}
        <div className="mt-6 relative">
          {isLoading && (
            <div className="absolute inset-0 bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm z-10 rounded-lg" />
          )}
          <DatasetLibrary onAfterLoad={onNext} />
        </div>

        {/* Популярные тикеры с горизонтальной прокруткой */}
        <div className="mt-6 relative">
          {isLoading && (
            <div className="absolute inset-0 bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm z-10 rounded-lg" />
          )}
          <PopularTickers onTickerLoad={onNext} />
        </div>

        <div className="space-y-4">
          
          {onNext && (
            <div>
              <button
                onClick={onNext}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium hover-lift"
              >
                Дальше
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto relative">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-10 rounded-2xl flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Загрузка данных...</div>
          </div>
        </div>
      )}
      
      {/* Error Notification */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 dark:bg-red-950/30 dark:border-red-900/40">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-medium text-red-800 dark:text-red-200">Ошибка загрузки</div>
            <div className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</div>
          </div>
        </div>
      )}
      
      <div
        className="relative rounded-2xl border-2 border-dashed border-gray-300 bg-white p-10 text-center shadow-sm hover:shadow-md transition dark:bg-gray-900 dark:border-gray-700"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
          {isLoading ? (
            <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
          ) : (
            <Upload className="h-8 w-8 text-blue-600" />
          )}
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2 dark:text-gray-100">
          {isLoading ? 'Обработка данных...' : 'Загрузите данные для тестирования'}
        </h3>
        <p className="text-gray-600 mb-6 dark:text-gray-300">
          {isLoading 
            ? 'Пожалуйста, подождите, пока мы обрабатываем ваши данные...'
            : 'Перетащите JSON-файл сюда или выберите его вручную.'
          }
        </p>
        <div className="flex items-center justify-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleFileInput}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 font-medium text-white shadow hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {isLoading ? 'Загрузка...' : 'Выбрать JSON'}
          </button>
          <button
            onClick={() => document.getElementById('dataset-library')?.scrollIntoView({ behavior: 'smooth' })}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Download className="h-4 w-4" /> Выбрать из библиотеки
          </button>
        </div>
      </div>

      <div id="dataset-library" className="mt-10">
        <DatasetLibrary />
      </div>

      <div className="mt-6">
        <PopularTickers />
      </div>
    </div>
  );
}

interface PopularTickersProps {
  onTickerLoad?: () => void;
}

function PopularTickers({ onTickerLoad }: PopularTickersProps) {
  const navigate = useNavigate();
  const { currentDataset, currentStrategy, setStrategy, loadDatasetFromServer, loadDatasetsFromServer, runBacktest, isLoading: globalLoading } = useAppStore();
  const [loadingTicker, setLoadingTicker] = React.useState<string | null>(null);

  // Список из 50 популярных тикеров
  const popularTickers = [
    'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'TSLA', 'META', 'NVDA', 'BRK.B', 'UNH', 'JNJ',
    'XOM', 'JPM', 'V', 'PG', 'HD', 'CVX', 'MA', 'BAC', 'ABBV', 'PFE',
    'AVGO', 'KO', 'LLY', 'TMO', 'COST', 'PEP', 'ASML', 'WMT', 'MRK', 'ORCL',
    'AMD', 'ADBE', 'DHR', 'ACN', 'VZ', 'NKE', 'CRM', 'TXN', 'MCD', 'LIN',
    'QCOM', 'BMY', 'HON', 'ABT', 'NFLX', 'PM', 'T', 'RTX', 'UPS', 'LOW'
  ];

  const handleTickerClick = async (ticker: string) => {
    try {
      setLoadingTicker(ticker);
      await loadDatasetsFromServer();
      await loadDatasetFromServer(ticker);
      
      // гарантируем наличие стратегии
      if (!currentStrategy) {
        try {
          const tpl = STRATEGY_TEMPLATES[0];
          const strat = createStrategyFromTemplate(tpl);
          setStrategy(strat);
        } catch (e) {
          console.warn('Failed to ensure default strategy', e);
        }
      }
      
      setLoadingTicker(null);
      
      // мгновенно переходим на «Результаты» через роутер
      try { navigate('/results'); } catch { /* ignore */ }
      if (onTickerLoad) onTickerLoad();
      
      // запускаем бэктест в фоне, не блокируя UI
      try { runBacktest?.(); } catch (e) { console.warn('Failed to start backtest', e); }
    } catch (e) {
      console.warn('Failed to load ticker', e);
      setLoadingTicker(null);
    }
  };

  return (
    <div className="bg-white rounded-lg border p-4 mb-6 dark:bg-gray-900 dark:border-gray-800">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-8 h-8 bg-green-50 rounded-lg dark:bg-green-950/20">
          <TrendingUp className="w-4 h-4 text-green-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base">
            Популярные тикеры
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Нажмите на тикер для быстрой загрузки данных
          </p>
        </div>
      </div>

      {/* Horizontal scrolling ticker grid */}
      <div className="overflow-x-auto">
        <div className="flex gap-2 pb-2" style={{ width: 'fit-content' }}>
          {popularTickers.map((ticker) => {
            const isActive = currentDataset?.ticker === ticker;
            const isLoading = loadingTicker === ticker;
            const isDisabled = isLoading || globalLoading;
            
            return (
              <button
                key={ticker}
                onClick={() => handleTickerClick(ticker)}
                disabled={isDisabled}
                className={`flex-shrink-0 flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 min-w-[60px] h-9 ${
                  isActive
                    ? 'bg-blue-100 text-blue-800 border-2 border-blue-300 shadow-sm dark:bg-blue-950/30 dark:text-blue-200 dark:border-blue-900/50'
                    : isDisabled
                    ? 'bg-gray-100 text-gray-500 border border-gray-200 cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
                    : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:border-gray-300 hover:shadow-sm dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-700 dark:hover:border-gray-600'
                }`}
              >
                {isLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : globalLoading ? (
                  <span className="opacity-50">{ticker}</span>
                ) : (
                  ticker
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}