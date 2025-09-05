import React, { useEffect, useState } from 'react';
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

	// JSON import state (paste area)
	const [jsonText, setJsonText] = useState<string>('');
	const [jsonUpdates, setJsonUpdates] = useState<Record<string, Array<SplitEvent>>>({});
	const [jsonError, setJsonError] = useState<string | null>(null);

	useEffect(() => {
		(async () => {
			try {
				const list = await DatasetAPI.getDatasets();
				const normalized = list.map((d: unknown) => {
					const dataset = d as Record<string, unknown>;
					return {
						name: (dataset.name as string) || (dataset.ticker as string),
						ticker: dataset.ticker as string,
						uploadDate: dataset.uploadDate as string,
						dataPoints: dataset.dataPoints as number,
						dateRange: dataset.dateRange as { from: string; to: string },
						adjustedForSplits: dataset.adjustedForSplits === true,
					};
				}) as DatasetMeta[];
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
				const normalized = list.map((d: unknown) => {
					const dataset = d as Record<string, unknown>;
					return {
						name: (dataset.name as string) || (dataset.ticker as string),
						ticker: dataset.ticker as string,
						uploadDate: dataset.uploadDate as string,
						dataPoints: dataset.dataPoints as number,
						dateRange: dataset.dateRange as { from: string; to: string },
						adjustedForSplits: dataset.adjustedForSplits === true,
					};
				}) as DatasetMeta[];
				setDatasets(normalized);
			} catch {
				// Ignore dataset refresh errors
			}
		} catch (e) {
			setMsg(e instanceof Error ? e.message : 'Не удалось пересчитать датасет');
		} finally { setBusy(false); }
	};

	function normalizeEvents(arr: Array<unknown>): Array<SplitEvent> {
		return (Array.isArray(arr) ? arr : [])
			.map(it => ({
				date: typeof it?.date === 'string' ? String(it.date).slice(0, 10) : '',
				factor: Number((it?.factor ?? it?.ratio ?? it?.value))
			}))
			.filter(e => !!e.date && isFinite(e.factor) && e.factor > 0 && e.factor !== 1);
	}

	function parseJsonInput(text: string) {
		setJsonText(text);
		if (!text.trim()) {
			setJsonUpdates({});
			setJsonError(null);
			return;
		}
		try {
			const parsed = JSON.parse(text);
			const updates: Record<string, Array<SplitEvent>> = {};
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				const parsedObj = parsed as Record<string, unknown>;
				const maybeSymbol = (parsedObj.symbol || parsedObj.ticker) && parsedObj.events;
				if (maybeSymbol && Array.isArray(parsedObj.events)) {
					const sym = String(parsedObj.symbol || parsedObj.ticker).toUpperCase();
					updates[sym] = normalizeEvents(parsedObj.events as Array<unknown>);
				} else {
					for (const [k, v] of Object.entries(parsedObj)) {
						const sym = String(k).toUpperCase();
						updates[sym] = normalizeEvents(v as Array<unknown>);
					}
				}
			} else if (Array.isArray(parsed)) {
				throw new Error('Неизвестный формат: для массива событий используйте объект { "SYMBOL": [ ... ] }');
			} else {
				throw new Error('Неподдерживаемый формат JSON');
			}
			const pruned = Object.fromEntries(
				Object.entries(updates).filter(([, ev]) => Array.isArray(ev) && ev.length > 0)
			);
			if (Object.keys(pruned).length === 0) {
				setJsonUpdates({});
				setJsonError('Нет валидных событий в JSON');
			} else {
				setJsonUpdates(pruned);
				setJsonError(null);
			}
		} catch (e) {
			setJsonUpdates({});
			setJsonError(e instanceof Error ? e.message : 'Ошибка разбора JSON');
		}
	}

	async function applyJsonUpdates() {
		const entries = Object.entries(jsonUpdates);
		if (entries.length === 0) return;
		setBusy(true); setMsg(null);
		try {
			let ok = 0; let fail = 0;
			for (const [sym, list] of entries) {
				try {
					await DatasetAPI.setSplits(sym, list);
					ok++;
				} catch {
					fail++;
				}
			}
			if (selected && jsonUpdates[selected]) {
				try {
					const arr = await DatasetAPI.getSplits(selected);
					setEvents(Array.isArray(arr) ? arr : []);
				} catch {}
			}
			setMsg(`Применено из JSON: обновлено ${ok}, ошибок ${fail}`);
			setJsonText('');
			setJsonUpdates({});
			setJsonError(null);
		} catch (e) {
			setMsg(e instanceof Error ? e.message : 'Ошибка применения JSON');
		} finally {
			setBusy(false);
		}
	}

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
					<div className="p-3 bg-white border rounded space-y-2 dark:bg-gray-900 dark:border-gray-800">
						<div className="font-medium text-sm">Вставить сплиты в виде JSON</div>
						<div className="text-xs text-gray-500">Вставьте JSON с событиями сплитов. Поддерживаются два формата:</div>
						<div className="grid md:grid-cols-2 gap-3">
							<div>
								<div className="text-xs font-medium mb-1">Пример 1: карта тикеров</div>
								<pre className="text-xs p-2 rounded border bg-gray-50 overflow-auto dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">{`{
  "AAPL": [
    { "date": "2020-08-31", "factor": 4 },
    { "date": "2014-06-09", "factor": 7 }
  ],
  "TSLA": [
    { "date": "2020-08-31", "factor": 5 },
    { "date": "2022-08-25", "factor": 3 }
  ]
}`}</pre>
							</div>
							<div>
								<div className="text-xs font-medium mb-1">Пример 2: один тикер</div>
								<pre className="text-xs p-2 rounded border bg-gray-50 overflow-auto dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">{`{
  "symbol": "AAPL",
  "events": [
    { "date": "2020-08-31", "factor": 4 },
    { "date": "2014-06-09", "factor": 7 }
  ]
}`}</pre>
							</div>
						</div>
						<textarea
							className="w-full h-40 border rounded px-2 py-1 text-sm font-mono dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
							placeholder='Вставьте JSON здесь'
							value={jsonText}
							onChange={e => parseJsonInput(e.target.value)}
						/>
						<div className="flex flex-wrap items-center gap-2">
							{jsonError ? (
								<div className="text-xs text-red-600">{jsonError}</div>
							) : (
								<div className="text-xs text-gray-600 dark:text-gray-400">
									{Object.keys(jsonUpdates).length > 0 ? (
										<span>
											Будет обновлено {Object.keys(jsonUpdates).length} тикеров, всего {Object.values(jsonUpdates).reduce((s, arr) => s + arr.length, 0)} событий
										</span>
									) : (
										<span>Вставьте валидный JSON</span>
									)}
								</div>
							)}
							<button
								className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
								onClick={applyJsonUpdates}
								disabled={busy || !!jsonError || Object.keys(jsonUpdates).length === 0}
							>
								Применить JSON
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

export default SplitPage;