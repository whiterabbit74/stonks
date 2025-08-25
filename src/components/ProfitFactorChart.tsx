import { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import type { Trade } from '../types';

interface ProfitFactorChartProps {
	trades: Trade[];
}

export function ProfitFactorChart({ trades }: ProfitFactorChartProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const [isDark, setIsDark] = useState<boolean>(() => typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false);

	useEffect(() => {
		const onTheme = (e: any) => {
			const dark = !!(e?.detail?.effectiveDark ?? document.documentElement.classList.contains('dark'));
			setIsDark(dark);
		};
		window.addEventListener('themechange', onTheme);
		return () => window.removeEventListener('themechange', onTheme);
	}, []);

	useEffect(() => {
		if (!containerRef.current || !trades.length) return;

		if (chartRef.current) {
			try { chartRef.current.remove(); } catch {}
			chartRef.current = null;
		}

		const bg = isDark ? '#0b1220' : '#ffffff';
		const text = isDark ? '#e5e7eb' : '#1f2937';
		const grid = isDark ? '#1f2937' : '#eef2ff';
		const border = isDark ? '#374151' : '#e5e7eb';

		const chart = createChart(containerRef.current, {
			width: containerRef.current.clientWidth,
			height: Math.max(containerRef.current.clientHeight || 0, 360),
			layout: { background: { color: bg }, textColor: text },
			grid: { vertLines: { color: grid }, horzLines: { color: grid } },
			rightPriceScale: { borderColor: border },
			timeScale: { borderColor: border, timeVisible: true, secondsVisible: false },
			crosshair: { mode: 1 },
		});
		chartRef.current = chart;

		const series: ISeriesApi<'Histogram'> = chart.addHistogramSeries({
			color: isDark ? 'rgba(156,163,175,0.5)' : 'rgba(107,114,128,0.5)',
			base: 0,
			priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
		});

		const data = trades.map((t) => ({
			time: Math.floor(t.exitDate.getTime() / 1000) as UTCTimestamp,
			value: t.pnlPercent ?? 0,
			color: (t.pnlPercent ?? 0) >= 0 ? (isDark ? 'rgba(16,185,129,0.7)' : 'rgba(16,185,129,0.9)') : (isDark ? 'rgba(239,68,68,0.7)' : 'rgba(239,68,68,0.9)'),
		}));
		series.setData(data);

		const zeroLine = chart.addLineSeries({ color: isDark ? '#9ca3af' : '#9ca3af', lineWidth: 1, lineStyle: 2, title: '0%' });
		zeroLine.setData(data.map(d => ({ time: d.time, value: 0 })));

		const handleResize = () => {
			if (!containerRef.current || !chart) return;
			chart.applyOptions({ width: containerRef.current.clientWidth, height: Math.max(containerRef.current.clientHeight || 0, 360) });
		};
		window.addEventListener('resize', handleResize);
		return () => {
			window.removeEventListener('resize', handleResize);
			try { chart.remove(); } catch {}
		};
	}, [trades, isDark]);

	if (!trades.length) {
		return <div className="text-gray-500">Нет данных по сделкам</div>;
	}

	// PF summary computed by $ PnL values
	const grossProfit = trades.filter(t => (t.pnl ?? 0) > 0).reduce((s, t) => s + (t.pnl ?? 0), 0);
	const grossLoss = Math.abs(trades.filter(t => (t.pnl ?? 0) < 0).reduce((s, t) => s + (t.pnl ?? 0), 0));
	const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : Infinity;

	return (
		<div className="w-full h-full">
			<div className="flex flex-wrap gap-4 mb-4 text-sm">
				<div className="bg-gray-50 px-3 py-2 rounded border dark:bg-gray-800 dark:border-gray-700">
					<span className="text-gray-700 dark:text-gray-200">Profit Factor: {Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : '∞'}</span>
				</div>
				<div className="bg-gray-50 px-3 py-2 rounded border dark:bg-gray-800 dark:border-gray-700">
					<span className="text-gray-700 dark:text-gray-200">Средний PnL, %: {(trades.reduce((s, t) => s + (t.pnlPercent ?? 0), 0) / trades.length).toFixed(2)}%</span>
				</div>
			</div>
			<div ref={containerRef} className="w-full h-[600px] min-h-0 overflow-hidden" />
		</div>
	);
}