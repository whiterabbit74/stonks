import { useState, useEffect } from 'react';
import { RefreshCw, Calendar, TrendingUp, AlertCircle, CheckCircle, Download } from 'lucide-react';
import { useAppStore } from '../stores';
import type { OHLCData } from '../types';
import { parseOHLCDate, adjustOHLCForSplits } from '../lib/utils';

interface DataEnhancerProps {
  onNext?: () => void;
}

interface YahooFinanceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
}

export function DataEnhancer({ onNext }: DataEnhancerProps) {
  const { marketData, currentDataset, updateMarketData, saveDatasetToServer, updateDatasetOnServer, loadDatasetFromServer, setSplits, enhancerProvider, savedDatasets } = useAppStore();
  const [ticker, setTicker] = useState('AAPL');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dataGaps, setDataGaps] = useState<{ missing: number; lastDate: string; firstDate: string } | null>(null);
  const [selectedAction, setSelectedAction] = useState<'enhance' | 'replace'>('enhance');
  const [mode, setMode] = useState<'existing' | 'new'>('new');
  const { loadDatasetsFromServer } = useAppStore();
  // Убрали промпт ручного сохранения
  // Всегда грузим всю доступную историю (~до 40 лет), выбор периода убран
  const [isUpToDate, setIsUpToDate] = useState(false);

  // При смене режима очищаем сообщения, чтобы не путать пользователя
  useEffect(() => {
    setError(null);
    setSuccess(null);
  }, [mode]);

  // Синхронизируем действие с выбранным режимом: existing -> enhance, new -> replace
  useEffect(() => {
    setSelectedAction(mode === 'existing' ? 'enhance' : 'replace');
  }, [mode]);

  // Анализируем пропуски в данных при загрузке компонента
  useEffect(() => {
    if (marketData.length > 0) {
      analyzeDataGaps();
      // Устанавливаем тикер из текущего датасета если есть
      if (currentDataset?.ticker) {
        setTicker(currentDataset.ticker);
      }
    }
  }, [marketData, currentDataset]);

  const analyzeDataGaps = () => {
    if (marketData.length === 0) return;

    const sortedData = [...marketData].sort((a, b) => a.date.getTime() - b.date.getTime());
    const firstDate = sortedData[0].date;
    const lastDate = sortedData[sortedData.length - 1].date;
    const today = new Date();
    
    // Подсчитываем примерное количество торговых дней (исключая выходные)
    const daysDiff = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    const tradingDays = Math.floor(daysDiff * 5/7); // Примерно 5 торговых дней в неделю
    
    const missing = Math.max(0, tradingDays);
    setDataGaps({
      missing,
      lastDate: lastDate.toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
      firstDate: firstDate.toLocaleDateString('en-US', { timeZone: 'America/New_York' })
    });
    setIsUpToDate(missing === 0);
    if (missing === 0) {
      // убираем старые статусы, чтобы не плодить сообщения
      setSuccess(null);
      setError(null);
    }
  };

  const getStartDateForPeriod = (): Date => {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setFullYear(now.getFullYear() - 40);
    return startDate;
  };

  type FetchResult = { data: YahooFinanceData[]; splits: { date: string; factor: number }[] };
  const fetchWithCreds: typeof fetch = (input: any, init?: any) => fetch(input, { credentials: 'include', ...(init || {}) });
  const fetchRealMarketData = async (symbol: string, startDate: Date): Promise<FetchResult> => {
    const endDate = new Date();
    const start = Math.floor(startDate.getTime() / 1000);
    const end = Math.floor(endDate.getTime() / 1000);
    
    // Строго используем выбранный провайдер без fallback
    const base = typeof window !== 'undefined' && window.location.href.includes('/stonks') ? '/stonks/api' : '/api';
    const url = `${base}/yahoo-finance/${symbol}?start=${start}&end=${end}&provider=${enhancerProvider}`;
    const response = await fetchWithCreds(url);
    if (!response.ok) {
      let msg = `${response.status} ${response.statusText}`;
      try { const e = await response.json(); msg = e.error || msg; } catch {}
      throw new Error(msg);
    }
    const json = await response.json();
    if (Array.isArray(json)) return { data: json, splits: [] } as any;
    return { data: json.data || [], splits: json.splits || [] } as any;
  };

  // removed unused loadSampleData

  const enhanceData = async () => {
    if (!ticker.trim()) {
      setError('Please enter a ticker symbol');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let startDate = new Date();
      
      if (selectedAction === 'enhance' && marketData.length > 0) {
        // For enhancing existing data, start from the last date
        const sortedData = [...marketData].sort((a, b) => b.date.getTime() - a.date.getTime());
        startDate = new Date(sortedData[0].date);
        startDate.setDate(startDate.getDate() + 1);
      } else {
        // Для нового тикера всегда берем максимум доступной истории (~40 лет)
        startDate = getStartDateForPeriod();
      }

      const realData = await fetchRealMarketData(ticker.trim().toUpperCase(), startDate);
      const rawRows = realData.data;
      const splitEvents = realData.splits || [];
      
      if (rawRows.length === 0) {
        setError('No data found or ticker does not exist');
        return;
      }

      // Convert real market data to our format
      const newDataRaw: OHLCData[] = rawRows.map(item => ({
        date: parseOHLCDate(item.date as any),
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        adjClose: item.adjClose,
        volume: item.volume
      }));
      const newData = adjustOHLCForSplits(newDataRaw, splitEvents);

      let finalData: OHLCData[];
      let message: string;
      let newRecordsAddedCount = 0; // used only for telemetry/logging

      if (selectedAction === 'replace' || marketData.length === 0) {
        // Replace all data with new ticker data
        finalData = newData.sort((a, b) => a.date.getTime() - b.date.getTime());
        message = `Loaded ${newData.length} records for ${ticker.toUpperCase()} (maximum available period)`;
        newRecordsAddedCount = newData.length;
      } else {
        // Enhance existing data
        const existingDates = new Set(marketData.map(d => d.date.toDateString()));
        const filteredNewData = newData.filter(d => !existingDates.has(d.date.toDateString()));

        if (filteredNewData.length === 0) {
          setSuccess('Data is already up to date, no new records found');
          return;
        }

        finalData = [...marketData, ...filteredNewData]
          .sort((a, b) => a.date.getTime() - b.date.getTime());
        message = `Added ${filteredNewData.length} new records. Data updated to ${new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' })}`;
        newRecordsAddedCount = filteredNewData.length;
      }

      // Update data in store
      updateMarketData(finalData);
      setSuccess(`${message} • Записей: ${newRecordsAddedCount}`);
      // Сохраняем сплиты в стор для автосохранения и отображения маркеров на графике
      if (splitEvents.length) {
        setSplits(splitEvents);
      }
      
      // Автосохранение
      if (mode === 'new') {
        // Для нового тикера — автосохранение без промпта (новый файл)
        try {
          const autoName = `${ticker.toUpperCase()}_${new Date().toISOString().split('T')[0]}`;
          await saveDatasetToServer(ticker.toUpperCase(), autoName);
          await loadDatasetsFromServer();
          setSuccess((prev) => (prev ? prev + ' • ' : '') + `✅ Автосохранено как "${autoName}"`);
        } catch (e) {
          setError('Не удалось автоматически сохранить датасет. Проверьте сервер и повторите.');
        }
      } else if (mode === 'existing') {
        // Для обновления существующего — если известен текущий датасет, перезаписываем его (с возможным переименованием файла)
        try {
          if (!currentDataset || !currentDataset.name) {
            // Если датасет не загружен — загрузим первый подходящий по тикеру (если есть)
            const candidate = savedDatasets.find(d => d.ticker.toUpperCase() === ticker.toUpperCase());
            if (candidate) {
              await loadDatasetFromServer(candidate.name);
            }
          }
          await updateDatasetOnServer();
          setSuccess((prev) => (prev ? prev + ' • ' : '') + `✅ Изменения сохранены`);
        } catch (e) {
          setError('Не удалось сохранить изменения. Проверьте сервер и повторите.');
        }
      }
      
      // Update gap analysis
      setTimeout(analyzeDataGaps, 100);

    } catch (err) {
      console.error('Error enhancing data:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while fetching data');
    } finally {
      setIsLoading(false);
    }
  };

  // Удалены save prompt и ручное сохранение для режима existing

  const downloadEnhancedData = () => {
    if (marketData.length === 0) return;

    const csvContent = [
      'Date,Open,High,Low,Close,Volume',
      ...marketData
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map(row => 
          `${row.date.toISOString().split('T')[0]},${row.open},${row.high},${row.low},${row.close},${row.volume}`
        )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ticker || 'enhanced'}-data.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const popularTickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX'];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Обновление данных
        </h2>
        <p className="text-gray-600">
          Работаем только с дневными данными. Период — до 40 лет доступной истории.
        </p>
      </div>

      {/* Переключение режимов: существующие тикеры vs новые данные */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex gap-4">
          <button
            onClick={() => setMode('existing')}
            className={`px-4 py-2 rounded-md text-sm ${mode === 'existing' ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-800'}`}
          >
            Дополнить существующие данные
          </button>
          <button
            onClick={() => setMode('new')}
            className={`px-4 py-2 rounded-md text-sm ${mode === 'new' ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-800'}`}
          >
            Загрузка нового тикера
          </button>
        </div>
        {/* Глобальные настройки провайдера и корректировки AV */}
        <div className="mt-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm bg-white">
            <span className="text-gray-600">Провайдер данных:</span>
            <span className="font-medium text-gray-900 uppercase">{enhancerProvider}</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">Меняется в «Настройках» (шестерёнка в шапке).</p>
        </div>
      </div>

      {/* Current data analysis */}
      {mode === 'existing' && dataGaps && marketData.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900 mb-1">Current Dataset Analysis</h4>
              <div className="text-sm text-blue-800 space-y-1">
                <p>Current dataset: {marketData.length} records</p>
                <p>Period: {dataGaps.firstDate} — {dataGaps.lastDate}</p>
                {isUpToDate ? (
                  <p className="text-green-700 font-medium">✅ Данные актуальны. Обновление не требуется.</p>
                ) : (
                  <p className="font-medium">⚠️ Пропущено примерно {dataGaps.missing} торговых дней</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Формы по режимам */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="space-y-4">
          {mode === 'existing' ? (
            <>
              {savedDatasets.length > 0 ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Выберите датасет для обновления
                  </label>
                  <select
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {savedDatasets.map((d) => (
                      <option key={d.name} value={d.ticker}>
                        {d.ticker} — {d.dateRange.from} — {d.dateRange.to} ({d.dataPoints} pts)
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Будут загружены недостающие дневные бары с последней даты.</p>
                </div>
              ) : (
                <p className="text-sm text-gray-600">Нет сохранённых датасетов. Переключитесь на "Загрузка нового тикера".</p>
              )}

              {!isUpToDate && (
                <button
                  onClick={async () => {
                    await enhanceData();
                  }}
                  disabled={isLoading || !ticker.trim()}
                  className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Обновление данных...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-4 h-4" />
                      Обновить данные
                    </>
                  )}
                </button>
              )}

              {/* Кнопка: запросить сплиты отдельно и сохранить */}
              <button
                onClick={async () => {
                  try {
                    setIsLoading(true);
                    setError(null);
                    const symbol = ticker.trim().toUpperCase();
                    const end = Math.floor(Date.now() / 1000);
                     const start = end - 40 * 365 * 24 * 60 * 60;
                     const prov = enhancerProvider;
                      const base = typeof window !== 'undefined' && window.location.href.includes('/stonks') ? '/stonks/api' : '/api';
                      const resp = await fetchWithCreds(`${base}/splits/${symbol}?start=${start}&end=${end}&provider=${prov}`);
                    if (!resp.ok) {
                      const e = await resp.json();
                      throw new Error(e.error || 'Failed to fetch splits');
                    }
                    const splits = await resp.json();
                    setSplits(splits);
                    setSuccess(`✅ Сплиты обновлены: ${splits.length}`);
                    // Автосохранение текущего датасета со сплитами
                    if (currentDataset) {
                      await saveDatasetToServer(currentDataset.ticker, currentDataset.name);
                    }
                  } catch (e: any) {
                    setError(e?.message || 'Не удалось получить сплиты');
                  } finally {
                    setIsLoading(false);
                  }
                }}
                className="w-full mt-3 inline-flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
              >
                Запросить сплиты отдельно
              </button>
            </>
          ) : (
            <>
              {/* Выбор периода убран: всегда максимальная история */}

              <div>
                <label htmlFor="ticker" className="block text-sm font-medium text-gray-700 mb-2">
                  Тикер акции
                </label>
                <input
                  id="ticker"
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="например, AAPL, MSFT, GOOGL"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">Источник: серверные прокси к реальным API.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Популярные тикеры
                </label>
                <div className="flex flex-wrap gap-2">
                  {popularTickers.map((popularTicker) => (
                    <button
                      key={popularTicker}
                      onClick={() => setTicker(popularTicker)}
                      className={`px-3 py-1 text-sm rounded-md border ${
                        ticker === popularTicker
                          ? 'bg-blue-100 border-blue-300 text-blue-700'
                          : 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {popularTicker}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={async () => {
                  await enhanceData();
                  // Автосохранение теперь внутри enhanceData
                }}
                disabled={isLoading || !ticker.trim()}
                className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Загрузка данных...
                  </>
                ) : (
                  <>
                    <TrendingUp className="w-4 h-4" />
                    Загрузить данные
                  </>
                )}
              </button>
            </>
          )}

          <p className="text-xs text-gray-500 text-center mt-2">
            📈 Источник данных: Alpha Vantage / Finnhub через локальный сервер
          </p>
        </div>
      </div>

      {/* Error and success messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-900">Error</h4>
              <p className="text-sm text-red-800 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-green-900">Success</h4>
              <p className="text-sm text-green-800 mt-1">{success}</p>
            </div>
          </div>
        </div>
      )}

      {/* Save prompt удален для режима existing */}

      {/* Actions with updated data */}
      {marketData.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Data Actions</h4>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={downloadEnhancedData}
              className="inline-flex items-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Download CSV
            </button>
            
            {/* Кнопка ручного сохранения скрыта — теперь автосохранение при новом тикере */}
            
            {onNext && (
              <button
                onClick={onNext}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium"
              >
                Перейти к стратегии
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}