export interface ChartColors {
  bg: string;
  text: string;
  grid: string;
  border: string;
}

/**
 * Returns the standard chart colour palette for the active theme.
 * Used by chart components that share the same light/dark colour set.
 */
export function getChartColors(isDark: boolean): ChartColors {
  return {
    bg:     isDark ? '#0b1220' : '#ffffff',
    text:   isDark ? '#e5e7eb' : '#1f2937',
    grid:   isDark ? '#1f2937' : '#eef2ff',
    border: isDark ? '#374151' : '#e5e7eb',
  };
}
