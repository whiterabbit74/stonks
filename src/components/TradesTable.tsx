import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { Trade } from '../types';

interface TradesTableProps {
	trades: Trade[];
	exportFileNamePrefix?: string;
	showSummary?: boolean;
	showExport?: boolean;
}

// Optimization: Reuse formatter instance to avoid expensive re-creation in render loops
const RUSSIAN_DATE_FMT = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC' });

export const TradesTable = React.memo(function TradesTable({
	trades,
	exportFileNamePrefix,
	showSummary = true,
	showExport = true
}: TradesTableProps) {
	const PAGE_SIZE = 50;
	const [page, setPage] = useState(1);

	const showTicker = useMemo(() => {
		return trades && trades.some(t => typeof (t.context as any)?.ticker === 'string' && (t.context as any)?.ticker);
	}, [trades]);

	const totalPages = useMemo(() => {
		if (!trades || trades.length === 0) {
			return 1;
		}

		return Math.max(1, Math.ceil(trades.length / PAGE_SIZE));
	}, [trades]);

	useEffect(() => {
		setPage(1);
	}, [trades]);

	useEffect(() => {
		if (page > totalPages) {
			setPage(totalPages);
		}
	}, [page, totalPages]);

	const paginatedTrades = useMemo(() => {
		// Optimization: Avoid copying and reversing the entire trades array (which can be large).
		// Instead, calculate the indices in the original array that correspond to the current page
		// in reverse order, slice that small segment, and reverse it.
		// reversedTrades[start...end] corresponds to trades[(L-end)...(L-start)] reversed.

		const len = trades ? trades.length : 0;
		if (len === 0) return [];

		const start = (page - 1) * PAGE_SIZE;
		const end = start + PAGE_SIZE;

		// Indices in reversed array: start to end
		// Indices in original array: (len - end) to (len - start)

		const sliceStart = Math.max(0, len - end);
		const sliceEnd = Math.max(0, len - start);

		return trades.slice(sliceStart, sliceEnd).reverse();
	}, [page, trades]);

	const resolvedExportFileName = useMemo(() => {
		const dateSuffix = new Date().toISOString().slice(0, 10);
		const base = (exportFileNamePrefix ?? 'trades-export').trim().replace(/\s+/g, '-').replace(/\.json$/i, '');
		return `${base}-${dateSuffix}.json`;
	}, [exportFileNamePrefix]);

	const handleExport = useCallback(() => {
		if (!trades || trades.length === 0) {
			return;
		}

		try {
			const dataStr = JSON.stringify(trades, null, 2);
			const blob = new Blob([dataStr], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = resolvedExportFileName;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Не удалось экспортировать сделки в JSON', err);
		}
	}, [resolvedExportFileName, trades]);

	const pageStart = useMemo(() => {
		return (!trades || trades.length === 0) ? 0 : (page - 1) * PAGE_SIZE + 1;
	}, [page, trades]);

	const pageEnd = useMemo(() => {
		return Math.min(page * PAGE_SIZE, trades ? trades.length : 0);
	}, [page, trades]);

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
			return RUSSIAN_DATE_FMT.format(date);
		} catch {
			return String(d);
		}
	};
	return (
		<div className="w-full overflow-auto">
			{showSummary && (
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4 text-sm text-gray-600 dark:text-gray-300">
					<div>Всего сделок: {trades.length}</div>
					{showExport && (
						<button
							type="button"
							onClick={handleExport}
							className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
							disabled={!trades.length}
						>
							<Download className="w-4 h-4" />
							Скачать JSON
						</button>
					)}
				</div>
			)}
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

                        // Special handling for Option Trades
                        const isOptionTrade = (t as any).optionType === 'call';
                        const entryPriceDisplay = isOptionTrade ? (t as any).optionEntryPrice : t.entryPrice;
                        const exitPriceDisplay = isOptionTrade ? (t as any).optionExitPrice : t.exitPrice;
                        const quantityDisplay = isOptionTrade ? (t as any).contracts : t.quantity;
                        const investedDisplay = isOptionTrade
                             ? (t as any).contracts * (t as any).optionEntryPrice
                             : (typeof t.context?.initialInvestment === 'number' ? t.context.initialInvestment : t.quantity * t.entryPrice);

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
								<td className="px-3 py-2 text-right font-mono">{entryPriceDisplay?.toFixed(2)}</td>
								<td className="px-3 py-2 text-right font-mono">{exitPriceDisplay?.toFixed(2)}</td>
								<td className="px-3 py-2 text-right">{quantityDisplay?.toLocaleString()}</td>
								<td className="px-3 py-2 text-right font-mono text-blue-600 dark:text-blue-400">
									{investedDisplay?.toFixed(2)}
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
					Показаны {pageStart}–{pageEnd} из {trades.length} сделок
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800"
						onClick={() => setPage(1)}
						disabled={page <= 1}
					>
						В начало
					</button>
					<button
						type="button"
						className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800"
						onClick={() => setPage(prev => Math.max(1, prev - 1))}
						disabled={page <= 1}
					>
						Назад
					</button>
					<span className="px-2 py-1">
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
					<button
						type="button"
						className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800"
						onClick={() => setPage(totalPages)}
						disabled={page >= totalPages}
					>
						В конец
					</button>
				</div>
			</div>
		</div>
	);
});
