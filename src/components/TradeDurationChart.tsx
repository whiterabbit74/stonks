import { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import type { Trade } from '../types';

interface TradeDurationChartProps {
	trades: Trade[];
}

export function TradeDurationChart({ trades }: TradeDurationChartProps) {
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

	useEffect(() => {
		if (!containerRef.current || !trades.length) return;

		if (chartRef.current) {
			try { chartRef.current.remove(); } catch {
				// Ignore chart removal errors
			}
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
		series.setData(data);

		const avg = data.reduce((s, d) => s + (d.value || 0), 0) / Math.max(1, data.length);
		try { series.createPriceLine({ price: avg, color: '#9CA3AF', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Среднее' }); } catch {
			// Ignore price line creation errors
		}

		const handleResize = () => {
			if (!containerRef.current || !chart) return;
			chart.applyOptions({ width: containerRef.current.clientWidth, height: Math.max(containerRef.current.clientHeight || 0, 360) });
		};
		window.addEventListener('resize', handleResize);
		return () => {
			window.removeEventListener('resize', handleResize);
			try { chart.remove(); } catch {
				// Ignore chart cleanup errors
			}
		};
	}, [trades, isDark]);

	if (!trades.length) {
		return <div className="text-gray-500">Нет данных по сделкам</div>;
	}

	const avgDuration = trades.reduce((s, t) => s + (t.duration ?? 0), 0) / trades.length;
	const maxDuration = trades.reduce((m, t) => Math.max(m, t.duration ?? 0), 0);
	const durationCounts = (() => {
		const map = new Map<number, number>();
		for (const t of trades) {
			const d = Math.round(t.duration ?? 0);
			map.set(d, (map.get(d) || 0) + 1);
		}
		return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
	})();

	return (
		<div className="w-full h-full">
			<div className="flex flex-wrap items-center gap-4 mb-4 text-sm">
				<div className="bg-gray-50 px-3 py-2 rounded border dark:bg-gray-800 dark:border-gray-700">
					<span className="text-gray-700 dark:text-gray-200">Средняя длительность: {avgDuration.toFixed(1)} дн.</span>
				</div>
				<div className="bg-gray-50 px-3 py-2 rounded border dark:bg-gray-800 dark:border-gray-700">
					<span className="text-gray-700 dark:text-gray-200">Максимальная длительность: {maxDuration.toFixed(0)} дн.</span>
				</div>
				<div className="flex items-center gap-2 ml-auto">
					<span className="inline-flex items-center gap-2 text-xs">
						<span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" /> прибыль
					</span>
					<span className="inline-flex items-center gap-2 text-xs">
						<span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> убыток
					</span>
				</div>
			</div>
			<div ref={containerRef} className="w-full h-[600px] min-h-0 overflow-hidden" />
			<div className="mt-6">
				<div className="text-sm font-medium mb-2 text-gray-800 dark:text-gray-200">Статистика закрытия сделок по длительности</div>
				<div className="w-full overflow-auto">
					<table className="min-w-[360px] text-sm">
						<thead className="bg-gray-100 dark:bg-gray-800">
							<tr>
								<th className="text-left px-3 py-2">Дней удержания</th>
								<th className="text-right px-3 py-2">Закрыто сделок</th>
							</tr>
						</thead>
						<tbody>
							{durationCounts.map(([days, count]) => (
								<tr key={days} className="border-b last:border-b-0 dark:border-gray-800">
									<td className="px-3 py-2">{days}</td>
									<td className="px-3 py-2 text-right">{count}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}