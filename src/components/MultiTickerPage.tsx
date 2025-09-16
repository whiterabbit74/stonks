import React, { useState, useEffect } from 'react';
import { Download, Settings } from 'lucide-react';
import { useAppStore } from '../stores';
import type { Strategy, OHLCData, Trade, EquityPoint } from '../types';
import { DatasetAPI } from '../lib/api';
import { adjustOHLCForSplits, dedupeDailyOHLC } from '../lib/utils';
import { IndicatorEngine } from '../lib/indicators';
import { MultiTickerChart } from './MultiTickerChart';
import { EquityChart } from './EquityChart';
import { TradesTable } from './TradesTable';
import { runSinglePositionBacktest, optimizeTickerData, formatCurrencyCompact } from '../lib/singlePositionBacktest';

interface TickerData {
  ticker: string;
  data: OHLCData[];
  ibsValues: number[];
}

interface BacktestResults {
  equity: EquityPoint[];
  finalValue: number;
  maxDrawdown: number;
  trades: Trade[];
  metrics: {
    totalReturn: number;
    cagr: number;
    winRate: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    profitFactor: number;
  };
}

export function MultiTickerPage() {
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [tickers, setTickers] = useState<string[]>(['AAPL', 'MSFT', 'GOOGL', 'AMZN']);
  const [tickersInput, setTickersInput] = useState<string>('AAPL, MSFT, GOOGL, AMZN');
  const [leveragePercent, setLeveragePercent] = useState(200);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backtestResults, setBacktestResults] = useState<BacktestResults | null>(null);
  const [tickersData, setTickersData] = useState<TickerData[]>([]);
  const [activeTab, setActiveTab] = useState<'price' | 'equity' | 'trades' | 'tiles'>('price');

  // Получаем стратегии из store
  const strategies = useAppStore(s => s.strategies) || [];
  const currentStrategy = useAppStore(s => s.currentStrategy);

  // Используем текущую стратегию по умолчанию
  useEffect(() => {
    if (currentStrategy && !selectedStrategy) {
      setSelectedStrategy(currentStrategy);
    }
  }, [currentStrategy, selectedStrategy]);

  // Функция загрузки данных тикера
  const loadTickerData = async (ticker: string): Promise<TickerData> => {
    const ds = await DatasetAPI.getDataset(ticker);

    let processedData: OHLCData[];

    if ((ds as any).adjustedForSplits) {
      processedData = dedupeDailyOHLC(ds.data as unknown as OHLCData[]);
    } else {
      let splits: Array<{ date: string; factor: number }> = [];
      try {
        splits = await DatasetAPI.getSplits(ds.ticker);
      } catch {
        splits = [];
      }
      processedData = dedupeDailyOHLC(adjustOHLCForSplits(ds.data as unknown as OHLCData[], splits));
    }

    const ibsValues = processedData.length > 0 ? IndicatorEngine.calculateIBS(processedData) : [];

    return {
      ticker,
      data: processedData,
      ibsValues
    };
  };

  // Запуск бэктеста
  const runBacktest = async () => {
    if (!selectedStrategy) {
      setError('Выберите стратегию');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('🚀 Loading data for tickers:', tickers);
      const tickersDataPromises = tickers.map(ticker => loadTickerData(ticker));
      const loadedData = await Promise.all(tickersDataPromises);

      console.log('✅ Loaded data:', loadedData.map(t => ({ ticker: t.ticker, bars: t.data.length })));

      if (loadedData.length === 0) {
        throw new Error('Нет данных для выбранных тикеров');
      }

      setTickersData(loadedData);

      // Run backtest with real logic
      const optimizedData = optimizeTickerData(loadedData);
      const backtestResult = runSinglePositionBacktest(optimizedData, selectedStrategy, leveragePercent / 100);

      const results: BacktestResults = {
        equity: backtestResult.equity,
        finalValue: backtestResult.finalValue,
        maxDrawdown: backtestResult.maxDrawdown,
        trades: backtestResult.trades,
        metrics: {
          totalReturn: backtestResult.metrics.totalReturn || 0,
          cagr: backtestResult.metrics.cagr || 0,
          winRate: backtestResult.metrics.winRate || 0,
          totalTrades: backtestResult.metrics.totalTrades || 0,
          winningTrades: backtestResult.metrics.winningTrades || 0,
          losingTrades: backtestResult.metrics.losingTrades || 0,
          profitFactor: backtestResult.metrics.profitFactor || 0
        }
      };

      setBacktestResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при выполнении бэктеста');
      console.error('Backtest error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number): string => {
    if (Math.abs(value) >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(2)}M`;
    } else if (Math.abs(value) >= 1_000) {
      return `$${(value / 1_000).toFixed(1)}K`;
    } else {
      return `$${value.toFixed(2)}`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Заголовок и контролы */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Несколько тикеров
          </h1>
          <Settings className="w-6 h-6 text-gray-500" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Выбор стратегии */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Стратегия
            </label>
            <select
              value={selectedStrategy?.name || ''}
              onChange={(e) => {
                const strategy = strategies.find(s => s.name === e.target.value);
                setSelectedStrategy(strategy || null);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="">Выберите стратегию</option>
              {strategies.map(strategy => (
                <option key={strategy.name} value={strategy.name}>
                  {strategy.name}
                </option>
              ))}
            </select>
          </div>

          {/* Тикеры */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Тикеры (через запятую)
            </label>
            <input
              type="text"
              value={tickersInput}
              onChange={(e) => {
                setTickersInput(e.target.value);
                const parsedTickers = e.target.value.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
                setTickers(parsedTickers);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="AAPL, MSFT, GOOGL, AMZN"
            />
          </div>

          {/* Leverage */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Leverage: {(leveragePercent/100).toFixed(1)}:1
            </label>
            <select
              value={leveragePercent}
              onChange={(e) => setLeveragePercent(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value={100}>100% (без плеча)</option>
              <option value={150}>150% (1.5:1)</option>
              <option value={200}>200% (2:1)</option>
              <option value={250}>250% (2.5:1)</option>
              <option value={300}>300% (3:1)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>Тикеры: <span className="font-mono">{tickers.join(', ')}</span></p>
            <p>Стратегия Single Position: одна позиция на весь депозит</p>
          </div>

          <button
            onClick={runBacktest}
            disabled={isLoading || !selectedStrategy || tickers.length === 0}
            className="inline-flex items-center px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors"
          >
            {isLoading ? 'Расчёт...' : 'Запустить бэктест'}
          </button>
        </div>
      </div>

      {/* Основной график */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Сводный график тикеров
        </h2>
        <MultiTickerChart tickersData={tickersData} height={500} />
      </div>

      {/* Метрики доходности */}
      {backtestResults && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(backtestResults.finalValue)}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Итоговый баланс</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {backtestResults.metrics.totalReturn.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Общая доходность</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">
              {backtestResults.metrics.cagr.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">CAGR</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {backtestResults.metrics.winRate.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Win Rate</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <div className="text-2xl font-bold text-red-600">
              {backtestResults.maxDrawdown.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Макс. просадка</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <div className="text-2xl font-bold text-indigo-600">
              {backtestResults.metrics.totalTrades}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Всего сделок</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <div className="text-2xl font-bold text-teal-600">
              {backtestResults.metrics.profitFactor.toFixed(2)}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Profit Factor</div>
          </div>
        </div>
      )}

      {/* Табы с анализом */}
      {backtestResults && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          {/* Заголовки табов */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            {[
              { id: 'price' as const, label: '📈 Цены' },
              { id: 'equity' as const, label: '💰 Equity' },
              { id: 'trades' as const, label: '📊 Сделки' },
              { id: 'tiles' as const, label: '🔢 Плитки' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Содержимое табов */}
          <div className="p-6">
            {activeTab === 'price' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Индивидуальные графики цен
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tickers.map(ticker => (
                    <div key={ticker} className="h-48 bg-gray-50 dark:bg-gray-900/50 rounded border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
                      <div className="text-gray-500 dark:text-gray-400 text-center">
                        <div className="font-medium">{ticker}</div>
                        <div className="text-sm">График цены</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'equity' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  График капитала
                </h3>
                {backtestResults.equity.length > 0 ? (
                  <div className="w-full h-[500px]">
                    <EquityChart equity={backtestResults.equity} hideHeader />
                  </div>
                ) : (
                  <div className="h-96 bg-gray-50 dark:bg-gray-900/50 rounded border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
                    <div className="text-gray-500 dark:text-gray-400 text-center">
                      <div className="text-lg font-medium mb-2">📈 Equity Chart</div>
                      <p className="text-sm">Нет данных по equity</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'trades' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  История сделок ({backtestResults.trades.length})
                </h3>
                {backtestResults.trades.length > 0 ? (
                  <div className="max-h-[600px] overflow-auto">
                    <TradesTable trades={backtestResults.trades} />
                  </div>
                ) : (
                  <div className="h-96 bg-gray-50 dark:bg-gray-900/50 rounded border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
                    <div className="text-gray-500 dark:text-gray-400 text-center">
                      <div className="text-lg font-medium mb-2">📊 Trades Table</div>
                      <p className="text-sm">Нет сделок для отображения</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'tiles' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Детальные метрики
                </h3>
                <div className="h-96 bg-gray-50 dark:bg-gray-900/50 rounded border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
                  <div className="text-gray-500 dark:text-gray-400 text-center">
                    <div className="text-lg font-medium mb-2">🔢 Metrics Tiles</div>
                    <p className="text-sm">Плитки с подробными метриками</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ошибки */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="text-red-800 dark:text-red-200">
            ❌ {error}
          </div>
        </div>
      )}

      {/* Состояние загрузки */}
      {isLoading && (
        <div className="text-center py-8">
          <div className="text-gray-600 dark:text-gray-400">
            🔄 Загрузка данных и выполнение бэктеста...
          </div>
        </div>
      )}
    </div>
  );
}