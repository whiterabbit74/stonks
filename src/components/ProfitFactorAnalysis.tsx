import { useEffect, useRef, useState, useMemo } from 'react';
import { HistogramSeries, LineSeries, createChart, type IChartApi, type ISeriesApi } from 'lightweight-charts';
import type { Trade } from '../types';
import { calculateTradeStats } from '../lib/trade-utils';
import { formatMoney } from '../lib/formatters';
import { toChartTimestamp } from '../lib/date-utils';

interface ProfitFactorAnalysisProps {
  trades: Trade[];
}

function centerFewPointsOnTimeScale(chart: IChartApi, pointsCount: number) {
  if (!pointsCount) return;
  chart.timeScale().fitContent();

  if (pointsCount >= 40) return;

  const minFillRatio = 0.7;
  const logicalSpan = Math.max(pointsCount / minFillRatio, pointsCount + 2);
  const padding = Math.max(0, (logicalSpan - pointsCount) / 2);
  chart.timeScale().setVisibleLogicalRange({
    from: -padding,
    to: pointsCount - 1 + padding,
  });
}

export function ProfitFactorAnalysis({ trades }: ProfitFactorAnalysisProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false);

  // Derived Stats
  const stats = useMemo(() => calculateTradeStats(trades), [trades]);
  const avgPnlPercent = stats.totalTrades > 0
    ? (trades.reduce((sum, t) => sum + (t.pnlPercent ?? 0), 0) / stats.totalTrades)
    : 0;

  useEffect(() => {
    const onTheme = (e: Event) => {
      const customEvent = e as CustomEvent<{ mode: string; effectiveDark: boolean }>;
      const dark = !!(customEvent?.detail?.effectiveDark ?? document.documentElement.classList.contains('dark'));
      setIsDark(dark);
    };
    window.addEventListener('themechange', onTheme);
    return () => window.removeEventListener('themechange', onTheme);
  }, []);

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
      autoSize: true,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 400,
      layout: { background: { color: bg }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
    });
    chartRef.current = chart;

    const series: ISeriesApi<'Histogram'> = chart.addSeries(HistogramSeries, {
      color: isDark ? 'rgba(156,163,175,0.5)' : 'rgba(107,114,128,0.5)',
      base: 0,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });

    const data = trades.map((t) => ({
      time: toChartTimestamp(t.exitDate),
      value: t.pnlPercent ?? 0,
      color: (t.pnlPercent ?? 0) >= 0
        ? (isDark ? 'rgba(16,185,129,0.7)' : 'rgba(16,185,129,0.9)')
        : (isDark ? 'rgba(239,68,68,0.7)' : 'rgba(239,68,68,0.9)'),
    }));
    series.setData(data);

    const zeroLine = chart.addSeries(LineSeries, {
      color: isDark ? '#9ca3af' : '#9ca3af',
      lineWidth: 1,
      lineStyle: 2,
      title: '0%'
    });
    zeroLine.setData(data.map(d => ({ time: d.time, value: 0 })));
    centerFewPointsOnTimeScale(chart, data.length);
    return () => {
      try { chart.remove(); } catch { /* ignore */ }
    };
  }, [trades, isDark]);

  if (!trades.length) {
    return <div className="text-gray-500 text-center py-8">Нет данных по сделкам</div>;
  }

  return (
    <div className="w-full h-full flex flex-col space-y-4">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="Profit Factor"
          value={stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
        />
        <StatCard
          label="Win Rate"
          value={`${stats.winRate.toFixed(2)}%`}
        />
        <StatCard
          label="Средний PnL"
          value={`${avgPnlPercent.toFixed(2)}%`}
          colorClass={avgPnlPercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
        />
        <StatCard
          label="Gross Profit"
          value={formatMoney(stats.grossProfit)}
          colorClass="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          label="Gross Loss"
          value={formatMoney(stats.grossLoss)}
          colorClass="text-rose-600 dark:text-rose-400"
        />
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-[420px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden relative">
         <div ref={containerRef} className="absolute inset-0" />
      </div>
    </div>
  );
}

function StatCard({ label, value, colorClass = 'text-gray-900 dark:text-gray-100' }: { label: string, value: string, colorClass?: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${colorClass}`}>{value}</div>
    </div>
  );
}
