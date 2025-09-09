import { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp, type MouseEventParams } from 'lightweight-charts';
import type { EquityPoint } from '../types';
import { logError } from '../lib/error-logger';

interface EquityChartProps {
  equity: EquityPoint[];
  hideHeader?: boolean;
}

export function EquityChart({ equity, hideHeader }: EquityChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const resizeHandlerRef = useRef<(() => void) | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false);

  // Cleanup function for chart resources
  const cleanupChart = () => {
    // Unsubscribe from crosshair events
    if (unsubscribeRef.current) {
      try {
        unsubscribeRef.current();
      } catch (error) {
        logError('chart', 'Failed to unsubscribe from crosshair events', {
          error: (error as Error).message
        }, 'EquityChart.cleanup');
      }
      unsubscribeRef.current = null;
    }
    
    // Remove resize handler
    if (resizeHandlerRef.current) {
      window.removeEventListener('resize', resizeHandlerRef.current);
      resizeHandlerRef.current = null;
    }
    
    // Remove tooltip DOM element
    if (tooltipRef.current && tooltipRef.current.parentElement) {
      try {
        tooltipRef.current.parentElement.removeChild(tooltipRef.current);
      } catch (error) {
        logError('chart', 'Failed to remove tooltip element', {
          error: (error as Error).message
        }, 'EquityChart.cleanup');
      }
      tooltipRef.current = null;
    }
    
    // Remove chart instance
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch (error) {
        logError('chart', 'Failed to remove chart instance', {
          error: (error as Error).message
        }, 'EquityChart.cleanup');
      }
      chartRef.current = null;
    }
  };

  useEffect(() => {
    const onTheme = (e: any) => {
      const dark = !!(e?.detail?.effectiveDark ?? document.documentElement.classList.contains('dark'));
      setIsDark(dark);
    };
    // Cast to any because 'themechange' is a custom event not present in WindowEventMap
    window.addEventListener('themechange' as any, onTheme as any);
    return () => {
      window.removeEventListener('themechange' as any, onTheme as any);
    };
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



      // Validate, sort, and dedupe equity data to chart format by time
      const mapped = equity.map((point, idx) => {
        try {
          const d = point?.date instanceof Date ? point.date : new Date(point?.date as any);
          const t = Math.floor(d.getTime() / 1000) as UTCTimestamp;
          const v = Number(point?.value);
          if (!Number.isFinite(t as unknown as number) || !Number.isFinite(v)) {
            logError('chart', 'Invalid equity data point', { idx, point }, 'EquityChart.setData');
          }
          return { time: t, value: v };
        } catch (e) {
          logError('chart', 'Failed to map equity point', { idx, point }, 'EquityChart.setData', (e as any)?.stack);
          return { time: 0 as UTCTimestamp, value: 0 };
        }
      }).filter(p => Number.isFinite(p.time as unknown as number) && Number.isFinite(p.value));
      const sorted = mapped.slice().sort((a, b) => (a.time as number) - (b.time as number));
      const equityData: Array<{ time: UTCTimestamp; value: number }> = [];
      let lastTime: number | null = null;
      for (const p of sorted) {
        const t = p.time as unknown as number;
        if (lastTime === t) {
          // collapse duplicate timestamps: keep the last value for that time
          equityData[equityData.length - 1] = { time: p.time, value: p.value };
        } else {
          equityData.push(p);
          lastTime = t;
        }
      }

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
      tooltipRef.current = tooltipEl;

      const crosshairHandler = (param: MouseEventParams) => {
        if (!tooltipRef.current) return;
        if (!param || !param.time) { tooltipRef.current.style.display = 'none'; return; }
        const v = (param.seriesData?.get?.(equitySeries) as { value?: number } | undefined)?.value;
        if (typeof v !== 'number') { tooltipRef.current.style.display = 'none'; return; }
        const epochSec = typeof param.time === 'number' ? param.time : (param as { time?: { timestamp?: number } }).time?.timestamp;
        const d = epochSec ? new Date(epochSec * 1000) : null;
        const dateStr = d ? d.toLocaleDateString('ru-RU') : '';
        tooltipRef.current.textContent = `${dateStr ? dateStr + ' — ' : ''}Капитал ${v.toFixed(2)}`;
        tooltipRef.current.style.display = 'block';
      };
      
      unsubscribeRef.current = chart.subscribeCrosshairMove(crosshairHandler);

      // Handle resize
      const handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
          try {
            chartRef.current.applyOptions({
              width: chartContainerRef.current.clientWidth,
              height: Math.max(chartContainerRef.current.clientHeight || 0, 580),
            });
          } catch (error) {
            logError('chart', 'Failed to resize chart', {
              error: (error as Error).message
            }, 'EquityChart.resize');
          }
        }
      };
      
      resizeHandlerRef.current = handleResize;
      window.addEventListener('resize', handleResize);

      return cleanupChart;
    } catch (error) {
      logError('chart', 'Error creating equity chart', {}, 'EquityChart', (error as any)?.stack);
      return;
    }
  }, [equity, isDark]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanupChart;
  }, []);

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
  
  // Рассчитываем годовые проценты (CAGR) с учетом сложного процента
  const annualReturn = (() => {
    if (equity.length < 2) return 0;
    const initialValue = equity[0]?.value ?? 0;
    if (initialValue <= 0) return 0;
    
    const startDateObj = equity[0]?.date ? new Date(equity[0].date) : null;
    const endDateObj = equity[equity.length - 1]?.date ? new Date(equity[equity.length - 1].date) : null;
    
    if (!startDateObj || !endDateObj) return 0;
    
    const daysDiff = (endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24);
    const years = Math.max(daysDiff / 365.25, 1/365.25); // Минимум 1 день
    
    return (Math.pow(finalValue / initialValue, 1 / years) - 1) * 100;
  })();

  // Функция для форматирования валюты в долларах с разделителями тысяч
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="w-full h-full">
      {!hideHeader && (
        <div className="flex flex-wrap gap-4 mb-4 text-sm">
          <div className="bg-gray-50 px-3 py-2 rounded border dark:bg-gray-800 dark:border-gray-700">
            <span className="text-gray-700 dark:text-gray-200">Итоговый портфель: {formatCurrency(finalValue)}</span>
          </div>
          {(startDate && endDate) && (
            <div className="bg-gray-50 px-3 py-2 rounded border dark:bg-gray-800 dark:border-gray-700">
              <span className="text-gray-700 dark:text-gray-200">Период: {startDate} — {endDate}</span>
            </div>
          )}
          <div className="bg-blue-50 px-3 py-2 rounded border border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/40">
            <span className="text-blue-700 dark:text-blue-300">Годовые проценты: {annualReturn.toFixed(2)}%</span>
          </div>
        </div>
      )}
      <div ref={chartContainerRef} className="w-full h-full min-h-0 overflow-hidden" />
    </div>
  );
}