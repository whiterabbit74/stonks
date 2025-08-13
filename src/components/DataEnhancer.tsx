import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Calendar, TrendingUp, AlertCircle, CheckCircle, Download } from 'lucide-react';
import { useAppStore } from '../stores';
import type { OHLCData } from '../types';
import { parseOHLCDate, adjustOHLCForSplits } from '../lib/utils';
import { fetchWithCreds, API_BASE_URL, DatasetAPI } from '../lib/api';

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
  }, [marketData, currentDataset, analyzeDataGaps]);

  const analyzeDataGaps = useCallback(() => {
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
  }, [marketData]);

  const getStartDateForPeriod = (): Date => {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setFullYear(now.getFullYear() - 40);
    return startDate;
  };

  type FetchResult = { data: YahooFinanceData[]; splits: { date: string; factor: number }[] };
  const fetchRealMarketData = async (symbol: string, startDate: Date): Promise<FetchResult> => {
    const endDate = new Date();
    const start = Math.floor(startDate.getTime() / 1000);
    const end = Math.floor(endDate.getTime() / 1000);
    
    // Строго используем выбранный провайдер без fallback
    const url = `${API_BASE_URL}/yahoo-finance/${symbol}?start=${start}&end=${end}&provider=${enhancerProvider}`;
    const response = await fetchWithCreds(url);
    if (!response.ok) {
      let msg = `${response.status} ${response.statusText}`;
      const e = await response.json().catch(() => null);
      if (e && typeof e.error === 'string') msg = e.error;
      throw new Error(msg);
    }
    const json = await response.json();
    if (Array.isArray(json)) return { data: json as YahooFinanceData[], splits: [] };
    return { data: (json.data || []) as YahooFinanceData[], splits: (json.splits || []) as { date: string; factor: number }[] };
  };

  const handleLoadNewTicker = async () => {
    if (!ticker.trim()) {
      setError('Please enter a ticker symbol');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const startDate = getStartDateForPeriod();

      const symbol = ticker.trim().toUpperCase();
      const realData = await fetchRealMarketData(symbol, startDate);
      const rawRows = realData.data;
      // Единый источник: центральный серверный splits.json
      const splitEvents = await DatasetAPI.getSplits(symbol).catch(() => [] as { date: string; factor: number }[]);
      
      if (rawRows.length === 0) {
        setError('No data found or ticker does not exist');
        return;
      }

      // Convert real market data to our format
      const newDataRaw: OHLCData[] = rawRows.map(item => ({
        date: parseOHLCDate(item.date),
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        adjClose: item.adjClose,
        volume: item.volume
      }));
      const newData = adjustOHLCForSplits(newDataRaw, splitEvents);
      const finalData: OHLCData[] = newData.sort((a, b) => a.date.getTime() - b.date.getTime());
      updateMarketData(finalData);
      setSuccess(`Loaded ${finalData.length} records for ${ticker.toUpperCase()}`);
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
        } catch {
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
        } catch {
          setError('Не удалось сохранить изменения. Проверьте сервер и повторите.');
        }
      }

    } catch (err) {
      console.error('Error enhancing data:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while fetching data');
    } finally {
      setIsLoading(false);
    }
  };

  const popularTickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX'];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">New data</h2>
        <p className="text-gray-600">Загрузка исторических дневных данных по новому тикеру (до ~40 лет).</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm bg-white">
          <span className="text-gray-600">Провайдер данных:</span>
          <span className="font-medium text-gray-900 uppercase">{enhancerProvider}</span>
        </div>
        <p className="text-xs text-gray-500 mt-2">Меняется на вкладке «Настройки».</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="space-y-4">
          <div>
            <label htmlFor="ticker" className="block text-sm font-medium text-gray-700 mb-2">Тикер акции</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Популярные тикеры</label>
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
                    if (currentDataset) {
                      await saveDatasetToServer(currentDataset.ticker, currentDataset.name);
                    }
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : 'Не удалось получить сплиты';
                    setError(msg);
                  } finally {
                    setIsLoading(false);
                  }
                }}
                className="w-full mt-3 inline-flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
              >
                Запросить сплиты отдельно
              </button>
            </div>
          </div>

           <p className="text-xs text-gray-500 text-center mt-2">📈 Источник данных: Alpha Vantage / Finnhub через локальный сервер</p>

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

      {/* Доп. действия (минимум): переход к результатам при наличии колбэка */}
      {onNext && (
        <div className="bg-gray-50 rounded-lg p-4">
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