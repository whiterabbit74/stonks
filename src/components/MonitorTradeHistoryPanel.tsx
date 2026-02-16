import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Download, FileSpreadsheet, ChevronDown, ChevronUp, Filter, ExternalLink } from 'lucide-react';
import type { MonitorTradeHistoryResponse, MonitorTradeRecord } from '../types';
import { calculateMonitorTradeMetrics } from '../lib/monitor-trade-metrics';

interface MonitorTradeHistoryPanelProps {
  data: MonitorTradeHistoryResponse | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  maxRows?: number;
  initialCapital?: number;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  // Если это просто дата YYYY-MM-DD (торговый день Нью-Йорка), форматируем её как текст,
  // чтобы избежать смещения часовых поясов браузера.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}.${m}.${y}`;
  }
  try {
    // Если это ISO строка, приводим к времени Нью-Йорка
    return new Date(value).toLocaleDateString('ru-RU', {
      timeZone: 'America/New_York'
    });
  } catch {
    return value;
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    // Всегда отображаем время Нью-Йорка
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/New_York',
      timeZoneName: 'short'
    });
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
      <td className="px-3 py-2 font-semibold text-gray-900 dark:text-gray-100">
        <Link
          to={`/results?ticker=${encodeURIComponent(trade.symbol)}`}
          className="inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          {trade.symbol}
          <ExternalLink className="w-3 h-3 opacity-50" />
        </Link>
      </td>
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

export function MonitorTradeHistoryPanel({
  data,
  loading = false,
  error = null,
  onRefresh,
  maxRows = 10,
  initialCapital = 10000
}: MonitorTradeHistoryPanelProps) {
  const [showAll, setShowAll] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [pnlFilter, setPnlFilter] = useState<'all' | 'profit' | 'loss'>('all');
  const trades = useMemo(() => data?.trades ?? [], [data]);
  const openTrade = data?.openTrade ?? null;

  // Apply filters
  const filteredTrades = useMemo(() => {
    let result = trades;

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(t => t.status === statusFilter);
    }

    // PnL filter
    if (pnlFilter !== 'all') {
      result = result.filter(t => {
        if (pnlFilter === 'profit') return (t.pnlPercent ?? 0) > 0;
        if (pnlFilter === 'loss') return (t.pnlPercent ?? 0) <= 0;
        return true;
      });
    }

    return result;
  }, [trades, statusFilter, pnlFilter]);

  // Сортируем так, чтобы открытые позиции были вверху, затем остальные в обратном порядке
  const sorted = useMemo(() => {
    return [...filteredTrades].sort((a, b) => {
      // Открытые позиции всегда выше
      if (a.status === 'open' && b.status !== 'open') return -1;
      if (a.status !== 'open' && b.status === 'open') return 1;

      // Для остальных сортируем по дате выхода или входа (более свежие выше)
      const dateA = a.exitDate || a.entryDate || '';
      const dateB = b.exitDate || b.entryDate || '';
      return dateB.localeCompare(dateA);
    });
  }, [filteredTrades]);

  const rows = showAll ? sorted : sorted.slice(0, maxRows);
  const hasMoreRows = sorted.length > maxRows;
  const hasTrades = rows.length > 0;
  const isFiltered = statusFilter !== 'all' || pnlFilter !== 'all';

  const summaryStats = useMemo(
    () => calculateMonitorTradeMetrics(trades, initialCapital),
    [trades, initialCapital]
  );

  // Функция экспорта в JSON
  const handleExportJSON = () => {
    const exportData = {
      trades: trades,
      openTrade: openTrade,
      statistics: {
        totalTrades: trades.length,
        closedTrades: summaryStats.closedTradesCount,
        openTrades: trades.filter(t => t.status === 'open').length,
        totalPnlPercent: summaryStats.sumReturnPct,
        avgPnlPercent: summaryStats.avgReturnPct,
        winCount: summaryStats.winCount,
        lossCount: summaryStats.lossCount,
        winRate: summaryStats.winRatePct,
        totalReturnPct: summaryStats.totalReturnPct,
        finalBalance: summaryStats.finalBalance,
        netProfit: summaryStats.netProfit,
        maxDrawdownPct: summaryStats.maxDrawdownPct,
        profitFactor: summaryStats.profitFactor
      },
      exportedAt: new Date().toISOString(),
      lastUpdated: data?.lastUpdated || null
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:]/g, '-').split('.')[0];
    a.href = url;
    a.download = `monitor-trades-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Функция экспорта в CSV
  const handleExportCSV = () => {
    const headers = ['Тикер', 'Статус', 'Дата входа', 'Дата выхода', 'Цена входа', 'Цена выхода', 'IBS вход', 'IBS выход', 'PnL %'];
    const csvRows = [headers.join(',')];

    for (const t of trades) {
      const row = [
        t.symbol,
        t.status === 'open' ? 'Открыта' : 'Закрыта',
        t.entryDate || '',
        t.exitDate || '',
        t.entryPrice?.toFixed(2) || '',
        t.exitPrice?.toFixed(2) || '',
        t.entryIBS != null ? (t.entryIBS * 100).toFixed(1) : '',
        t.exitIBS != null ? (t.exitIBS * 100).toFixed(1) : '',
        t.pnlPercent?.toFixed(2) || ''
      ];
      csvRows.push(row.join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:]/g, '-').split('.')[0];
    a.href = url;
    a.download = `monitor-trades-${timestamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">История сделок мониторинга</h3>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {data?.lastUpdated ? `Обновлено: ${formatDateTime(data.lastUpdated)}` : 'Нет данных об обновлении'}
            {trades.length > 0 && <span className="ml-2">• {trades.length} сделок</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={!hasTrades}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            type="button"
            title="Экспортировать сделки в CSV (для Excel)"
          >
            <FileSpreadsheet className="h-4 w-4" />
            CSV
          </button>
          <button
            onClick={handleExportJSON}
            disabled={!hasTrades}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            type="button"
            title="Экспортировать сделки в JSON"
          >
            <Download className="h-4 w-4" />
            JSON
          </button>
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
      </div>

      {error && (
        <div className="border-b border-gray-100 bg-red-50 px-4 py-2 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Filter controls */}
      {trades.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <Filter className="h-3.5 w-3.5" />
            Фильтр:
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Статус:</span>
            <div className="inline-flex rounded-md shadow-sm">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2 py-1 text-xs rounded-l-md border ${statusFilter === 'all' ? 'bg-blue-100 border-blue-400 text-blue-700 dark:bg-blue-900/50 dark:border-blue-600 dark:text-blue-300' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'}`}
              >
                Все
              </button>
              <button
                onClick={() => setStatusFilter('open')}
                className={`px-2 py-1 text-xs border-t border-b ${statusFilter === 'open' ? 'bg-emerald-100 border-emerald-400 text-emerald-700 dark:bg-emerald-900/50 dark:border-emerald-600 dark:text-emerald-300' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'}`}
              >
                Открытые
              </button>
              <button
                onClick={() => setStatusFilter('closed')}
                className={`px-2 py-1 text-xs rounded-r-md border ${statusFilter === 'closed' ? 'bg-gray-200 border-gray-400 text-gray-700 dark:bg-gray-700 dark:border-gray-500 dark:text-gray-200' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'}`}
              >
                Закрытые
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Результат:</span>
            <div className="inline-flex rounded-md shadow-sm">
              <button
                onClick={() => setPnlFilter('all')}
                className={`px-2 py-1 text-xs rounded-l-md border ${pnlFilter === 'all' ? 'bg-blue-100 border-blue-400 text-blue-700 dark:bg-blue-900/50 dark:border-blue-600 dark:text-blue-300' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'}`}
              >
                Все
              </button>
              <button
                onClick={() => setPnlFilter('profit')}
                className={`px-2 py-1 text-xs border-t border-b ${pnlFilter === 'profit' ? 'bg-emerald-100 border-emerald-400 text-emerald-700 dark:bg-emerald-900/50 dark:border-emerald-600 dark:text-emerald-300' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'}`}
              >
                Прибыль
              </button>
              <button
                onClick={() => setPnlFilter('loss')}
                className={`px-2 py-1 text-xs rounded-r-md border ${pnlFilter === 'loss' ? 'bg-orange-100 border-orange-400 text-orange-700 dark:bg-orange-900/50 dark:border-orange-600 dark:text-orange-300' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'}`}
              >
                Убыток
              </button>
            </div>
          </div>
          {isFiltered && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Показано: {sorted.length} из {trades.length}
            </span>
          )}
        </div>
      )}

      <div className="px-4 py-4 space-y-4">
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
          {openTrade ? (
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Текущая позиция:{' '}
                <Link
                  to={`/results?ticker=${encodeURIComponent(openTrade.symbol)}`}
                  className="inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors underline decoration-dotted underline-offset-2"
                >
                  {openTrade.symbol}
                </Link>
              </div>
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
          <>
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

            {/* Кнопка "Показать все" */}
            {hasMoreRows && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                >
                  {showAll ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Скрыть (показано {sorted.length})
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Показать все ({sorted.length})
                    </>
                  )}
                </button>
              </div>
            )}

          </>
        )}
      </div>
    </div>
  );
}
