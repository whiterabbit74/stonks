import type { IChartApi } from 'lightweight-charts';

/**
 * Fits a small number of data points nicely inside the chart's visible range.
 * For larger datasets (≥40 points) a simple fitContent() is sufficient.
 */
export function centerFewPointsOnTimeScale(chart: IChartApi, pointsCount: number): void {
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
