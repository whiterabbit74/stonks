import React from 'react';
import { EquityChart } from './EquityChart';
import { TradesTable } from './TradesTable';
import type { EquityPoint, Trade } from '../types';

interface MonthlyContributionAnalysisProps {
  monthlyContributionAmount: number;
  monthlyContributionDay: number;
  onAmountChange: (amount: number) => void;
  onDayChange: (day: number) => void;
  results: {
    equity: EquityPoint[];
    finalValue: number;
    trades: Trade[];
    metrics: {
        totalContribution: number;
        contributionCount: number;
        netProfit: number;
        netReturn: number;
        totalReturn: number;
        cagr: number;
        profitFactor: number;
        totalTrades: number;
    };
  } | null;
  baseScenarioResults: {
    finalValue: number;
    metrics: {
        totalReturn: number;
        cagr: number;
        netProfit: number;
    };
  } | null;
  leveragePercent: number;
  initialCapital: number;
  comparisonEquity: EquityPoint[];
}

export function MonthlyContributionAnalysis({
  monthlyContributionAmount,
  monthlyContributionDay,
  onAmountChange,
  onDayChange,
  results,
  baseScenarioResults,
  leveragePercent,
  initialCapital,
  comparisonEquity
}: MonthlyContributionAnalysisProps) {

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const diff = React.useMemo(() => {
    if (!results || !baseScenarioResults) return null;
    return {
      finalValueDelta: results.finalValue - baseScenarioResults.finalValue,
      totalReturnDelta: results.metrics.totalReturn - baseScenarioResults.metrics.totalReturn,
      cagrDelta: results.metrics.cagr - baseScenarioResults.metrics.cagr,
      netProfitDelta: results.metrics.netProfit - baseScenarioResults.metrics.netProfit
    };
  }, [results, baseScenarioResults]);

  if (!results) return null;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/30">
        <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-3">Настройки ежемесячного пополнения</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
              Сумма пополнения, $
            </label>
            <input
              type="number"
              min={0}
              step={100}
              value={monthlyContributionAmount}
              onChange={(e) => {
                const value = Number(e.target.value);
                onAmountChange(Number.isFinite(value) ? Math.max(0, value) : 0);
              }}
              className="w-full px-3 py-2 border border-blue-300 dark:border-blue-700 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
              День месяца (1-28)
            </label>
            <input
              type="number"
              min={1}
              max={28}
              value={monthlyContributionDay}
              onChange={(e) => {
                const value = Number(e.target.value);
                const normalized = Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 1), 28) : 1;
                onDayChange(normalized);
              }}
              className="w-full px-3 py-2 border border-blue-300 dark:border-blue-700 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-blue-600 dark:text-blue-300">
          Пополнение становится доступно в торговый день, когда наступает {monthlyContributionDay}-е число месяца.
          Для применения изменений запустите бэктест заново.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Сценарий с ежемесячными пополнениями
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Каждый месяц депозит пополняется на {formatCurrency(monthlyContributionAmount)} в {monthlyContributionDay}-й торговый день месяца. Пополнения сразу доступны для новой сделки с плечом {(leveragePercent / 100).toFixed(1)}:1.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
         <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">Итоговый баланс</div>
          <div className="mt-2 text-2xl font-bold text-green-600 dark:text-green-400">
            {formatCurrency(results.finalValue)}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">Сумма пополнений</div>
          <div className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-300">
            {formatCurrency(results.metrics.totalContribution)}
          </div>
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {results.metrics.contributionCount} взнос(ов)
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">Чистая прибыль</div>
          <div className={`mt-2 text-2xl font-bold ${results.metrics.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-orange-500 dark:text-orange-300'}`}>
            {formatCurrency(results.metrics.netProfit)}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">Чистая доходность</div>
          <div className="mt-2 text-2xl font-bold text-purple-600 dark:text-purple-300">
            {results.metrics.netReturn.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">Общая доходность</div>
          <div className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-300">
            {results.metrics.totalReturn.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">CAGR</div>
          <div className="mt-2 text-2xl font-bold text-orange-600 dark:text-orange-300">
            {results.metrics.cagr.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">Profit Factor</div>
          <div className="mt-2 text-2xl font-bold text-indigo-600 dark:text-indigo-300">
            {results.metrics.profitFactor.toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">Сделок</div>
          <div className="mt-2 text-2xl font-bold text-teal-600 dark:text-teal-300">
            {results.metrics.totalTrades}
          </div>
        </div>
      </div>

      {diff && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-100">
          <div className="text-sm uppercase tracking-wide text-emerald-600 dark:text-emerald-200">Сравнение со стандартным режимом</div>
          <ul className="mt-2 space-y-1">
            <li className="flex items-center justify-between">
              <span>Δ конечного капитала</span>
              <span className="font-semibold">{diff.finalValueDelta >= 0 ? '+' : ''}{formatCurrency(diff.finalValueDelta)}</span>
            </li>
            <li className="flex items-center justify-between">
              <span>Δ общей доходности</span>
              <span className="font-semibold">{diff.totalReturnDelta >= 0 ? '+' : ''}{diff.totalReturnDelta.toFixed(1)}%</span>
            </li>
             <li className="flex items-center justify-between">
              <span>Δ CAGR</span>
              <span className="font-semibold">{diff.cagrDelta >= 0 ? '+' : ''}{diff.cagrDelta.toFixed(1)}%</span>
            </li>
            <li className="flex items-center justify-between">
              <span>Δ чистой прибыли</span>
              <span className="font-semibold">{diff.netProfitDelta >= 0 ? '+' : ''}{formatCurrency(diff.netProfitDelta)}</span>
            </li>
          </ul>
        </div>
      )}

      <div className="space-y-6">
        <div className="space-y-4">
          <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            График капитала (сравнение со стандартным режимом)
          </h4>
          {results.equity.length > 0 ? (
            <div className="w-full h-[440px] lg:h-[520px]">
              <EquityChart
                equity={results.equity}
                comparisonEquity={comparisonEquity}
                comparisonLabel="Без пополнений"
                primaryLabel="С пополнениями"
                hideHeader
              />
            </div>
          ) : (
            <div className="flex h-72 items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
              Нет данных по equity
            </div>
          )}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 shadow-sm dark:border-blue-900/60 dark:bg-blue-900/40 dark:text-blue-100">
            <p>Совокупные вложения: {formatCurrency(results.metrics.totalContribution + initialCapital)}</p>
            <p>Пополнений произведено: {results.metrics.contributionCount}</p>
            <p>Плечо стратегии: {(leveragePercent / 100).toFixed(1)}:1</p>
          </div>
        </div>
        <div className="space-y-4">
          <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            История сделок ({results.trades.length})
          </h4>
          {results.trades.length > 0 ? (
            <div className="-mx-6 overflow-x-auto">
              <div className="min-w-full px-6">
                <TradesTable
                  trades={results.trades}
                  exportFileNamePrefix={`trades-monthly-contribution-${monthlyContributionAmount}`}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-72 items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
              Сделки отсутствуют
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
