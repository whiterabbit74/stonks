import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Download, Loader2, AlertCircle, CheckCircle, Check, Settings } from 'lucide-react';
import { ProviderBadge } from './ui/ProviderBadge';
import { useAppStore } from '../stores';
import { fetchWithCreds, API_BASE_URL } from '../lib/api';
import { toTradingDate } from '../lib/date-utils';
import { useToastActions, PageHeader } from './ui';
import { TICKER_DATA, CATEGORIES, searchTickers, getTickerInfo } from '../lib/ticker-data';
import { Link } from 'react-router-dom';

interface DataEnhancerProps {
  onNext?: () => void;
}

type LoadingStage = 'fetching' | 'processing' | 'saving' | null;

export function DataEnhancer({ onNext }: DataEnhancerProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const initialDatasetLoadRequestedRef = useRef(false);
  const latestDownloadRequestIdRef = useRef(0);
  const {
    enhancerProvider,
    updateMarketData,
    saveDatasetToServer,
    isLoading: globalLoading,
    loadDatasetsFromServer,
    savedDatasets,
    currentDataset
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('popular');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>(null);
  const [loadingTicker, setLoadingTicker] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const toast = useToastActions();

  const loadedTickers = useMemo(() => {
    return new Set(savedDatasets.map(d => d.ticker?.toUpperCase()));
  }, [savedDatasets]);

  const filteredTickers = useMemo(() => {
    return searchTickers(searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory]);

  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchTickers(searchQuery, 'all').slice(0, 8);
  }, [searchQuery]);

  useEffect(() => {
    if (initialDatasetLoadRequestedRef.current) return;
    if (savedDatasets.length > 0 || globalLoading) return;
    initialDatasetLoadRequestedRef.current = true;
    loadDatasetsFromServer().catch((error) => {
      console.warn('Failed to load datasets:', error);
    });
  }, [loadDatasetsFromServer, savedDatasets.length, globalLoading]);

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

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchSuggestions]);

  const handleTickerSelectAndDownload = (tickerSymbol: string) => {
    setSearchQuery('');
    setShowDropdown(false);
    setHighlightedIndex(-1);
    handleDownloadData(tickerSymbol);
  };

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
        setHighlightedIndex(prev => prev < searchSuggestions.length - 1 ? prev + 1 : 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : searchSuggestions.length - 1);
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

  const getLoadingStageText = () => {
    switch (loadingStage) {
      case 'fetching': return 'Загрузка данных с сервера...';
      case 'processing': return 'Обработка данных...';
      case 'saving': return 'Сохранение...';
      default: return 'Загрузка...';
    }
  };

  const handleDownloadData = async (symbol?: string) => {
    const targetTicker = (symbol || searchQuery).trim().toUpperCase();
    if (!targetTicker) {
      setError('Укажите тикер');
      return;
    }
    if (isLoading) return;

    const requestId = ++latestDownloadRequestIdRef.current;

    try {
      setIsLoading(true);
      setLoadingTicker(targetTicker);
      setLoadingStage('fetching');
      setError(null);
      setSuccess(null);

      const end = Math.floor(Date.now() / 1000);
      const start = end - 40 * 365 * 24 * 60 * 60;
      const prov = enhancerProvider;
      const encodedTicker = encodeURIComponent(targetTicker);
      const resp = await fetchWithCreds(`${API_BASE_URL}/yahoo-finance/${encodedTicker}?start=${start}&end=${end}&provider=${prov}&adjustment=none`);
      if (requestId !== latestDownloadRequestIdRef.current) return;

      if (!resp.ok) {
        let msg = 'Не удалось получить данные';
        try { const j = await resp.json(); if (j && j.error) msg = j.error; } catch { /* ignore */ }
        throw new Error(msg);
      }

      setLoadingStage('processing');
      const payload = await resp.json();
      if (requestId !== latestDownloadRequestIdRef.current) return;
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      if (!rows.length) throw new Error('Нет данных для этого тикера');

      const ohlc = rows.flatMap((bar: any) => {
        try {
          const date = toTradingDate(bar?.date);
          const open = Number(bar?.open);
          const high = Number(bar?.high);
          const low = Number(bar?.low);
          const close = Number(bar?.close);
          if (![open, high, low, close].every((value) => Number.isFinite(value))) return [];
          const adjRaw = bar?.adjClose != null ? Number(bar.adjClose) : undefined;
          const adjClose = Number.isFinite(adjRaw) ? adjRaw : undefined;
          const volumeRaw = Number(bar?.volume);
          const volume = Number.isFinite(volumeRaw) && volumeRaw > 0 ? volumeRaw : 0;
          return [{ date, open, high, low, close, adjClose, volume }];
        } catch {
          return [];
        }
      });
      if (!ohlc.length) throw new Error('Ответ провайдера содержит некорректные OHLC-данные');
      if (requestId !== latestDownloadRequestIdRef.current) return;

      updateMarketData(ohlc);

      setLoadingStage('saving');
      const tickerInfo = getTickerInfo(targetTicker);
      const metadata = tickerInfo ? { companyName: tickerInfo.name } : undefined;
      await saveDatasetToServer(targetTicker, undefined, metadata);
      if (requestId !== latestDownloadRequestIdRef.current) return;

      setSuccess(`✅ Загружено ${ohlc.length} точек для ${targetTicker}`);
      toast.success(`${targetTicker}: загружено ${ohlc.length} точек`);
    } catch (e) {
      if (requestId !== latestDownloadRequestIdRef.current) return;
      const msg = e instanceof Error ? e.message : 'Не удалось загрузить данные';
      setError(msg);
      toast.error(`${targetTicker}: ${msg}`);
    } finally {
      if (requestId === latestDownloadRequestIdRef.current) {
        setIsLoading(false);
        setLoadingTicker(null);
        setLoadingStage(null);
      }
    }
  };

  const hasData = savedDatasets.length > 0 || currentDataset !== null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Новые данные"
        subtitle="Загрузка исторических данных из API"
        actions={<ProviderBadge label="Провайдер данных" provider={enhancerProvider} />}
      />

      <div className="bg-white border border-gray-200 rounded-lg p-4 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-full max-w-[560px]">
            <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Тикер</div>
            <div className="relative" ref={searchInputRef}>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value.toUpperCase());
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="AAPL, MSFT, TSLA..."
                    className="w-full pl-10 pr-3 py-2.5 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 font-mono"
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
                  className="h-11 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium flex items-center gap-2 transition-colors"
                  title="Загрузить данные"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">Загрузить</span>
                </button>
              </div>

              {showDropdown && searchSuggestions.length > 0 && (
                <div
                  ref={dropdownRef}
                  id="search-suggestions"
                  role="listbox"
                  className="absolute z-20 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-72 overflow-y-auto"
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
                        className={`group w-full px-3 py-2.5 flex items-center gap-3 transition-colors text-left border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${isHighlighted
                          ? 'bg-blue-50 dark:bg-blue-900/30'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                      >
                        <span className={`font-mono font-semibold min-w-[56px] ${isLoaded ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'}`}>
                          {item.symbol}
                        </span>
                        <span className="text-gray-600 dark:text-gray-300 text-sm truncate flex-1">
                          {item.name}
                        </span>
                        {isLoaded && <Check className="w-4 h-4 text-green-500 flex-shrink-0" />}
                        <Download className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center pb-0.5">
            <Link
              to="/settings"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-800"
              title="Настройки провайдера"
              aria-label="Настройки провайдера"
            >
              <Settings className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {isLoading && loadingTicker && (
          <div className="mt-3">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {loadingTicker}: {getLoadingStageText()}
              </span>
            </div>
          </div>
        )}
      </div>

      {savedDatasets.length === 0 && !isLoading && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 dark:bg-blue-950/30 dark:border-blue-900/40">
          <h4 className="font-medium text-blue-900 dark:text-blue-200">Начните с загрузки данных</h4>
          <p className="text-sm text-blue-800 dark:text-blue-300 mt-1">
            Введите тикер в поиске (например, AAPL) и нажмите Enter или выберите из каталога ниже.
          </p>
        </div>
      )}

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
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 border ${isActive
                  ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-700'
                  }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
                <span className={`text-xs ${isActive ? 'text-blue-500 dark:text-blue-300' : 'text-gray-400'}`}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
        <div className="absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-gray-50 dark:from-gray-900 pointer-events-none" />
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
        <div className="flex items-center justify-between mb-3">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {filteredTickers.map((item) => {
              const isLoaded = loadedTickers.has(item.symbol);
              const isCurrentlyLoading = loadingTicker === item.symbol;
              return (
                <button
                  key={item.symbol}
                  onClick={() => handleDownloadData(item.symbol)}
                  disabled={isLoading}
                  title={isLoaded ? `${item.symbol} уже загружен. Нажмите для обновления` : `Нажмите для загрузки ${item.symbol}`}
                  className={`relative p-2.5 rounded-lg text-left transition-all duration-200 group ${isLoaded
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

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Источник данных: {enhancerProvider.replace('_', ' ')} через локальный сервер
      </p>

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

      {onNext && hasData && (
        <div className="bg-gray-50 rounded-lg p-4 dark:bg-gray-800">
          <div className="flex justify-end">
            <button onClick={onNext} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors">
              Перейти к результатам
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
