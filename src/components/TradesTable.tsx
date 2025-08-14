import type { Trade } from '../types';

interface TradesTableProps {
	trades: Trade[];
}

export function TradesTable({ trades }: TradesTableProps) {
	if (!trades || trades.length === 0) {
		return (
			<div className="text-sm text-gray-500">Нет сделок для отображения</div>
		);
	}

	const fmtDate = (d: Date) => {
		try {
			return new Date(d).toLocaleDateString('ru-RU');
		} catch {
			return String(d);
		}
	};
	const fmtTime = (d: Date) => {
		try {
			return new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
		} catch {
			return '';
		}
	};

	return (
		<div className="w-full overflow-auto">
			<table className="min-w-full text-sm">
				<thead className="sticky top-0 bg-gray-100 border-b dark:bg-gray-800 dark:border-gray-700">
					<tr>
						<th className="text-left px-3 py-2 font-semibold">#</th>
						<th className="text-left px-3 py-2 font-semibold">Вход</th>
						<th className="text-left px-3 py-2 font-semibold">Выход</th>
						<th className="text-right px-3 py-2 font-semibold">Цена входа</th>
						<th className="text-right px-3 py-2 font-semibold">Цена выхода</th>
						<th className="text-right px-3 py-2 font-semibold">Кол-во</th>
						<th className="text-right px-3 py-2 font-semibold">PnL, $</th>
						<th className="text-right px-3 py-2 font-semibold">PnL, %</th>
						<th className="text-right px-3 py-2 font-semibold">Дней</th>
						<th className="text-left px-3 py-2 font-semibold">Причина выхода</th>
					</tr>
				</thead>
				<tbody>
					{trades.map((t, i) => {
						const positive = (t.pnl ?? 0) >= 0;
						return (
							<tr key={t.id || i} className="border-b last:border-b-0 dark:border-gray-800">
								<td className="px-3 py-2 text-gray-500">{i + 1}</td>
								<td className="px-3 py-2 whitespace-nowrap">
									<div>{fmtDate(t.entryDate)}</div>
									<div className="text-xs text-gray-500">{fmtTime(t.entryDate)}</div>
								</td>
								<td className="px-3 py-2 whitespace-nowrap">
									<div>{fmtDate(t.exitDate)}</div>
									<div className="text-xs text-gray-500">{fmtTime(t.exitDate)}</div>
								</td>
								<td className="px-3 py-2 text-right font-mono">{t.entryPrice.toFixed(2)}</td>
								<td className="px-3 py-2 text-right font-mono">{t.exitPrice.toFixed(2)}</td>
								<td className="px-3 py-2 text-right">{t.quantity.toLocaleString()}</td>
								<td className={`px-3 py-2 text-right font-mono ${positive ? 'text-emerald-600 dark:text-emerald-300' : 'text-orange-600 dark:text-orange-300'}`}>{(t.pnl ?? 0).toFixed(2)}</td>
								<td className={`px-3 py-2 text-right font-mono ${positive ? 'text-emerald-600 dark:text-emerald-300' : 'text-orange-600 dark:text-orange-300'}`}>{(t.pnlPercent ?? 0).toFixed(2)}%</td>
								<td className="px-3 py-2 text-right">{t.duration ?? 0}</td>
								<td className="px-3 py-2 whitespace-nowrap">{t.exitReason || '-'}</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}