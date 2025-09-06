// Shims for editor/linter environments that may not resolve node modules
declare module 'lightweight-charts' {
  export type IChartApi = any;
  export type ISeriesApi<T extends string = string> = any;
  export type UTCTimestamp = number;
  export type MouseEventParams = any;
  export function createChart(container: HTMLElement, options?: any): IChartApi;
}

declare module 'lucide-react' {
  export const Heart: any;
  export const RefreshCcw: any;
  export const AlertTriangle: any;
  export const Bug: any;
}

declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}
