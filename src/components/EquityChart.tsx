import { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import type { EquityPoint } from '../types';

interface EquityChartProps {
  equity: EquityPoint[];
  hideHeader?: boolean;
}

export function EquityChart({ equity, hideHeader }: EquityChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
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
    if (!chartContainerRef.current || !equity.length) return;

    try {
      const bg = isDark ? '#0b1220' : '#ffffff';
      const text = isDark ? '#e5e7eb' : '#1f2937';
      const grid = isDark ? '#1f2937' : '#eef2ff';
      const border = isDark ? '#374151' : '#e5e7eb';

      // Create new chart
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: Math.max(chartContainerRef.current.clientHeight || 0, 360),
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
        },
        timeScale: {
          borderColor: border,
          timeVisible: true,
          secondsVisible: false,
        },
      });

      chartRef.current = chart;

      // Verify chart methods exist
      if (!chart || typeof chart.addLineSeries !== 'function') {
        console.error('Chart object is invalid or missing addLineSeries method');
        return;
      }

      // Area-серия с градиентом
      const equitySeries: ISeriesApi<'Area'> = chart.addAreaSeries({
        lineColor: '#6366F1',
        topColor: 'rgba(99, 102, 241, 0.25)',
        bottomColor: 'rgba(99, 102, 241, 0.03)',
        lineWidth: 2,
        title: 'Стоимость портфеля',
      });



      // Convert equity data to chart format
      const equityData = equity.map(point => ({
        time: Math.floor(point.date.getTime() / 1000) as UTCTimestamp,
        value: point.value,
      }));

      equitySeries.setData(equityData);


      // Убрали линию последнего значения по запросу

      // Простой тултип
      const tooltipEl = document.createElement('div');
      tooltipEl.style.position = 'absolute';
      tooltipEl.style.left = '12px';
      tooltipEl.style.top = '8px';
      tooltipEl.style.zIndex = '10';
      tooltipEl.style.pointerEvents = 'none';
      tooltipEl.style.background = isDark ? 'rgba(31,41,55,0.75)' : 'rgba(17,24,39,0.7)';
      tooltipEl.style.color = 'white';
      tooltipEl.style.padding = '6px 8px';
      tooltipEl.style.borderRadius = '6px';
      tooltipEl.style.fontSize = '12px';
      tooltipEl.style.backdropFilter = 'blur(4px)';
      tooltipEl.style.display = 'none';
      chartContainerRef.current.appendChild(tooltipEl);

      chart.subscribeCrosshairMove((param) => {
        if (!param || !param.time) { tooltipEl.style.display = 'none'; return; }
        const v = (param.seriesData?.get?.(equitySeries) as { value?: number } | undefined)?.value;
        if (typeof v !== 'number') { tooltipEl.style.display = 'none'; return; }
        const epochSec = typeof param.time === 'number' ? param.time : (param as any).time?.timestamp;
        const d = epochSec ? new Date(epochSec * 1000) : null;
        const dateStr = d ? d.toLocaleDateString('ru-RU') : '';
        tooltipEl.innerHTML = `${dateStr ? dateStr + ' — ' : ''}Капитал ${v.toFixed(2)}`;
        tooltipEl.style.display = 'block';
      });

      // Handle resize
      const handleResize = () => {
        if (chartContainerRef.current && chart) {
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: Math.max(chartContainerRef.current.clientHeight || 0, 360),
          });
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (chart) {
          try {
            chart.remove();
          } catch (e) {
            console.warn('Error removing chart on cleanup:', e);
          }
        }
        try {
          if (tooltipEl && tooltipEl.parentElement) tooltipEl.parentElement.removeChild(tooltipEl);
        } catch { /* ignore */ }
      };
    } catch (error) {
      console.error('Error creating equity chart:', error);
      return;
    }
  }, [equity, isDark]);

  if (!equity.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Нет данных по капиталу
      </div>
    );
  }

  const finalValue = equity[equity.length - 1]?.value ?? 0;
  const startDate = equity[0]?.date ? new Date(equity[0].date).toLocaleDateString('ru-RU') : '';
  const endDate = equity[equity.length - 1]?.date ? new Date(equity[equity.length - 1].date).toLocaleDateString('ru-RU') : '';

  return (
    <div className="w-full h-full">
      {!hideHeader && (
        <div className="flex flex-wrap gap-4 mb-4 text-sm">
          <div className="bg-gray-50 px-3 py-2 rounded border dark:bg-gray-800 dark:border-gray-700">
            <span className="text-gray-700 dark:text-gray-200">Итоговый портфель: {finalValue.toFixed(2)}</span>
          </div>
          {(startDate && endDate) && (
            <div className="bg-gray-50 px-3 py-2 rounded border dark:bg-gray-800 dark:border-gray-700">
              <span className="text-gray-700 dark:text-gray-200">Период: {startDate} — {endDate}</span>
            </div>
          )}
        </div>
      )}
      <div ref={chartContainerRef} className="w-full h-[600px] min-h-0 overflow-hidden" />
    </div>
  );
}