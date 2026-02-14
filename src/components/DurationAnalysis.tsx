import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import type { Trade } from '../types';

interface DurationAnalysisProps {
	trades: Trade[];
}

export function DurationAnalysis({ trades }: DurationAnalysisProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const [isDark, setIsDark] = useState<boolean>(() => typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false);

	useEffect(() => {
		const onTheme = (e: Event) => {
			const dark = !!((e as any)?.detail?.effectiveDark ?? document.documentElement.classList.contains('dark'));
			setIsDark(dark);
		};
		window.addEventListener('themechange', onTheme);
		return () => window.removeEventListener('themechange', onTheme);
	}, []);

	// Statistics Calculation
	const stats = useMemo(() => {
		if (!trades.length) return null;

		const durations = trades.map(t => t.duration ?? 0).sort((a, b) => a - b);
		const total = durations.reduce((acc, d) => acc + d, 0);
		const avg = total / durations.length;
		const max = durations[durations.length - 1];

		const mid = Math.floor(durations.length / 2);
		const median = durations.length % 2 !== 0 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2;

		// Distribution
		const distMap = new Map<number, number>();
		durations.forEach(d => {
			const val = Math.round(d);
			distMap.set(val, (distMap.get(val) || 0) + 1);
		});
		const distribution = Array.from(distMap.entries()).sort((a, b) => a[0] - b[0]);

		// Exit Reasons
		const reasonMap = new Map<string, { count: number; totalPnL: number }>();
		trades.forEach(t => {
			const reason = t.exitReason || 'Сигнал'; // Default to Signal if empty
			const entry = reasonMap.get(reason) || { count: 0, totalPnL: 0 };
			entry.count++;
			entry.totalPnL += (t.pnl ?? 0);
			reasonMap.set(reason, entry);
		});

		const reasons = Array.from(reasonMap.entries()).map(([reason, data]) => ({
			reason,
			count: data.count,
			avgPnL: data.totalPnL / data.count
		})).sort((a, b) => b.count - a.count);

		return { avg, max, median, distribution, reasons };
	}, [trades]);

	// Chart Rendering
	useEffect(() => {
		if (!containerRef.current || !trades.length) return;

		if (chartRef.current) {
			try { chartRef.current.remove(); } catch { /* ignore */ }
			chartRef.current = null;
		}

		const bg = isDark ? '#0b1220' : '#ffffff';
		const text = isDark ? '#e5e7eb' : '#1f2937';
		const grid = isDark ? '#1f2937' : '#eef2ff';
		const border = isDark ? '#374151' : '#e5e7eb';

		const chart = createChart(containerRef.current, {
			width: containerRef.current.clientWidth,
			height: containerRef.current.clientHeight || 400,
			layout: { background: { color: bg }, textColor: text },
			grid: { vertLines: { color: grid }, horzLines: { color: grid } },
			rightPriceScale: { borderColor: border },
			timeScale: { borderColor: border, timeVisible: true, secondsVisible: false },
			crosshair: { mode: 1 },
		});
		chartRef.current = chart;

		const series: ISeriesApi<'Histogram'> = chart.addHistogramSeries({
			color: isDark ? 'rgba(59,130,246,0.7)' : 'rgba(59,130,246,0.9)',
			base: 0,
			priceFormat: { type: 'price', precision: 0, minMove: 1 },
		});

		const green = isDark ? 'rgba(16,185,129,0.75)' : 'rgba(16,185,129,0.9)';
		const red = isDark ? 'rgba(239,68,68,0.75)' : 'rgba(239,68,68,0.9)';

		const data = trades.map((t) => ({
			time: Math.floor(new Date(t.exitDate).getTime() / 1000) as UTCTimestamp,
			value: Math.round(t.duration ?? 0),
			color: (t.pnl ?? 0) >= 0 ? green : red,
		}));

		// Sort by time just in case, though usually trades come sorted
		data.sort((a, b) => (a.time as number) - (b.time as number));

		series.setData(data);

		if (stats) {
			try {
				series.createPriceLine({
					price: stats.avg,
					color: '#9CA3AF',
					lineWidth: 1,
					lineStyle: 2,
					axisLabelVisible: true,
					title: 'Среднее'
				});
			} catch { /* ignore */ }
		}

		const handleResize = () => {
			if (!containerRef.current || !chart) return;
			chart.applyOptions({ width: containerRef.current.clientWidth, height: Math.max(containerRef.current.clientHeight || 0, 360) });
		};
		window.addEventListener('resize', handleResize);
		return () => {
			window.removeEventListener('resize', handleResize);
			try { chart.remove(); } catch { /* ignore */ }
		};
	}, [trades, isDark, stats]);

	if (!trades.length || !stats) {
		return <div className="text-gray-500 p-4 text-center">Нет данных по сделкам</div>;
	}

	return (
		<div className="w-full h-full space-y-6">
			{/* Top Stats Grid */}
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
				<div className="bg-gray-50 px-4 py-3 rounded-lg border dark:bg-gray-800 dark:border-gray-700 flex flex-col">
					<span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Средняя длительность</span>
					<span className="text-xl font-semibold text-gray-900 dark:text-gray-100">{stats.avg.toFixed(1)} дн.</span>
				</div>
				<div className="bg-gray-50 px-4 py-3 rounded-lg border dark:bg-gray-800 dark:border-gray-700 flex flex-col">
					<span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Медианная длительность</span>
					<span className="text-xl font-semibold text-gray-900 dark:text-gray-100">{stats.median.toFixed(0)} дн.</span>
				</div>
				<div className="bg-gray-50 px-4 py-3 rounded-lg border dark:bg-gray-800 dark:border-gray-700 flex flex-col">
					<span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Максимальная длительность</span>
					<span className="text-xl font-semibold text-gray-900 dark:text-gray-100">{stats.max.toFixed(0)} дн.</span>
				</div>
			</div>

			{/* Chart Legend */}
			<div className="flex items-center gap-4 text-xs justify-end">
				<span className="inline-flex items-center gap-2">
					<span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" /> Прибыль
				</span>
				<span className="inline-flex items-center gap-2">
					<span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> Убыток
				</span>
			</div>

			{/* Chart */}
			<div ref={containerRef} className="w-full h-[560px] min-h-0 overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800" />

			{/* Bottom Analysis Tables */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Duration Distribution */}
				<div>
					<div className="text-sm font-semibold mb-3 text-gray-800 dark:text-gray-200 flex items-center gap-2">
						<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
						Распределение по дням
					</div>
					<div className="w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
						<table className="w-full text-sm">
							<thead className="bg-gray-50 dark:bg-gray-800/50">
								<tr>
									<th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Дней удержания</th>
									<th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Количество</th>
									<th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">% от общего</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-100 dark:divide-gray-800">
								{stats.distribution.slice(0, 10).map(([days, count]) => (
									<tr key={days} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
										<td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">{days}</td>
										<td className="px-4 py-2.5 text-right text-gray-900 dark:text-gray-100">{count}</td>
										<td className="px-4 py-2.5 text-right text-gray-500 dark:text-gray-400">{((count / trades.length) * 100).toFixed(1)}%</td>
									</tr>
								))}
								{stats.distribution.length > 10 && (
									<tr>
										<td colSpan={3} className="px-4 py-2 text-center text-xs text-gray-500 italic">
											...и еще {stats.distribution.length - 10} строк
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>

				{/* Exit Reason Analysis */}
				<div>
					<div className="text-sm font-semibold mb-3 text-gray-800 dark:text-gray-200 flex items-center gap-2">
						<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
						Причины выхода
					</div>
					<div className="w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
						<table className="w-full text-sm">
							<thead className="bg-gray-50 dark:bg-gray-800/50">
								<tr>
									<th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Причина</th>
									<th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Сделок</th>
									<th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Ср. PnL</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-100 dark:divide-gray-800">
								{stats.reasons.map((r) => (
									<tr key={r.reason} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
										<td className="px-4 py-2.5 text-gray-900 dark:text-gray-100 capitalize">
											{r.reason === 'option_expired' ? 'Экспирация опциона' :
											 r.reason === 'max_hold' ? 'Макс. удержание' :
											 r.reason === 'max_hold_days' ? 'Макс. удержание' :
											 r.reason === 'ibs_signal' ? 'Сигнал стратегии' :
											 r.reason === 'end_of_data' ? 'Конец данных' :
											 r.reason}
										</td>
										<td className="px-4 py-2.5 text-right text-gray-900 dark:text-gray-100">{r.count}</td>
										<td className={`px-4 py-2.5 text-right font-medium ${r.avgPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
											${r.avgPnL.toFixed(2)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>
	);
}
