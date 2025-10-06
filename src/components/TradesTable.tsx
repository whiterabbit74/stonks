import React, { useEffect, useMemo, useState } from 'react';
import type { Trade } from '../types';

interface TradesTableProps {
	trades: Trade[];
}

export const TradesTable = React.memo(function TradesTable({ trades }: TradesTableProps) {
        const PAGE_SIZE = 50;
        const [page, setPage] = useState(1);

        const showTicker = useMemo(() => {
                return trades && trades.some(t => typeof (t.context as any)?.ticker === 'string' && (t.context as any)?.ticker);
        }, [trades]);

        const reversedTrades = useMemo(() => {
                return [...trades].reverse();
        }, [trades]);

        const totalPages = useMemo(() => {
                if (!reversedTrades || reversedTrades.length === 0) {
                        return 1;
                }

                return Math.max(1, Math.ceil(reversedTrades.length / PAGE_SIZE));
        }, [reversedTrades]);

        useEffect(() => {
                setPage(1);
        }, [trades]);

        useEffect(() => {
                if (page > totalPages) {
                        setPage(totalPages);
                }
        }, [page, totalPages]);

        const paginatedTrades = useMemo(() => {
                const start = (page - 1) * PAGE_SIZE;
                const end = start + PAGE_SIZE;
                return reversedTrades.slice(start, end);
        }, [page, reversedTrades]);

        if (!trades || trades.length === 0) {
                return (
                        <div className="text-sm text-gray-500">Нет сделок для отображения</div>
                );
	}

        const fmtDate = (d: Date | string | null | undefined) => {
                if (!d) {
                        return '—';
                }

                try {
                        const date = typeof d === 'string' ? new Date(d) : d;
                        return new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC' }).format(date);
                } catch {
                        return String(d);
                }
        };
	return (
		<div className="w-full overflow-auto">
			<table className="min-w-full text-sm">
				<thead className="sticky top-0 bg-gray-100 border-b dark:bg-gray-800 dark:border-gray-700">
					<tr>
						<th className="text-left px-3 py-2 font-semibold">#</th>
						{showTicker && <th className="text-left px-3 py-2 font-semibold">Тикер</th>}
						<th className="text-left px-3 py-2 font-semibold">Дата сделки</th>
						<th className="text-right px-3 py-2 font-semibold">Цена входа</th>
						<th className="text-right px-3 py-2 font-semibold">Цена выхода</th>
						<th className="text-right px-3 py-2 font-semibold">Кол-во</th>
						<th className="text-right px-3 py-2 font-semibold">Вложено, $</th>
						<th className="text-right px-3 py-2 font-semibold">PnL, $</th>
						<th className="text-right px-3 py-2 font-semibold">PnL, %</th>
						<th className="text-right px-3 py-2 font-semibold">Депозит, $</th>
						<th className="text-right px-3 py-2 font-semibold">Дней</th>
						<th className="text-left px-3 py-2 font-semibold">Причина выхода</th>
					</tr>
				</thead>
				<tbody>
                                        {paginatedTrades.map((t, i) => {
                                                const positive = (t.pnl ?? 0) >= 0;
                                                // Получаем IBS значения из контекста
                                                const entryIBS = t.context?.indicatorValues?.IBS;
                                                const exitIBS = t.context?.indicatorValues?.exitIBS;
						
						// Проверяем проблемы с IBS для цветовой индикации
						const hasEntryProblem = typeof entryIBS === 'number' && entryIBS > 0.1;
						const hasExitProblem = typeof exitIBS === 'number' && exitIBS < 0.75;
						const hasIBSProblem = hasEntryProblem || hasExitProblem;
						
						// Форматируем причину выхода
						let formattedExitReason = t.exitReason || '-';
						if (t.exitReason === 'ibs_signal' && typeof exitIBS === 'number') {
							formattedExitReason = `IBS ${(exitIBS * 100).toFixed(1)}%`;
						}
						
						return (
                                                        <tr key={t.id || `${t.entryDate}-${t.exitDate}-${i}`} className="border-b last:border-b-0 dark:border-gray-800">
                                                                <td className="px-3 py-2 text-gray-500">{(page - 1) * PAGE_SIZE + i + 1}</td>
								{showTicker && <td className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-200">{(t.context as any)?.ticker || ''}</td>}
								<td className={`px-3 py-2 whitespace-nowrap ${hasIBSProblem ? 'bg-orange-50 dark:bg-orange-950/20' : ''}`}>
									<div>{fmtDate(t.entryDate)} - {fmtDate(t.exitDate)}</div>
									<div className="text-xs text-gray-500">
										{typeof entryIBS === 'number' ? `${(entryIBS * 100).toFixed(1)}%` : '—'} - {typeof exitIBS === 'number' ? `${(exitIBS * 100).toFixed(1)}%` : '—'}
									</div>
								</td>
								<td className="px-3 py-2 text-right font-mono">{t.entryPrice.toFixed(2)}</td>
								<td className="px-3 py-2 text-right font-mono">{t.exitPrice.toFixed(2)}</td>
								<td className="px-3 py-2 text-right">{t.quantity.toLocaleString()}</td>
								<td className="px-3 py-2 text-right font-mono text-blue-600 dark:text-blue-400">
					{typeof t.context?.initialInvestment === 'number' ? t.context.initialInvestment.toFixed(2) : (t.quantity * t.entryPrice).toFixed(2)}
					{typeof (t.context as any)?.leverage === 'number' && (t.context as any)?.leverage > 1 && (
						<div className="text-xs text-gray-500">{(t.context as any).leverage}:1</div>
					)}
				</td>
								<td className={`px-3 py-2 text-right font-mono ${positive ? 'text-emerald-600 dark:text-emerald-300' : 'text-orange-600 dark:text-orange-300'}`}>{(t.pnl ?? 0).toFixed(2)}</td>
								<td className={`px-3 py-2 text-right font-mono ${positive ? 'text-emerald-600 dark:text-emerald-300' : 'text-orange-600 dark:text-orange-300'}`}>{(t.pnlPercent ?? 0).toFixed(2)}%</td>
								<td className="px-3 py-2 text-right font-mono">{typeof t.context?.currentCapitalAfterExit === 'number' ? t.context.currentCapitalAfterExit.toFixed(2) : '—'}</td>
								<td className="px-3 py-2 text-right">{t.duration ?? 0}</td>
								<td className="px-3 py-2 whitespace-nowrap">{formattedExitReason}</td>
							</tr>
						);
                                        })}
                                </tbody>
                        </table>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mt-4 text-sm text-gray-600 dark:text-gray-300">
                                <div>
                                        Показаны {(page - 1) * PAGE_SIZE + 1}–
                                        {Math.min(page * PAGE_SIZE, reversedTrades.length)} из {reversedTrades.length} сделок
                                </div>
                                <div className="flex items-center gap-3">
                                        <button
                                                type="button"
                                                className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800"
                                                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                                                disabled={page <= 1}
                                        >
                                                Назад
                                        </button>
                                        <span>
                                                Страница {page} из {totalPages}
                                        </span>
                                        <button
                                                type="button"
                                                className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800"
                                                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                                                disabled={page >= totalPages}
                                        >
                                                Вперёд
                                        </button>
                                </div>
                        </div>
                </div>
        );
});
