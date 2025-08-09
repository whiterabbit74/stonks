import { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import { formatOHLCYMD, parseOHLCDate } from '../lib/utils';
import type { OHLCData, Trade, SplitEvent } from '../types';

interface TradingChartProps {
  data: OHLCData[];
  trades: Trade[];
  chartData?: any[];
  splits?: SplitEvent[];
}

export function TradingChart({ data, trades, splits = [] }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [showEMA20, setShowEMA20] = useState(false);
  const [showEMA200, setShowEMA200] = useState(false);

  // Функция для расчета EMA
  const calculateEMA = (data: OHLCData[], period: number): number[] => {
    const ema: number[] = [];
    const multiplier = 2 / (period + 1);
    
    // Первое значение - это SMA
    let sum = 0;
    for (let i = 0; i < Math.min(period, data.length); i++) {
      sum += data[i].close;
    }
    ema[period - 1] = sum / period;
    
    // Остальные значения - EMA
    for (let i = period; i < data.length; i++) {
      ema[i] = (data[i].close - ema[i - 1]) * multiplier + ema[i - 1];
    }
    
    return ema;
  };

  useEffect(() => {
    if (!chartContainerRef.current || !data.length) return;

    // Clean up previous chart
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch (e) {
        console.warn('Error removing previous chart:', e);
      }
      chartRef.current = null;
    }

    try {
      // Create new chart
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        // Синхронизируем с контейнером, чтобы реально занимать h-[80vh]
        height: chartContainerRef.current.clientHeight || 600,
        layout: {
          background: { color: '#ffffff' },
          textColor: '#1f2937',
        },
        grid: {
          vertLines: { color: '#eef2ff' },
          horzLines: { color: '#eef2ff' },
        },
        crosshair: {
          mode: 1,
        },
        rightPriceScale: {
          borderColor: '#e5e7eb',
        },
        timeScale: {
          borderColor: '#e5e7eb',
          timeVisible: true,
          secondsVisible: false,
        },
      });

      chartRef.current = chart;

      // Verify chart methods exist
      if (!chart || typeof chart.addCandlestickSeries !== 'function') {
        console.error('Chart object is invalid or missing addCandlestickSeries method');
        return;
      }

      // Свечной ряд
      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#10B981',
        downColor: '#EF4444',
        borderUpColor: '#10B981',
        borderDownColor: '#EF4444',
        wickUpColor: '#10B981',
        wickDownColor: '#EF4444',
        borderVisible: true,
      });

      // Convert data to chart format
      const chartData = data.map(bar => ({
        time: Math.floor(bar.date.getTime() / 1000) as any,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }));

      candlestickSeries.setData(chartData);

      // Объем как полупрозрачная гистограмма внизу (не более 15% высоты)
      try {
        chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.05, bottom: 0.05 } });
        chart.priceScale('left').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
      } catch {}
      const volumeSeries = chart.addHistogramSeries({
        color: 'rgba(148, 163, 184, 0.35)',
        priceFormat: { type: 'volume' as const },
        priceScaleId: 'left',
        base: 0,
      });
      const volumeData = data.map(bar => ({
        time: Math.floor(bar.date.getTime() / 1000) as any,
        value: bar.volume,
        color: bar.close >= bar.open ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'
      }));
      volumeSeries.setData(volumeData);

      // Add EMA20 if enabled
      if (showEMA20) {
        const ema20Values = calculateEMA(data, 20);
        const ema20Series = chart.addLineSeries({
          color: '#2196F3',
          lineWidth: 2,
          title: 'EMA 20',
        });
        
        const ema20Data = data.map((bar, index) => ({
          time: Math.floor(bar.date.getTime() / 1000) as any,
          value: ema20Values[index] || bar.close,
        })).filter(point => point.value !== undefined);
        
        ema20Series.setData(ema20Data);
      }

      // Add EMA200 if enabled
      if (showEMA200) {
        const ema200Values = calculateEMA(data, 200);
        const ema200Series = chart.addLineSeries({
          color: '#FF9800',
          lineWidth: 2,
          title: 'EMA 200',
        });
        
        const ema200Data = data.map((bar, index) => ({
          time: Math.floor(bar.date.getTime() / 1000) as any,
          value: ema200Values[index] || bar.close,
        })).filter(point => point.value !== undefined);
        
        ema200Series.setData(ema200Data);
      }

      // Собираем маркеры: сделки и сплиты
      const allMarkers: any[] = [];
      if (trades.length > 0) {
        allMarkers.push(
          ...trades.flatMap(trade => [
            {
              time: Math.floor(trade.entryDate.getTime() / 1000) as any,
              position: 'belowBar' as const,
              color: '#10B981',
              shape: 'arrowUp' as const,
              text: '',
            },
            {
              time: Math.floor(trade.exitDate.getTime() / 1000) as any,
              position: 'aboveBar' as const,
              color: '#EF4444',
              shape: 'arrowDown' as const,
              text: '',
            },
          ])
        );
      }
      if (splits.length > 0) {
        // Привяжем маркеры сплитов к времени свечи в тот же день (точное совпадение time метки)
        const ymdToTime = new Map<string, number>();
        for (const bar of data) {
          const ymd = formatOHLCYMD(bar.date);
          if (!ymdToTime.has(ymd)) ymdToTime.set(ymd, Math.floor(bar.date.getTime() / 1000));
        }
        const splitMarkers = splits.map(s => {
          const ymd = typeof s.date === 'string' ? s.date.slice(0, 10) : formatOHLCYMD(parseOHLCDate(s.date as any));
          const t = ymdToTime.get(ymd) ?? Math.floor(parseOHLCDate(s.date as any).getTime() / 1000);
          return {
            time: t as any,
            position: 'belowBar' as const,
            color: '#9C27B0',
            shape: 'circle' as const,
            text: 'S',
          };
        });
        allMarkers.push(...splitMarkers);
      }
      if (allMarkers.length > 0) {
        candlestickSeries.setMarkers(allMarkers);
      }

      // Тултип по кроссхэру
      const tooltipEl = document.createElement('div');
      tooltipEl.style.position = 'absolute';
      tooltipEl.style.left = '12px';
      tooltipEl.style.top = '8px';
      tooltipEl.style.zIndex = '10';
      tooltipEl.style.pointerEvents = 'none';
      tooltipEl.style.background = 'rgba(17,24,39,0.7)';
      tooltipEl.style.color = 'white';
      tooltipEl.style.padding = '6px 8px';
      tooltipEl.style.borderRadius = '6px';
      tooltipEl.style.fontSize = '12px';
      tooltipEl.style.backdropFilter = 'blur(4px)';
      tooltipEl.style.display = 'none';
      chartContainerRef.current.appendChild(tooltipEl);

      chart.subscribeCrosshairMove((param: any) => {
        if (!param || !param.time || !param.seriesPrices) {
          tooltipEl.style.display = 'none';
          return;
        }
        const price = param.seriesPrices.get(candlestickSeries);
        if (!price) {
          tooltipEl.style.display = 'none';
          return;
        }
        const bar = param?.seriesData?.get?.(candlestickSeries);
        const o = bar?.open, h = bar?.high, l = bar?.low, c = bar?.close;
        const vol = (param.seriesData?.get?.(volumeSeries) as any)?.value;
        const pct = o ? (((c - o) / o) * 100) : 0;
        tooltipEl.innerHTML = `O ${o?.toFixed?.(2) ?? '-'} H ${h?.toFixed?.(2) ?? '-'} L ${l?.toFixed?.(2) ?? '-'} C ${c?.toFixed?.(2) ?? '-'} · ${pct ? pct.toFixed(2) + '%' : ''} ${vol ? ' · Vol ' + vol.toLocaleString() : ''}`;
        tooltipEl.style.display = 'block';
      });

      // Handle resize
      const handleResize = () => {
        if (chartContainerRef.current && chart) {
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight || 600,
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
        } catch {}
      };
    } catch (error) {
      console.error('Error creating trading chart:', error);
      return;
    }
  }, [data, trades, showEMA20, showEMA200]);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No data available for chart
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {/* EMA Controls */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setShowEMA20(!showEMA20)}
          className={`px-3 py-1 text-sm rounded ${
            showEMA20 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          EMA 20
        </button>
        <button
          onClick={() => setShowEMA200(!showEMA200)}
          className={`px-3 py-1 text-sm rounded ${
            showEMA200 
              ? 'bg-orange-500 text-white' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          EMA 200
        </button>
      </div>
      
      {/* Chart Container */}
      <div ref={chartContainerRef} className="w-full h-[calc(100%-2rem)]" />
    </div>
  );
}