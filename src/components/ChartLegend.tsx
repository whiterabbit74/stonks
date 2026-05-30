interface ChartLegendItem {
  label: string;
  color: string;
  muted?: boolean;
}

interface ChartLegendProps {
  items: ChartLegendItem[];
}

export function ChartLegend({ items }: ChartLegendProps) {
  const visibleItems = items.filter((item) => item.label);
  if (!visibleItems.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
      {visibleItems.map((item) => (
        <div key={`${item.label}-${item.color}`} className={item.muted ? 'flex items-center gap-2 opacity-60' : 'flex items-center gap-2'}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
