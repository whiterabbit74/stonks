import { useEffect, useMemo, useRef } from 'react';
import { AreaSeries, LineSeries, createChart } from 'lightweight-charts';
import type { UTCTimestamp } from 'lightweight-charts';
import type { EquityPoint, Trade } from '../types';
import { toChartTimestamp } from '../lib/date-utils';
import { useIsDark } from '../hooks/useIsDark';
import { centerFewPointsOnTimeScale } from '../lib/chart-utils';
import { ChartLegend } from './ChartLegend';

interface TradeDrawdownChartProps {
  trades: Trade[];
  initialCapital: number;
  equity?: EquityPoint[];
  comparisonEquity?: EquityPoint[];
  primaryLabel?: string;
  comparisonLabel?: string;
}

interface DrawdownDataPoint {
  time: UTCTimestamp;
  value: number;
  drawdown: number;
}

function prepareDailyDrawdownData(equity: EquityPoint[]): DrawdownDataPoint[] {
  const sorted = equity
    .map((point) => {
      try {
        const value = Number(point.value);
        if (!Number.isFinite(value)) return null;
        return {
          time: toChartTimestamp(point.date),
          equity: value,
        };
      } catch {
        return null;
      }
    })
    .filter((point): point is { time: UTCTimestamp; equity: number } => point !== null)
    .sort((a, b) => Number(a.time) - Number(b.time));

  let peak = -Infinity;

  return sorted.map((point) => {
    peak = Math.max(peak, point.equity);
    const drawdown = peak > 0 ? ((peak - point.equity) / peak) * 100 : 0;
    return {
      time: point.time,
      value: -drawdown,
      drawdown,
    };
  });
}

function prepareTradeDrawdownData(trades: Trade[], initialCapital: number): DrawdownDataPoint[] {
  let runningCapital = initialCapital;
  let peakCapital = initialCapital;

  return trades.map((trade) => {
    runningCapital += trade.pnl;
    peakCapital = Math.max(peakCapital, runningCapital);
    const drawdown = peakCapital > 0 ? ((peakCapital - runningCapital) / peakCapital) * 100 : 0;
    return {
      time: toChartTimestamp(trade.exitDate),
      value: -drawdown,
      drawdown,
    };
  });
}

function calculateDrawdownStats(points: DrawdownDataPoint[]): { maxDrawdown: number; drawdownDays: number; frequency: number } {
  if (!points.length) return { maxDrawdown: 0, drawdownDays: 0, frequency: 0 };
  const maxDrawdown = points.reduce((max, point) => Math.max(max, point.drawdown), 0);
  const drawdownDays = points.filter((point) => point.drawdown > 0).length;
  return {
    maxDrawdown,
    drawdownDays,
    frequency: (drawdownDays / points.length) * 100,
  };
}

export function TradeDrawdownChart({
  trades,
  initialCapital,
  equity = [],
  comparisonEquity,
  primaryLabel = 'Основной режим',
  comparisonLabel = 'Сравнение',
}: TradeDrawdownChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const isDark = useIsDark();
  const primaryData = useMemo(
    () => equity.length > 0
      ? prepareDailyDrawdownData(equity)
      : prepareTradeDrawdownData(trades, initialCapital),
    [equity, trades, initialCapital]
  );
  const comparisonData = useMemo(
    () => comparisonEquity?.length ? prepareDailyDrawdownData(comparisonEquity) : [],
    [comparisonEquity]
  );
  const stats = useMemo(() => calculateDrawdownStats(primaryData), [primaryData]);
  const pointLabel = equity.length > 0 ? 'дней' : 'сделок';

  useEffect(() => {
    if (!chartContainerRef.current || !primaryData.length) return;

    try {
      const bg = isDark ? '#0b1220' : '#ffffff';
      const text = isDark ? '#e5e7eb' : '#333';
      const grid = isDark ? '#1f2937' : '#f0f0f0';
      const border = isDark ? '#374151' : '#cccccc';

      // Create new chart
      const chart = createChart(chartContainerRef.current, {
        autoSize: true,
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight || 400,
        layout: {
          background: { color: bg },
          textColor: text,
        },
        grid: {
          vertLines: { color: grid },
          horzLines: { color: grid },
        },
        crosshair: {
          mode: 1,
        },
        rightPriceScale: {
          borderColor: border,
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
        },
        timeScale: {
          borderColor: border,
          timeVisible: true,
          secondsVisible: false,
        },
        localization: {
          priceFormatter: (value: number) => `${value.toFixed(1)}%`,
        },
      });

      chartRef.current = chart;

      const drawdownSeries = chart.addSeries(AreaSeries, {
        topColor: isDark ? 'rgba(248, 113, 113, 0.35)' : 'rgba(244, 67, 54, 0.4)',
        bottomColor: isDark ? 'rgba(248, 113, 113, 0.08)' : 'rgba(244, 67, 54, 0.1)',
        lineColor: isDark ? '#f87171' : '#F44336',
        lineWidth: 2,
        priceLineVisible: false,
      });

      drawdownSeries.setData(primaryData.map(d => ({
        time: d.time,
        value: d.value
      })));

      if (comparisonData.length > 0) {
        const comparisonSeries = chart.addSeries(LineSeries, {
          color: '#F97316',
          lineWidth: 2,
          priceLineVisible: false,
        });

        comparisonSeries.setData(comparisonData.map(d => ({
          time: d.time,
          value: d.value,
        })));
      }

      const zeroLineSeries = chart.addSeries(LineSeries, {
        color: isDark ? '#9ca3af' : '#666666',
        lineWidth: 1,
        lineStyle: 2, // Dashed line
        priceLineVisible: false,
      });

      const zeroLineData = primaryData.map(d => ({
        time: d.time,
        value: 0,
      }));

      zeroLineSeries.setData(zeroLineData);
      centerFewPointsOnTimeScale(chart, primaryData.length);

      return () => {
        if (chart) {
          try {
            chart.remove();
          } catch (e) {
            console.warn('Error removing chart on cleanup:', e);
          }
        }
      };
    } catch (error) {
      console.error('Error creating trade drawdown chart:', error);
      return;
    }
  }, [primaryData, comparisonData, isDark]);

  if (!primaryData.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Нет данных для анализа просадки
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="bg-red-50 px-3 py-2 rounded dark:bg-red-950/30 dark:text-red-300">
          <span className="text-red-600 font-medium dark:text-red-300">Макс. дневная просадка: {stats.maxDrawdown.toFixed(2)}%</span>
        </div>
        <div className="bg-gray-50 px-3 py-2 rounded dark:bg-gray-800 dark:text-gray-200">
          <span className="text-gray-600 dark:text-gray-200">Точек с просадкой: {stats.drawdownDays}/{primaryData.length} {pointLabel}</span>
        </div>
        <div className="bg-gray-50 px-3 py-2 rounded dark:bg-gray-800 dark:text-gray-200">
          <span className="text-gray-600 dark:text-gray-200">Частота просадок: {stats.frequency.toFixed(1)}%</span>
        </div>
      </div>

      <div ref={chartContainerRef} className="w-full h-[360px] sm:h-[460px] md:h-[560px] min-h-0 overflow-hidden border rounded-lg" />
      <ChartLegend
        items={[
          { label: `Просадка: ${primaryLabel}`, color: '#F44336' },
          ...(comparisonData.length ? [{ label: `Просадка: ${comparisonLabel}`, color: '#F97316' }] : []),
          { label: 'Новый максимум капитала', color: isDark ? '#9ca3af' : '#666666' },
        ]}
      />
    </div>
  );
}
