import { useEffect, useMemo, useState } from 'react';
import { DatasetAPI } from '../lib/api';

type SplitEvent = { date: string; factor: number };

type DatasetMeta = {
	name: string;
	ticker: string;
	uploadDate: string;
	dataPoints: number;
	dateRange: { from: string; to: string };
	adjustedForSplits?: boolean;
};

export function SplitPage() {
	const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selected, setSelected] = useState<string>('');
	const [events, setEvents] = useState<SplitEvent[]>([]);
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState<string | null>(null);

	useEffect(() => {
		(async () => {
			try {
				const list = await DatasetAPI.getDatasets();
				const normalized = list.map(d => ({
					name: (d as any).name || (d as any).ticker,
					ticker: (d as any).ticker,
					uploadDate: (d as any).uploadDate,
					dataPoints: (d as any).dataPoints,
					dateRange: (d as any).dateRange,
					adjustedForSplits: (d as any).adjustedForSplits === true,
				})) as DatasetMeta[];
				setDatasets(normalized);
				if (normalized.length && !selected) setSelected(normalized[0].ticker);
			} catch (e) {
				setError(e instanceof Error ? e.message : 'Не удалось загрузить список тикеров');
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	useEffect(() => {
		(async () => {
			if (!selected) { setEvents([]); return; }
			setBusy(true); setMsg(null);
			try {
				const arr = await DatasetAPI.getSplits(selected);
				setEvents(Array.isArray(arr) ? arr : []);
			} catch {
				setEvents([]);
			} finally {
				setBusy(false);
			}
		})();
	}, [selected]);

	const selectedMeta = useMemo(() => datasets.find(d => d.ticker === selected) || null, [datasets, selected]);

	const updateEvent = (index: number, patch: Partial<SplitEvent>) => {
		setEvents(prev => prev.map((e, i) => i === index ? { ...e, ...patch } : e));
	};
	const addEvent = () => setEvents(prev => [...prev, { date: '', factor: 2 }]);
	const removeEvent = (index: number) => setEvents(prev => prev.filter((_, i) => i !== index));

	const saveSplits = async () => {
		if (!selected) return;
		const cleaned = events
			.map(e => ({ date: (e.date || '').slice(0, 10), factor: Number(e.factor) }))
			.filter(e => e.date && isFinite(e.factor) && e.factor > 0 && e.factor !== 1);
		setBusy(true); setMsg(null);
		try {
			await DatasetAPI.setSplits(selected, cleaned);
			setMsg('Сплиты сохранены');
		} catch (e) {
			setMsg(e instanceof Error ? e.message : 'Ошибка сохранения сплитов');
		} finally { setBusy(false); }
	};

	const applySplits = async () => {
		if (!selected) return;
		setBusy(true); setMsg(null);
		try {
			const r = await DatasetAPI.applySplitsToDataset(selected);
			setMsg(r && r.message ? r.message : 'Датасет пересчитан и сохранён');
			// refresh metas
			try {
				const list = await DatasetAPI.getDatasets();
				const normalized = list.map(d => ({
					name: (d as any).name || (d as any).ticker,
					ticker: (d as any).ticker,
					uploadDate: (d as any).uploadDate,
					dataPoints: (d as any).dataPoints,
					dateRange: (d as any).dateRange,
					adjustedForSplits: (d as any).adjustedForSplits === true,
				})) as DatasetMeta[];
				setDatasets(normalized);
			} catch {}
		} catch (e) {
			setMsg(e instanceof Error ? e.message : 'Не удалось пересчитать датасет');
		} finally { setBusy(false); }
	};

	return (
		<div className="space-y-4">
			<h2 className="text-xl font-semibold text-gray-900">Сплит</h2>

			{loading ? (
				<div className="text-sm text-gray-500">Загрузка…</div>
			) : error ? (
				<div className="text-sm text-red-600">{error}</div>
			) : (
				<div className="space-y-4">
					<div className="p-3 bg-white border rounded dark:bg-gray-900 dark:border-gray-800">
						<label className="block text-sm mb-1">Тикер</label>
						<select
							value={selected}
							onChange={e => setSelected(e.target.value)}
							className="border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
						>
							<option value="" disabled>Выберите тикер</option>
							{datasets.map(d => (
								<option key={d.ticker} value={d.ticker}>
									{d.ticker} — {d.dataPoints.toLocaleString()} точек ({d.dateRange.from} — {d.dateRange.to}){d.adjustedForSplits ? ' • уже пересчитан' : ''}
								</option>
							))}
						</select>
					</div>

					<div className="p-3 bg-white border rounded space-y-2 dark:bg-gray-900 dark:border-gray-800">
						<div className="font-medium text-sm">События сплитов для {selected || '—'}</div>
						{events.length === 0 && (
							<div className="text-xs text-gray-500">Нет событий. Добавьте новое.</div>
						)}
						<div className="space-y-2">
							{events.map((s, i) => (
								<div key={i} className="flex flex-wrap gap-2 items-center">
									<input type="date" className="border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" value={(s.date || '').slice(0,10)} onChange={e => updateEvent(i, { date: e.target.value })} />
									<input type="number" step="0.01" min="0" className="border rounded px-2 py-1 text-sm w-28 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" value={String(s.factor ?? '')} onChange={e => updateEvent(i, { factor: Number(e.target.value) })} />
									<button className="px-2 py-1 text-xs rounded border hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800" onClick={() => removeEvent(i)}>Удалить</button>
								</div>
							))}
							<button className="px-2 py-1 text-xs rounded border hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800" onClick={addEvent}>Добавить событие</button>
						</div>
						<div className="flex flex-wrap gap-2 items-center">
							<button className="px-3 py-1.5 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-60" onClick={saveSplits} disabled={busy || !selected}>Сохранить сплиты</button>
							<button className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60" onClick={applySplits} disabled={busy || !selected}>Пересчитать датасет</button>
							{msg && <div className="text-xs text-gray-500">{msg}</div>}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

export default SplitPage;