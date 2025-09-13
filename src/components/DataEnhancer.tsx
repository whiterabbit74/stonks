import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, Upload, Download, TrendingUp, Loader2 } from 'lucide-react';
import { useAppStore } from '../stores';
import { fetchWithCreds, API_BASE_URL } from '../lib/api';
import { parseOHLCDate } from '../lib/utils';
import { DatasetLibrary } from './DatasetLibrary';

interface DataEnhancerProps {
  onNext?: () => void;
}

// interface YahooFinanceData {
//   date: string;
//   open: number;
//   high: number;
//   low: number;
//   close: number;
//   adjClose: number;
//   volume: number;
// }

type TabType = 'enhance' | 'upload';

export function DataEnhancer({ onNext }: DataEnhancerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { 
    enhancerProvider, 
    updateMarketData, 
    saveDatasetToServer, 
    isLoading: globalLoading,
    error: storeError,
    loadJSONData,
    loadDatasetsFromServer,
    loadDatasetFromServer
  } = useAppStore();
  
  const [activeTab, setActiveTab] = useState<TabType>('enhance');
  const [ticker, setTicker] = useState('AAPL');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // При смене вкладки очищаем сообщения
  useEffect(() => {
    setError(null);
    setSuccess(null);
  }, [activeTab]);

  // Устанавливаем тикер из текущего датасета если есть
  useEffect(() => {
    if (currentDataset?.ticker) {
      setTicker(currentDataset.ticker);
    }
  }, [currentDataset]);

  // Загружаем список датасетов при монтировании компонента
  useEffect(() => {
    fetch(`${API_BASE_URL}/auth/check`, { credentials: 'include' }).then(r => {
      if (r.ok) loadDatasetsFromServer();
    }).catch((error) => {
      console.warn('Auth check failed:', error);
    });
  }, [loadDatasetsFromServer]);

  // Ticker lists by category
  const tickerCategories = {
    'Популярные': [
      'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'TSLA', 'META', 'NVDA', 'BRK.B', 'UNH', 'JNJ',
      'XOM', 'JPM', 'V', 'PG', 'HD', 'CVX', 'MA', 'BAC', 'ABBV', 'PFE'
    ],
    'NASDAQ 100': [
      'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'GOOG', 'META', 'TSLA', 'AVGO', 'COST',
      'NFLX', 'TMUS', 'ASML', 'ADBE', 'PEP', 'AMD', 'LIN', 'CSCO', 'TXN', 'QCOM',
      'CMCSA', 'HON', 'INTU', 'AMGN', 'AMAT', 'ISRG', 'BKNG', 'ADP', 'VRTX', 'GILD'
    ],
    'S&P 500': [
      'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'BRK.B', 'GOOG', 'META', 'TSLA', 'UNH',
      'XOM', 'LLY', 'JPM', 'V', 'JNJ', 'WMT', 'MA', 'PG', 'HD', 'CVX',
      'MRK', 'ABBV', 'AVGO', 'BAC', 'KO', 'PEP', 'COST', 'PFE', 'TMO', 'MCD'
    ],
    'Технологии': [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'NFLX', 'ADBE', 'CRM',
      'ORCL', 'AMD', 'INTC', 'CSCO', 'IBM', 'QCOM', 'TXN', 'AVGO', 'AMAT', 'MU',
      'LRCX', 'ADI', 'KLAC', 'MCHP', 'CDNS', 'SNPS', 'FTNT', 'PANW', 'CRWD', 'ZS'
    ],
    'Финансы': [
      'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BLK', 'SCHW', 'AXP', 'USB',
      'TFC', 'PNC', 'COF', 'BK', 'STT', 'FITB', 'RF', 'KEY', 'CFG', 'HBAN',
      'V', 'MA', 'PYPL', 'SQ', 'FIS', 'FISV', 'ADP', 'PAYX', 'INTU', 'TRV'
    ],
    'Здравоохранение': [
      'UNH', 'JNJ', 'PFE', 'ABBV', 'MRK', 'TMO', 'ABT', 'LLY', 'DHR', 'BMY',
      'AMGN', 'GILD', 'VRTX', 'REGN', 'ISRG', 'ZTS', 'CVS', 'CI', 'ANTM', 'HUM',
      'BIIB', 'ILMN', 'IQV', 'BDX', 'BSX', 'MDT', 'SYK', 'EW', 'VAR', 'PKI'
    ],
    'Энергетика': [
      'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PSX', 'VLO', 'MPC', 'OXY', 'BKR',
      'HAL', 'DVN', 'FANG', 'APA', 'EQT', 'KMI', 'OKE', 'WMB', 'EPD', 'ET',
      'TRGP', 'LNG', 'CHRD', 'MRO', 'HES', 'CTRA', 'PXD', 'CNX', 'AR', 'SM'
    ],
    'Потребительские товары': [
      'AMZN', 'TSLA', 'HD', 'PG', 'KO', 'PEP', 'WMT', 'COST', 'MCD', 'SBUX',
      'NKE', 'LOW', 'TJX', 'TGT', 'DG', 'DLTR', 'YUM', 'CMG', 'MO', 'PM',
      'CL', 'KMB', 'CHD', 'CLX', 'SJM', 'K', 'HSY', 'CAG', 'CPB', 'GIS'
    ]
  };

  // Handle file upload
  const handleFileSelect = async (file: File) => {
    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      await loadJSONData(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      handleFileSelect(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  // Handle ticker click to populate input field
  const handleTickerClick = (tickerSymbol: string) => {
    setTicker(tickerSymbol);
  };

  // Handle data enhancement
  const handleEnhanceData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setSuccess(null);
      const symbol = ticker.trim().toUpperCase();
      if (!symbol) throw new Error('Укажите тикер');
      const end = Math.floor(Date.now() / 1000);
      const start = end - 40 * 365 * 24 * 60 * 60;
      const prov = enhancerProvider;
      const resp = await fetchWithCreds(`${API_BASE_URL}/yahoo-finance/${symbol}?start=${start}&end=${end}&provider=${prov}&adjustment=none`);
      if (!resp.ok) {
        let msg = 'Не удалось получить данные';
        try { const j = await resp.json(); if (j && j.error) msg = j.error; } catch {
          // Ignore JSON parsing errors
        }
        throw new Error(msg);
      }
      const payload = await resp.json();
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      if (!rows.length) throw new Error('Нет данных для этого тикера');
      const ohlc = rows.map((bar: unknown) => ({
        date: parseOHLCDate(bar.date),
        open: Number(bar.open),
        high: Number(bar.high),
        low: Number(bar.low),
        close: Number(bar.close),
        adjClose: bar.adjClose != null ? Number(bar.adjClose) : undefined,
        volume: Number(bar.volume) || 0,
      }));
      updateMarketData(ohlc);
      await saveDatasetToServer(symbol);
      setSuccess(`✅ Загружено ${ohlc.length} точек для ${symbol} и сохранено на сервере`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не удалось загрузить данные';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const tabs = [
    { id: 'enhance' as TabType, label: 'Новые данные' },
    { id: 'upload' as TabType, label: 'Загрузка файла' }
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2 dark:text-gray-100">Новые данные</h2>
        <p className="text-gray-600 dark:text-gray-300">Загрузка данных для тестирования торговых стратегий</p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'enhance' && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4 dark:bg-gray-900 dark:border-gray-800">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm bg-white dark:bg-gray-800 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-300">Провайдер данных:</span>
              <span className="font-medium text-gray-900 uppercase dark:text-gray-100">{enhancerProvider}</span>
            </div>
            <p className="text-xs text-gray-500 mt-2 dark:text-gray-400">Меняется на вкладке «Настройки».</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6 dark:bg-gray-900 dark:border-gray-800">
            <div className="space-y-4">
              <div>
                <label htmlFor="ticker" className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">Тикер</label>
                <input
                  id="ticker"
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="например, AAPL, MSFT, GOOGL"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">Источник: серверные прокси к реальным API.</p>
              </div>

              <button
                onClick={handleEnhanceData}
                disabled={isLoading}
                className="w-full mt-3 inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {isLoading ? 'Загрузка...' : 'Загрузить данные'}
              </button>
            </div>
          </div>

          {/* Popular Tickers */}
          <div className="space-y-6">
            {Object.entries(tickerCategories).map(([category, tickers]) => (
              <div key={category} className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center w-8 h-8 bg-green-50 rounded-lg dark:bg-green-950/20">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base">
                      {category}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Нажмите на тикер, чтобы подставить его в поле выше
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <div className="flex gap-2 pb-2" style={{ width: 'fit-content' }}>
                    {tickers.map((tickerSymbol) => {
                      const isActive = ticker === tickerSymbol;
                      
                      return (
                        <button
                          key={tickerSymbol}
                          onClick={() => handleTickerClick(tickerSymbol)}
                          className={`flex-shrink-0 flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 min-w-[60px] h-9 ${
                            isActive
                              ? 'bg-blue-100 text-blue-800 border-2 border-blue-300 shadow-sm dark:bg-blue-950/30 dark:text-blue-200 dark:border-blue-900/50'
                              : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:border-gray-300 hover:shadow-sm dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-700 dark:hover:border-gray-600'
                          }`}
                        >
                          {tickerSymbol}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-500 text-center mt-2 dark:text-gray-400">📈 Источник данных: Alpha Vantage / Finnhub через локальный сервер</p>
        </div>
      )}

      {activeTab === 'upload' && (
        <div className="max-w-3xl mx-auto relative">
          {globalLoading && (
            <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-10 rounded-2xl flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Загрузка данных...</div>
              </div>
            </div>
          )}
          
          {storeError && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 dark:bg-red-950/30 dark:border-red-900/40">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-red-800 dark:text-red-200">Ошибка загрузки</div>
                <div className="text-sm text-red-700 dark:text-red-300 mt-1">{storeError}</div>
              </div>
            </div>
          )}
          
          <div
            className="relative rounded-2xl border-2 border-dashed border-gray-300 bg-white p-10 text-center shadow-sm hover:shadow-md transition dark:bg-gray-900 dark:border-gray-700"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <div className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              {globalLoading ? (
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
              ) : (
                <Upload className="h-8 w-8 text-blue-600" />
              )}
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2 dark:text-gray-100">
              {globalLoading ? 'Обработка данных...' : 'Загрузите данные для тестирования'}
            </h3>
            <p className="text-gray-600 mb-6 dark:text-gray-300">
              {globalLoading 
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
                disabled={globalLoading}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 font-medium text-white shadow hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {globalLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {globalLoading ? 'Загрузка...' : 'Выбрать JSON'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error and success messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 dark:bg-red-950/30 dark:border-red-900/40">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-900 dark:text-red-200">Ошибка</h4>
              <p className="text-sm text-red-800 dark:text-red-300 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 dark:bg-green-950/30 dark:border-green-900/40">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-green-900 dark:text-green-200">Готово</h4>
              <p className="text-sm text-green-800 dark:text-green-300 mt-1">{success}</p>
            </div>
          </div>
        </div>
      )}

      {/* Доп. действия */}
      {onNext && (
        <div className="bg-gray-50 rounded-lg p-4 dark:bg-gray-800">
          <div className="flex justify-end">
            <button onClick={onNext} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium">
              Перейти к результатам
            </button>
          </div>
        </div>
      )}
    </div>
  );
}