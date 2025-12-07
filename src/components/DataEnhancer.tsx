import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Upload, Download, Loader2, AlertTriangle, CheckCircle, AlertCircle, Check } from 'lucide-react';
import { useAppStore } from '../stores';
import { fetchWithCreds, API_BASE_URL } from '../lib/api';
import { toTradingDate } from '../lib/date-utils';
import { useToastActions } from './ui';
import { TICKER_DATA, CATEGORIES, searchTickers, getTickerInfo } from '../lib/ticker-data';

interface DataEnhancerProps {
  onNext?: () => void;
}

type TabType = 'enhance' | 'upload';

export function DataEnhancer({ onNext }: DataEnhancerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const {
    enhancerProvider,
    updateMarketData,
    saveDatasetToServer,
    isLoading: globalLoading,
    error: storeError,
    loadJSONData,
    loadDatasetsFromServer,
    savedDatasets,
    currentDataset
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<TabType>('enhance');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('popular');
  const [ticker, setTicker] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingTicker, setLoadingTicker] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const toast = useToastActions();

  // Get loaded ticker symbols
  const loadedTickers = useMemo(() => {
    return new Set(savedDatasets.map(d => d.ticker?.toUpperCase()));
  }, [savedDatasets]);

  // Filter tickers based on search and category
  const filteredTickers = useMemo(() => {
    return searchTickers(searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory]);

  // Search suggestions for dropdown
  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchTickers(searchQuery, 'all').slice(0, 8);
  }, [searchQuery]);

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

  // Load datasets on mount
  useEffect(() => {
    loadDatasetsFromServer().catch((error) => {
      console.warn('Failed to load datasets:', error);
    });
  }, [loadDatasetsFromServer]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchInputRef.current && !searchInputRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // Handle ticker selection from grid or dropdown
  const handleTickerSelect = (tickerSymbol: string) => {
    setTicker(tickerSymbol);
    setSearchQuery('');
    setShowDropdown(false);
  };

  // Handle data download
  const handleDownloadData = async (symbol?: string) => {
    const targetTicker = (symbol || ticker).trim().toUpperCase();
    if (!targetTicker) {
      setError('Укажите тикер');
      return;
    }

    try {
      setIsLoading(true);
      setLoadingTicker(targetTicker);
      setError(null);
      setSuccess(null);

      const end = Math.floor(Date.now() / 1000);
      const start = end - 40 * 365 * 24 * 60 * 60;
      const prov = enhancerProvider;
      const resp = await fetchWithCreds(`${API_BASE_URL}/yahoo-finance/${targetTicker}?start=${start}&end=${end}&provider=${prov}&adjustment=none`);

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

      const ohlc = rows.map((bar: any) => ({
        date: toTradingDate(bar.date),
        open: Number(bar.open),
        high: Number(bar.high),
        low: Number(bar.low),
        close: Number(bar.close),
        adjClose: bar.adjClose != null ? Number(bar.adjClose) : undefined,
        volume: Number(bar.volume) || 0,
      }));

      updateMarketData(ohlc);

      // Get company info from TICKER_DATA for metadata (only companyName, tags are added manually)
      const tickerInfo = getTickerInfo(targetTicker);
      const metadata = tickerInfo ? {
        companyName: tickerInfo.name
      } : undefined;

      await saveDatasetToServer(targetTicker, undefined, metadata);
      await loadDatasetsFromServer();

      setSuccess(`✅ Загружено ${ohlc.length} точек для ${targetTicker}`);
      toast.success(`${targetTicker}: загружено ${ohlc.length} точек`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не удалось загрузить данные';
      setError(msg);
      toast.error(`${targetTicker}: ${msg}`);
    } finally {
      setIsLoading(false);
      setLoadingTicker(null);
    }
  };

  const tabs = [
    { id: 'enhance' as TabType, label: 'Загрузка с API' },
    { id: 'upload' as TabType, label: 'Загрузка файла' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2 dark:text-gray-100">
          Загрузка рыночных данных
        </h2>
        <p className="text-gray-600 dark:text-gray-300">
          Выберите тикер для загрузки исторических данных
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === tab.id
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

      {/* Tab Content - API Download */}
      {activeTab === 'enhance' && (
        <div className="space-y-6">
          {/* Provider Badge */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 dark:bg-gray-900 dark:border-gray-800">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm bg-white dark:bg-gray-800 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-300">Провайдер данных:</span>
              <span className="font-medium text-gray-900 uppercase dark:text-gray-100">{enhancerProvider}</span>
            </div>
            <p className="text-xs text-gray-500 mt-2 dark:text-gray-400">Меняется на вкладке «Настройки».</p>
          </div>

          {/* Hero Search Section */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 border border-blue-100 dark:border-gray-700 rounded-xl p-6">
            <div className="max-w-xl mx-auto">
              {/* Search Input with Autocomplete */}
              <div className="relative" ref={searchInputRef}>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value.toUpperCase());
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="Поиск по тикеру или названию компании..."
                    className="w-full pl-12 pr-4 py-4 text-lg border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 shadow-sm"
                  />
                </div>

                {/* Search Suggestions Dropdown */}
                {showDropdown && searchSuggestions.length > 0 && (
                  <div className="absolute z-20 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-80 overflow-y-auto">
                    {searchSuggestions.map((item) => {
                      const isLoaded = loadedTickers.has(item.symbol);
                      return (
                        <button
                          key={item.symbol}
                          onClick={() => handleTickerSelect(item.symbol)}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                        >
                          <span className={`font-mono font-semibold min-w-[60px] ${isLoaded ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'}`}>
                            {item.symbol}
                          </span>
                          <span className="text-gray-600 dark:text-gray-300 text-sm truncate flex-1">
                            {item.name}
                          </span>
                          {isLoaded && (
                            <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick Input + Download */}
              <div className="mt-4 flex gap-3">
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="AAPL"
                  className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 font-mono text-center"
                />
                <button
                  onClick={() => handleDownloadData()}
                  disabled={isLoading || !ticker.trim()}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium flex items-center gap-2 transition-colors"
                >
                  {isLoading && loadingTicker === ticker.toUpperCase() ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Download className="w-5 h-5" />
                  )}
                  Загрузить
                </button>
              </div>
            </div>
          </div>

          {/* Category Chips */}
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => {
              const count = cat.id === 'all'
                ? TICKER_DATA.length
                : TICKER_DATA.filter(t => t.categories.includes(cat.id)).length;
              const isActive = selectedCategory === cat.id;

              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    setSearchQuery('');
                  }}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2 ${isActive
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-700'
                    }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                  <span className={`text-xs ${isActive ? 'text-blue-200' : 'text-gray-400'}`}>
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Ticker Grid */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {searchQuery ? 'Результаты поиска' : CATEGORIES.find(c => c.id === selectedCategory)?.label}
              </h3>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {filteredTickers.length} тикеров
              </span>
            </div>

            {filteredTickers.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Ничего не найдено</p>
                <p className="text-sm mt-1">Попробуйте другой запрос или категорию</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredTickers.map((item) => {
                  const isLoaded = loadedTickers.has(item.symbol);
                  const isCurrentlyLoading = loadingTicker === item.symbol;

                  return (
                    <button
                      key={item.symbol}
                      onClick={() => handleDownloadData(item.symbol)}
                      disabled={isLoading}
                      className={`relative p-3 rounded-lg text-left transition-all duration-200 group ${isLoaded
                        ? 'bg-green-50 border-2 border-green-200 dark:bg-green-950/30 dark:border-green-900/50'
                        : 'bg-gray-50 border border-gray-200 hover:bg-blue-50 hover:border-blue-300 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-blue-950/30 dark:hover:border-blue-800'
                        } ${isCurrentlyLoading ? 'ring-2 ring-blue-400 ring-offset-2 dark:ring-offset-gray-900' : ''}`}
                    >
                      {isCurrentlyLoading ? (
                        <div className="flex items-center justify-center py-2">
                          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className={`text-sm font-medium truncate ${isLoaded ? 'text-green-800 dark:text-green-200' : 'text-gray-900 dark:text-gray-100'}`}>
                              {item.name}
                            </div>
                            <div className={`text-xs font-mono mt-0.5 ${isLoaded ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                              {item.symbol}
                            </div>
                          </div>
                          {isLoaded && (
                            <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

          </div>

          <p className="text-xs text-gray-500 text-center dark:text-gray-400">
            📈 Источник данных: Alpha Vantage / Finnhub через локальный сервер
          </p>
        </div>
      )}

      {/* Tab Content - File Upload */}
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

      {/* Next button */}
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