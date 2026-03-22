import type { BacktestMetrics } from '../lib/backtest-statistics';
import type { Trade } from '../types';

interface Props {
  metrics: BacktestMetrics;
  trades: Trade[];
}

export function CompactMetrics({ metrics, trades }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = metrics as any;
  const rows = [
    { label: 'CAGR', value: m?.cagr != null ? `${Number(m.cagr).toFixed(1)}%` : '—' },
    { label: 'Макс. просадка', value: m?.maxDrawdown != null ? `${(Number(m.maxDrawdown) * 100).toFixed(1)}%` : '—' },
    { label: 'Win rate', value: m?.winRate != null ? `${(Number(m.winRate) * 100).toFixed(1)}%` : '—' },
    { label: 'Sharpe', value: m?.sharpeRatio != null ? Number(m.sharpeRatio).toFixed(2) : '—' },
    { label: 'Сделок', value: String(trades.length) },
  ];
  return (
    <div className="space-y-1.5 border-t border-gray-200 pt-3 dark:border-gray-700">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Результаты</div>
      {rows.map(({ label, value }) => (
        <div key={label} className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400">{label}</span>
          <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">{value}</span>
        </div>
      ))}
    </div>
  );
}
