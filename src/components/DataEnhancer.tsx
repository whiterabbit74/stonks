import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, Upload, Download, Loader2, AlertTriangle, CheckCircle, AlertCircle, Check, Settings, ChevronRight } from 'lucide-react';
import { useAppStore } from '../stores';
import { fetchWithCreds, API_BASE_URL } from '../lib/api';
import { toTradingDate } from '../lib/date-utils';
import { useToastActions } from './ui';
import { TICKER_DATA, CATEGORIES, searchTickers, getTickerInfo } from '../lib/ticker-data';
import { Link } from 'react-router-dom';

interface DataEnhancerProps {
  onNext?: () => void;
}

type TabType = 'enhance' | 'upload';
type LoadingStage = 'fetching' | 'processing' | 'saving' | null;

export function DataEnhancer({ onNext }: DataEnhancerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
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
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>(null);
  const [loadingTicker, setLoadingTicker] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isDragging, setIsDragging] = useState(false);
  const [isValidDragType, setIsValidDragType] = useState(true);
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

  // Load datasets on mount
  useEffect(() => {
    loadDatasetsFromServer().catch((error) => {
      console.warn('Failed to load datasets:', error);
    });
  }, [loadDatasetsFromServer]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchInputRef.current && !searchInputRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset highlighted index when suggestions change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchSuggestions]);

  // Handle file upload
  const handleFileSelect = async (file: File) => {
    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      await loadJSONData(file);
    } else {
      setError(`Неверный тип файла: ${file.name}. Поддерживаются только JSON-файлы.`);
      toast.error(`Неверный тип файла: ${file.name}`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setIsValidDragType(true);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Notify if multiple files dropped
    if (files.length > 1) {
      toast.info(`Выбрано ${files.length} файлов. Обрабатывается только первый.`);
    }

    const file = files[0];
    handleFileSelect(file);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);

    // Check if dragged item is a file
    const hasFiles = e.dataTransfer.types.includes('Files');
    if (!hasFiles) {
      setIsValidDragType(false);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    // Only set to false if we're leaving the drop zone entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
      setIsValidDragType(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    // Set drop effect based on file type validity
    e.dataTransfer.dropEffect = isValidDragType ? 'copy' : 'none';
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  // Handle ticker selection from dropdown and trigger download
  const handleTickerSelectAndDownload = useCallback((tickerSymbol: string) => {
    setSearchQuery('');
    setShowDropdown(false);
    setHighlightedIndex(-1);
    handleDownloadData(tickerSymbol);
  }, []);

  // Handle keyboard navigation in search
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || searchSuggestions.length === 0) {
      if (e.key === 'Enter' && searchQuery.trim()) {
        handleDownloadData(searchQuery.trim());
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < searchSuggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : searchSuggestions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < searchSuggestions.length) {
          handleTickerSelectAndDownload(searchSuggestions[highlightedIndex].symbol);
        } else if (searchQuery.trim()) {
          handleDownloadData(searchQuery.trim());
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  // Loading stage text
  const getLoadingStageText = () => {
    switch (loadingStage) {
      case 'fetching': return 'Загрузка данных с сервера...';
      case 'processing': return 'Обработка данных...';
      case 'saving': return 'Сохранение...';
      default: return 'Загрузка...';
    }
  };

  // Handle data download
  const handleDownloadData = async (symbol?: string) => {
    const targetTicker = (symbol || searchQuery).trim().toUpperCase();
    if (!targetTicker) {
      setError('Укажите тикер');
      return;
    }

    try {
      setIsLoading(true);
      setLoadingTicker(targetTicker);
      setLoadingStage('fetching');
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

      setLoadingStage('processing');
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

      setLoadingStage('saving');
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
      setLoadingStage(null);
    }
  };

  const tabs = [
    { id: 'enhance' as TabType, label: 'Загрузка с API' },
    { id: 'upload' as TabType, label: 'Загрузка файла' }
  ];

  // Check if we have any data loaded
  const hasData = savedDatasets.length > 0 || currentDataset !== null;

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
          {/* Provider Badge with Link */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 dark:bg-gray-900 dark:border-gray-800">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm bg-white dark:bg-gray-800 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-300">Провайдер данных:</span>
                <span className="font-medium text-gray-900 uppercase dark:text-gray-100">{enhancerProvider}</span>
              </div>
              <Link
                to="/settings"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <Settings className="w-4 h-4" />
                <span>Изменить</span>
              </Link>
            </div>
          </div>

          {/* Onboarding hint for new users */}
          {savedDatasets.length === 0 && !isLoading && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 dark:bg-blue-950/30 dark:border-blue-900/40">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">💡</div>
                <div>
                  <h4 className="font-medium text-blue-900 dark:text-blue-200">Начните с загрузки данных</h4>
                  <p className="text-sm text-blue-800 dark:text-blue-300 mt-1">
                    Введите тикер в поиске (например, AAPL) и нажмите Enter или выберите из каталога ниже.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Unified Search Section */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 border border-blue-100 dark:border-gray-700 rounded-xl p-6">
            <div className="max-w-xl mx-auto">
              {/* Search Input with Autocomplete and Download Button */}
              <div className="relative" ref={searchInputRef}>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value.toUpperCase());
                        setShowDropdown(true);
                      }}
                      onFocus={() => setShowDropdown(true)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Введите тикер (AAPL, MSFT, TSLA...)"
                      className="w-full pl-12 pr-4 py-4 text-lg border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 shadow-sm font-mono"
                      role="combobox"
                      aria-expanded={showDropdown && searchSuggestions.length > 0}
                      aria-haspopup="listbox"
                      aria-controls="search-suggestions"
                      aria-activedescendant={highlightedIndex >= 0 ? `suggestion-${highlightedIndex}` : undefined}
                    />
                  </div>
                  <button
                    onClick={() => handleDownloadData()}
                    disabled={isLoading || !searchQuery.trim()}
                    className="px-6 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium flex items-center gap-2 transition-colors shadow-sm"
                    title="Загрузить данные"
                  >
                    {isLoading && loadingTicker === searchQuery.toUpperCase() ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Download className="w-5 h-5" />
                    )}
                    <span className="hidden sm:inline">Загрузить</span>
                  </button>
                </div>

                {/* Search Suggestions Dropdown with ARIA */}
                {showDropdown && searchSuggestions.length > 0 && (
                  <div
                    ref={dropdownRef}
                    id="search-suggestions"
                    role="listbox"
                    className="absolute z-20 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-80 overflow-y-auto"
                  >
                    {searchSuggestions.map((item, index) => {
                      const isLoaded = loadedTickers.has(item.symbol);
                      const isHighlighted = index === highlightedIndex;
                      return (
                        <button
                          key={item.symbol}
                          id={`suggestion-${index}`}
                          role="option"
                          aria-selected={isHighlighted}
                          onClick={() => handleTickerSelectAndDownload(item.symbol)}
                          className={`w-full px-4 py-3 flex items-center gap-3 transition-colors text-left border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${isHighlighted
                            ? 'bg-blue-50 dark:bg-blue-900/30'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
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
                          <Download className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Loading Stage Indicator */}
              {isLoading && loadingTicker && (
                <div className="mt-4 text-center">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {loadingTicker}: {getLoadingStageText()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Category Chips with horizontal scroll on mobile */}
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide horizontal-scroll">
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
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${isActive
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
            {/* Scroll fade indicator on right */}
            <div className="absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-white dark:from-gray-900 pointer-events-none" />
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
                      title={isLoaded ? `${item.symbol} уже загружен. Нажмите для обновления` : `Нажмите для загрузки ${item.symbol}`}
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
                          {isLoaded ? (
                            <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                          ) : (
                            <Download className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
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
            role="region"
            aria-label="Область загрузки файлов"
            aria-describedby="drop-zone-description"
            className={`relative rounded-2xl border-2 border-dashed p-10 text-center shadow-sm transition-all duration-200 ${isDragging
                ? isValidDragType
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 shadow-lg scale-[1.02]'
                  : 'border-red-400 bg-red-50 dark:bg-red-950/30'
                : 'border-gray-300 bg-white hover:shadow-md dark:bg-gray-900 dark:border-gray-700'
              }`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className={`mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full transition-colors ${isDragging
                ? isValidDragType
                  ? 'bg-blue-200 dark:bg-blue-800'
                  : 'bg-red-200 dark:bg-red-800'
                : 'bg-blue-100 dark:bg-blue-900/30'
              }`}>
              {globalLoading ? (
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
              ) : (
                <Upload className={`h-8 w-8 ${isDragging
                    ? isValidDragType
                      ? 'text-blue-700'
                      : 'text-red-600'
                    : 'text-blue-600'
                  }`} />
              )}
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2 dark:text-gray-100">
              {globalLoading
                ? 'Обработка данных...'
                : isDragging
                  ? isValidDragType
                    ? 'Отпустите файл для загрузки'
                    : 'Только JSON-файлы!'
                  : 'Загрузите данные для тестирования'}
            </h3>
            <p id="drop-zone-description" className="text-gray-600 mb-6 dark:text-gray-300">
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
                aria-label="Выбрать JSON файл"
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

      {/* Next button - only show when data is loaded */}
      {onNext && hasData && (
        <div className="bg-gray-50 rounded-lg p-4 dark:bg-gray-800">
          <div className="flex justify-end">
            <button onClick={onNext} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium">
              Перейти к результатам
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}