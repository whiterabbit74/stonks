import React, { useMemo } from 'react';
import type { Trade } from '../types';

interface TradesTableProps {
	trades: Trade[];
}

export const TradesTable = React.memo(function TradesTable({ trades }: TradesTableProps) {
        const showTicker = useMemo(() => {
                return trades && trades.some(t => typeof (t.context as any)?.ticker === 'string' && (t.context as any)?.ticker);
        }, [trades]);

        const reversedTrades = useMemo(() => {
                return [...trades].reverse();
        }, [trades]);

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
                                        {reversedTrades.map((t, i) => {
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
							<tr key={t.id || i} className="border-b last:border-b-0 dark:border-gray-800">
								<td className="px-3 py-2 text-gray-500">{i + 1}</td>
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
		</div>
	);
});