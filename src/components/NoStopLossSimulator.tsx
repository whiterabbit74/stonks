import { useMemo, useState } from 'react';
import type { EquityPoint, OHLCData, Strategy, Trade } from '../types';
import { EquityChart } from './EquityChart';
import { CleanBacktestEngine, type CleanBacktestOptions } from '../lib/clean-backtest';
import { TradesTable } from './TradesTable';
import { StrategyParameters } from './StrategyParameters';
import { Settings } from 'lucide-react';

interface NoStopLossSimulatorProps {
  data: OHLCData[];
  strategy: Strategy | null | undefined;
}

interface SimulationResult {
  equity: EquityPoint[];
  finalValue: number;
  trades: Trade[];
  cagr: number;
  maxDrawdown: number;
}

type ExitMode = 'never' | 'ibs-only' | 'time-limit' | 'profit-target';

interface SimulationConfig {
  exitMode: ExitMode;
  maxHoldDays: number;
  profitTarget: number;
  requireProfitableExit: boolean;
  leverage: number;
}

function runNoStopLossBacktest(
  data: OHLCData[],
  strategy: Strategy,
  config: SimulationConfig
): SimulationResult {
  if (!Array.isArray(data) || data.length === 0 || !strategy) {
    return { equity: [], finalValue: 0, trades: [], cagr: 0, maxDrawdown: 0 };
  }

  // Create modified strategy based on config
  const modifiedStrategy: Strategy = {
    ...strategy,
    riskManagement: {
      ...strategy.riskManagement,
      useStopLoss: false,
      useTakeProfit: config.exitMode === 'profit-target',
      takeProfit: config.profitTarget,
      leverage: config.leverage,
    },
    parameters: {
      ...strategy.parameters,
      maxHoldDays: config.exitMode === 'time-limit' ? config.maxHoldDays : 9999,
    }
  };

  // Set up engine options
  const options: CleanBacktestOptions = {
    entryExecution: 'nextOpen',
    ignoreMaxHoldDaysExit: config.exitMode === 'never' || config.exitMode === 'ibs-only',
    ibsExitRequireAboveEntry: config.requireProfitableExit
  };

  const engine = new CleanBacktestEngine(data, modifiedStrategy, options);
  const result = engine.runBacktest();

  // Calculate CAGR
  let cagr = 0;
  if (result.equity.length > 1) {
    const initialValue = result.equity[0].value;
    const finalValue = result.equity[result.equity.length - 1].value;
    const startDate = new Date(result.equity[0].date);
    const endDate = new Date(result.equity[result.equity.length - 1].date);
    const years = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    
    if (years > 0 && initialValue > 0) {
      cagr = (Math.pow(finalValue / initialValue, 1 / years) - 1) * 100;
    }
  }

  // Calculate max drawdown
  let maxDrawdown = 0;
  let peak = 0;
  for (const point of result.equity) {
    if (point.value > peak) peak = point.value;
    const drawdown = peak > 0 ? ((peak - point.value) / peak) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return {
    equity: result.equity,
    finalValue: result.equity.length > 0 ? result.equity[result.equity.length - 1].value : 0,
    trades: result.trades,
    cagr,
    maxDrawdown
  };
}

export function NoStopLossSimulator({ data, strategy }: NoStopLossSimulatorProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showTrades, setShowTrades] = useState(false);
  
  const [config, setConfig] = useState<SimulationConfig>({
    exitMode: 'ibs-only',
    maxHoldDays: 60,
    profitTarget: 10,
    requireProfitableExit: false,
    leverage: 1
  });

  const result = useMemo(
    () => runNoStopLossBacktest(data, strategy as Strategy, config),
    [data, strategy, config]
  );

  const exitModeLabels: Record<ExitMode, string> = {
    'never': 'Никогда (держать до конца)',
    'ibs-only': 'Только по IBS',
    'time-limit': 'По времени или IBS',
    'profit-target': 'По профиту или IBS'
  };

  if (!strategy) {
    return <div className="text-center text-gray-500 py-8">Стратегия не выбрана</div>;
  }

  const lowIBS = Number(strategy.parameters?.lowIBS ?? 0.1);
  const highIBS = Number(strategy.parameters?.highIBS ?? 0.75);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Без stop loss</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Альтернативные стратегии выхода без использования stop loss
          </p>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <Settings className="w-4 h-4" />
          Настройки
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="p-4 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg space-y-4">
          <h4 className="font-medium text-gray-900 dark:text-gray-100">Параметры симуляции</h4>
          
          {/* Exit Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Режим выхода
            </label>
            <select
              value={config.exitMode}
              onChange={(e) => setConfig(prev => ({ ...prev, exitMode: e.target.value as ExitMode }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
            >
              {Object.entries(exitModeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Max Hold Days */}
            {config.exitMode === 'time-limit' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Максимум дней
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={config.maxHoldDays}
                  onChange={(e) => {
  const value = parseInt(e.target.value, 10);
  setConfig(prev => ({ ...prev, maxHoldDays: isNaN(value) ? 30 : Math.max(1, value) }));
}}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
                />
              </div>
            )}

            {/* Profit Target */}
            {config.exitMode === 'profit-target' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Цель профита (%)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="0.5"
                  value={config.profitTarget}
                  onChange={(e) => {
  const value = parseFloat(e.target.value);
  setConfig(prev => ({ ...prev, profitTarget: isNaN(value) ? 0 : Math.max(0, value) }));
}}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
                />
              </div>
            )}

            {/* Leverage */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Плечо (x)
              </label>
              <input
                type="number"
                min="0.1"
                max="5"
                step="0.1"
                value={config.leverage}
                onChange={(e) => {
  const value = parseFloat(e.target.value);
  setConfig(prev => ({ ...prev, leverage: isNaN(value) ? 1 : Math.max(0.1, Math.min(10, value)) }));
}}
                className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
              />
            </div>
          </div>

          {/* Require Profitable Exit */}
          <div className="flex items-center gap-2">
            <input
              id="requireProfitableExit"
              type="checkbox"
              checked={config.requireProfitableExit}
              onChange={(e) => setConfig(prev => ({ ...prev, requireProfitableExit: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-900 dark:border-gray-700"
            />
            <label htmlFor="requireProfitableExit" className="text-sm text-gray-700 dark:text-gray-200">
              Выход по IBS только при профите (цена выше входа)
            </label>
          </div>
        </div>
      )}

      {/* Strategy Description */}
      <div className="text-sm text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/40 rounded px-3 py-2">
        <div className="font-medium text-blue-800 dark:text-blue-200 mb-1">Текущая конфигурация:</div>
        <div>
          <span className="font-semibold">Вход:</span> IBS &lt; {lowIBS} на открытии следующего дня
        </div>
        <div>
          <span className="font-semibold">Выход:</span>{' '}
          {config.exitMode === 'never' && 'Держать до конца периода'}
          {config.exitMode === 'ibs-only' && `IBS > ${highIBS}${config.requireProfitableExit ? ' (только при профите)' : ''}`}
          {config.exitMode === 'time-limit' && `IBS > ${highIBS} или через ${config.maxHoldDays} дней`}
          {config.exitMode === 'profit-target' && `IBS > ${highIBS} или профит ${config.profitTarget}%`}
        </div>
        {config.leverage !== 1 && (
          <div>
            <span className="font-semibold">Плечо:</span> ×{config.leverage}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border p-3 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-300">Финальная стоимость</div>
          <div className="text-base font-semibold dark:text-gray-100">
            ${result.finalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="rounded-lg border p-3 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-300">CAGR</div>
          <div className="text-base font-semibold dark:text-gray-100">{result.cagr.toFixed(2)}%</div>
        </div>
        <div className="rounded-lg border p-3 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-300">Макс. просадка</div>
          <div className="text-base font-semibold dark:text-gray-100">{result.maxDrawdown.toFixed(2)}%</div>
        </div>
        <div className="rounded-lg border p-3 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-300">Сделок</div>
          <div className="text-base font-semibold dark:text-gray-100">{result.trades.length}</div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[60vh] min-h-[400px] max-h-[600px]">
        <EquityChart equity={result.equity} hideHeader />
      </div>

      {/* Trades Toggle */}
      <div className="flex justify-center">
        <button
          onClick={() => setShowTrades(!showTrades)}
          className="px-4 py-2 text-sm rounded-md border border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          {showTrades ? 'Скрыть сделки' : `Показать сделки (${result.trades.length})`}
        </button>
      </div>

      {/* Trades Table */}
      {showTrades && result.trades.length > 0 && strategy && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">История сделок</h4>

          <StrategyParameters
            strategy={{
              ...strategy,
              riskManagement: {
                ...strategy.riskManagement,
                useStopLoss: false,
                useTakeProfit: config.exitMode === 'profit-target',
                takeProfit: config.profitTarget,
                leverage: config.leverage,
              },
              parameters: {
                ...strategy.parameters,
                maxHoldDays: config.exitMode === 'time-limit' ? config.maxHoldDays : 9999,
              }
            }}
            additionalParams={{
              'Эмуляция плеча': `${config.leverage}:1`,
              'Начальный капитал': '$10,000'
            }}
          />

          <TradesTable
            trades={result.trades}
            exportFileNamePrefix="trades-no-stop-loss"
          />
        </div>
      )}
    </div>
  );
}

