import type { ComponentType, SVGProps } from 'react';

declare module 'lightweight-charts' {
  export interface IPriceScaleApi {
    applyOptions(options: Record<string, unknown>): void;
  }

  export interface ITimeScaleApi {
    applyOptions(options: Record<string, unknown>): void;
  }

  export interface ISeriesApi<TSeriesType extends string = string> {
    seriesType?: TSeriesType;
    setData(data: Array<Record<string, unknown>>): void;
    setMarkers?(markers: Array<Record<string, unknown>>): void;
    priceScale(): IPriceScaleApi;
    applyOptions?(options: Record<string, unknown>): void;
  }

  export interface IChartApi {
    addCandlestickSeries(options?: Record<string, unknown>): ISeriesApi<'Candlestick'>;
    addHistogramSeries(options?: Record<string, unknown>): ISeriesApi<'Histogram'>;
    addLineSeries(options?: Record<string, unknown>): ISeriesApi<'Line'>;
    remove(): void;
    timeScale(): ITimeScaleApi;
    applyOptions(options: Record<string, unknown>): void;
    subscribeCrosshairMove(callback: (params: MouseEventParams) => void): () => void;
  }

  export type UTCTimestamp = number;
  export type MouseEventParams = Record<string, unknown>;

  export function createChart(container: HTMLElement, options?: Record<string, unknown>): IChartApi;
}

declare module 'lucide-react' {
  export type Icon = ComponentType<SVGProps<SVGSVGElement>>;

  export const Heart: Icon;
  export const RefreshCcw: Icon;
  export const AlertTriangle: Icon;
  export const Bug: Icon;
}

declare module 'react/jsx-runtime' {
  export const jsx: (type: unknown, props: Record<string, unknown>, key?: string) => unknown;
  export const jsxs: (type: unknown, props: Record<string, unknown>, key?: string) => unknown;
  export const Fragment: typeof import('react').Fragment;
}
