import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { useAppStore } from '../stores';
import { fetchWithCreds, API_BASE_URL } from '../lib/api';
import { parseOHLCDate } from '../lib/utils';

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

export function DataEnhancer({ onNext }: DataEnhancerProps) {
  const { marketData, currentDataset, enhancerProvider, updateMarketData, saveDatasetToServer } = useAppStore();
  const [ticker, setTicker] = useState('AAPL');
  const [, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [, setDataGaps] = useState<{ missing: number; lastDate: string; firstDate: string } | null>(null);
  const [, setSelectedAction] = useState<'enhance' | 'replace'>('enhance');
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  // const { loadDatasetsFromServer } = useAppStore();
  // Убрали промпт ручного сохранения
  // Всегда грузим всю доступную историю (~до 40 лет), выбор периода убран
  // const [isUpToDate, setIsUpToDate] = useState(false);

  // При смене режима очищаем сообщения, чтобы не путать пользователя
  useEffect(() => {
    setError(null);
    setSuccess(null);
  }, []);

  // Синхронизируем действие с выбранным режимом: existing -> enhance, new -> replace
  useEffect(() => {
    setSelectedAction(mode === 'existing' ? 'enhance' : 'replace');
  }, [mode, setSelectedAction]);

  // Анализируем пропуски в данных при загрузке компонента
  useEffect(() => {
    if (marketData.length > 0) {
      analyzeDataGaps();
      // Устанавливаем тикер из текущего датасета если есть
      if (currentDataset?.ticker) {
        setTicker(currentDataset.ticker);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketData, currentDataset]);

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
    if (missing === 0) {
      // убираем старые статусы, чтобы не плодить сообщения
      setSuccess(null);
      setError(null);
    }
  }, [marketData]);

  // Removed fetch for market data; this screen only manages splits now

  const popularTickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX'];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Новые данные</h2>
        <p className="text-gray-600">Загрузка дневной истории по новому тикеру (до ~40 лет).</p>
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
            <label htmlFor="ticker" className="block text-sm font-medium text-gray-700 mb-2">Тикер</label>
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

          <button
            onClick={async () => {
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
            }}
            className="w-full mt-3 inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700"
          >
            Загрузить данные
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
              <h4 className="font-medium text-red-900">Ошибка</h4>
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
              <h4 className="font-medium text-green-900">Готово</h4>
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