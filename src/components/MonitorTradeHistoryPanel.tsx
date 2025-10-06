import React from 'react';
import { RefreshCw } from 'lucide-react';
import type { MonitorTradeHistoryResponse, MonitorTradeRecord } from '../types';

interface MonitorTradeHistoryPanelProps {
  data: MonitorTradeHistoryResponse | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  maxRows?: number;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('ru-RU');
  } catch {
    return value;
  }
}

function formatDateRange(entry: string | null, exit: string | null) {
  const entryStr = formatDate(entry);
  const exitStr = exit ? formatDate(exit) : '—';
  return `${entryStr} → ${exitStr}`;
}

function formatNumber(value: number | null | undefined, fractionDigits = 2) {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toFixed(fractionDigits);
}

function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function renderIBS(entry: number | null | undefined, exit: number | null | undefined) {
  const entryStr = entry != null ? `${(entry * 100).toFixed(1)}%` : '—';
  const exitStr = exit != null ? `${(exit * 100).toFixed(1)}%` : '—';
  return `${entryStr} → ${exitStr}`;
}

function TradeRow({ trade, isHighlighted }: { trade: MonitorTradeRecord; isHighlighted: boolean }) {
  const pnlPositive = (trade.pnlPercent ?? 0) > 0;
  const statusBadge = trade.status === 'open'
    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    : 'bg-gray-100 text-gray-600 border border-gray-200';

  return (
    <tr className={`border-b last:border-none ${isHighlighted ? 'bg-blue-50/60 dark:bg-blue-900/20' : ''}`}>
      <td className="px-3 py-2 font-semibold text-gray-900 dark:text-gray-100">{trade.symbol}</td>
      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge}`}>
          {trade.status === 'open' ? 'Открыта' : 'Закрыта'}
        </span>
      </td>
      <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-200 whitespace-nowrap">
        {formatDateRange(trade.entryDate, trade.exitDate)}
      </td>
      <td className="px-3 py-2 text-right font-mono text-sm text-gray-800 dark:text-gray-100">
        {trade.entryPrice != null ? `$${formatNumber(trade.entryPrice)}` : '—'}
      </td>
      <td className="px-3 py-2 text-right font-mono text-sm text-gray-800 dark:text-gray-100">
        {trade.exitPrice != null ? `$${formatNumber(trade.exitPrice)}` : '—'}
      </td>
      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
        {renderIBS(trade.entryIBS, trade.exitIBS)}
      </td>
      <td className={`px-3 py-2 text-right font-mono text-sm ${pnlPositive ? 'text-emerald-600 dark:text-emerald-300' : trade.pnlPercent === null ? 'text-gray-500 dark:text-gray-400' : 'text-orange-600 dark:text-orange-300'}`}>
        {formatPercent(trade.pnlPercent)}
      </td>
    </tr>
  );
}

export function MonitorTradeHistoryPanel({ data, loading = false, error = null, onRefresh, maxRows = 10 }: MonitorTradeHistoryPanelProps) {
  const trades = data?.trades ?? [];
  const openTrade = data?.openTrade ?? null;
  const rows = [...trades].reverse().slice(0, maxRows);
  const hasTrades = rows.length > 0;

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">История сделок мониторинга</h3>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {data?.lastUpdated ? `Обновлено: ${formatDate(data.lastUpdated)}` : 'Нет данных об обновлении'}
          </div>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            type="button"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </button>
        )}
      </div>

      {error && (
        <div className="border-b border-gray-100 bg-red-50 px-4 py-2 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="px-4 py-4 space-y-4">
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
          {openTrade ? (
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Текущая позиция: {openTrade.symbol}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Вход {formatDate(openTrade.entryDate)} по {openTrade.entryPrice != null ? `$${formatNumber(openTrade.entryPrice)}` : '—'}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                IBS {openTrade.entryIBS != null ? `${(openTrade.entryIBS * 100).toFixed(1)}%` : '—'}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600 dark:text-gray-300">Открытых позиций нет</div>
          )}
        </div>

        {loading && (
          <div className="text-sm text-gray-500 dark:text-gray-400">Загрузка истории сделок…</div>
        )}

        {!loading && !hasTrades && !error && (
          <div className="text-sm text-gray-500 dark:text-gray-400">Сделки ещё не зафиксированы.</div>
        )}

        {!loading && hasTrades && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Тикер</th>
                  <th className="px-3 py-2 text-left font-semibold">Статус</th>
                  <th className="px-3 py-2 text-left font-semibold">Период</th>
                  <th className="px-3 py-2 text-right font-semibold">Вход</th>
                  <th className="px-3 py-2 text-right font-semibold">Выход</th>
                  <th className="px-3 py-2 text-left font-semibold">IBS</th>
                  <th className="px-3 py-2 text-right font-semibold">PnL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map(trade => (
                  <TradeRow key={trade.id} trade={trade} isHighlighted={openTrade?.id === trade.id} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
