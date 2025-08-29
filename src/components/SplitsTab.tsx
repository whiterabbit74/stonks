import React, { useEffect, useState, useRef } from 'react';
import { Edit, Trash2 } from 'lucide-react';
import { DatasetAPI } from '../lib/api';
import { useAppStore } from '../stores';

type SplitEvent = { date: string; factor: number };
type SplitsMap = Record<string, Array<SplitEvent>>;

export function SplitsTab() {
  const currentDataset = useAppStore(s => s.currentDataset);

  const [data, setData] = useState<SplitsMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingTicker, setEditingTicker] = useState<string | null>(null);
  const [editingEvents, setEditingEvents] = useState<Array<SplitEvent>>([]);

  const [newTicker, setNewTicker] = useState<string>('');
  const [newDate, setNewDate] = useState<string>('');
  const [newFactor, setNewFactor] = useState<string>('');
  const [actionBusy, setActionBusy] = useState<boolean>(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // JSON input state for direct paste
  const [jsonText, setJsonText] = useState<string>('');
  const [jsonUpdates, setJsonUpdates] = useState<Record<string, Array<SplitEvent>>>({});
  const [jsonError, setJsonError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true); setError(null);
    try {
      const json = await DatasetAPI.getSplitsMap();
      setData(json || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить сплиты');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const json = await DatasetAPI.getSplitsMap();
        if (active) setData(json || {});
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Не удалось загрузить сплиты');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const tickers = Object.keys(data).sort();

  function beginEdit(ticker: string) {
    setEditingTicker(ticker);
    setEditingEvents([...(data[ticker] || [])]);
    setActionMsg(null);
  }

  function cancelEdit() {
    setEditingTicker(null);
    setEditingEvents([]);
    setActionMsg(null);
  }

  function updateEvent(index: number, patch: Partial<SplitEvent>) {
    setEditingEvents(prev => prev.map((e, i) => i === index ? { ...e, ...patch } : e));
  }

  function addEventRow() {
    setEditingEvents(prev => [...prev, { date: '', factor: 2 }]);
  }

  function removeEventRow(index: number) {
    setEditingEvents(prev => prev.filter((_, i) => i !== index));
  }

  async function saveEdits() {
    if (!editingTicker) return;
    const cleaned = editingEvents
      .map(e => ({ date: (e.date || '').slice(0, 10), factor: Number(e.factor) }))
      .filter(e => e.date && isFinite(e.factor) && e.factor > 0);
    setActionBusy(true); setActionMsg(null);
    try {
      await DatasetAPI.setSplits(editingTicker, cleaned);
      await refresh();
      setActionMsg('Сохранено');
      setEditingTicker(null);
      setEditingEvents([]);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setActionBusy(false);
    }
  }

  async function deleteTicker(ticker: string) {
    if (!ticker) return;
    setActionBusy(true); setActionMsg(null);
    try {
      await DatasetAPI.deleteAllSplits(ticker);
      await refresh();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setActionBusy(false);
    }
  }

  async function createTicker() {
    const symbol = (newTicker || '').toUpperCase().trim();
    const date = (newDate || '').slice(0, 10);
    const factor = Number(newFactor);
    if (!symbol || !date || !isFinite(factor) || factor <= 0 || factor === 1) {
      setActionMsg('Укажите тикер, дату (YYYY-MM-DD) и коэффициент > 0 и != 1');
      return;
    }
    setActionBusy(true); setActionMsg(null);
    try {
      await DatasetAPI.upsertSplits(symbol, [{ date, factor }]);
      setNewTicker(''); setNewDate(''); setNewFactor('');
      await refresh();
      setActionMsg('Создано');
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Ошибка создания');
    } finally {
      setActionBusy(false);
    }
  }

  function downloadJSON(filename: string, value: unknown) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function exportAllSplits() {
    setActionBusy(true); setActionMsg(null);
    try {
      const map = await DatasetAPI.getSplitsMap();
      const ts = new Date().toISOString().replace(/[:]/g, '-');
      downloadJSON(`splits-${ts}.json`, map || {});
      setActionMsg('Экспортировано');
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Ошибка экспорта');
    } finally {
      setActionBusy(false);
    }
  }

  function normalizeEvents(arr: Array<any>): Array<SplitEvent> {
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
        const maybeSymbol = (parsed.symbol || parsed.ticker) && parsed.events;
        if (maybeSymbol && Array.isArray(parsed.events)) {
          const sym = String(parsed.symbol || parsed.ticker).toUpperCase();
          updates[sym] = normalizeEvents(parsed.events);
        } else {
          for (const [k, v] of Object.entries(parsed as Record<string, any>)) {
            const sym = String(k).toUpperCase();
            updates[sym] = normalizeEvents(v as any[]);
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
    setActionBusy(true); setActionMsg(null);
    try {
      let ok = 0; let fail = 0;
      for (const [sym, events] of entries) {
        try {
          await DatasetAPI.setSplits(sym, events);
          ok++;
        } catch (e) {
          console.warn('Failed to apply JSON splits for', sym, e);
          fail++;
        }
      }
      await refresh();
      setActionMsg(`Применено из JSON: обновлено ${ok}, ошибок ${fail}`);
      setJsonText('');
      setJsonUpdates({});
      setJsonError(null);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Ошибка применения JSON');
    } finally {
      setActionBusy(false);
    }
  }

  async function importSplitsFromFile(file: File) {
    setActionBusy(true); setActionMsg(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const updates: Record<string, Array<SplitEvent>> = {};

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const maybeSymbol = (parsed.symbol || parsed.ticker) && parsed.events;
        if (maybeSymbol && Array.isArray(parsed.events)) {
          const sym = String(parsed.symbol || parsed.ticker).toUpperCase();
          updates[sym] = normalizeEvents(parsed.events);
        } else {
          for (const [k, v] of Object.entries(parsed as Record<string, any>)) {
            const sym = String(k).toUpperCase();
            updates[sym] = normalizeEvents(v as any[]);
          }
        }
      } else if (Array.isArray(parsed)) {
        throw new Error('Неизвестный формат: для массива событий используйте объект { "SYMBOL": [ ... ] }');
      } else {
        throw new Error('Неподдерживаемый формат файла');
      }

      const entries = Object.entries(updates).filter(([, ev]) => ev.length > 0);
      if (entries.length === 0) {
        throw new Error('Нет валидных событий для импорта');
      }

      let ok = 0; let fail = 0;
      for (const [sym, events] of entries) {
        try {
          await DatasetAPI.setSplits(sym, events);
          ok++;
        } catch (e) {
          console.warn('Failed to import splits for', sym, e);
          fail++;
        }
      }

      await refresh();
      setActionMsg(`Импорт завершён: обновлено ${ok}, ошибок ${fail}`);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Ошибка импорта');
    } finally {
      setActionBusy(false);
    }
  }

  function onImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    // allow re-selecting the same file
    e.currentTarget.value = '';
    if (!f) return;
    void importSplitsFromFile(f);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Сплиты (server/splits.json)</h2>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={onImportFileChange}
          />
                    <button
             className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            onClick={refresh}
            disabled={loading || actionBusy}
          >Обновить</button>
                    <button
             className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            onClick={exportAllSplits}
            disabled={loading || actionBusy}
          >Экспорт</button>
          <button
            className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || actionBusy}
          >Импорт</button>
        </div>
      </div>

      <div className="p-3 bg-white border rounded space-y-2 dark:bg-gray-900 dark:border-gray-800">
        <div className="font-medium text-sm">Добавить тикер и первое событие</div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
                         className="border rounded px-2 py-1 text-sm w-28 uppercase dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            placeholder="Тикер"
            value={newTicker}
            onChange={e => setNewTicker(e.target.value)}
          />
          <input
            type="date"
            className="border rounded px-2 py-1 text-sm"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
          />
          <input
            type="number"
            step="0.01"
            min="0"
            className="border rounded px-2 py-1 text-sm w-28"
            placeholder="Коэф. 2, 0.5"
            value={newFactor}
            onChange={e => setNewFactor(e.target.value)}
          />
          <button
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            onClick={createTicker}
            disabled={actionBusy}
          >Создать</button>
          {actionMsg && <div className="text-xs text-gray-500">{actionMsg}</div>}
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
                <div className="flex flex-wrap gap-2">
                  <span>Ожидается валидный JSON</span>
                  <a
                    href={`https://seekingalpha.com/symbol/${currentDataset?.ticker || 'AAPL'}/splits`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
                  >
                    посмотреть сплиты ({currentDataset?.ticker || 'AAPL'})
                  </a>
                  <a
                    href="https://divvydiary.com/en/microsectors-fang-index-3x-leveraged-etn-etf-US0636795348?utm_source=chatgpt.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
                  >
                    и вот здесь
                  </a>
                </div>
              )}
            </div>
          )}
          <button
            className="ml-auto px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
            onClick={applyJsonUpdates}
            disabled={actionBusy || Object.keys(jsonUpdates).length === 0}
          >Применить JSON</button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Загрузка…</div>
      ) : error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-2 w-32">Тикер</th>
                <th className="text-left p-2">События</th>
                <th className="text-left p-2 w-56">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tickers.length === 0 ? (
                <tr><td colSpan={3} className="p-3 text-gray-500">Пусто</td></tr>
              ) : tickers.map(tk => (
                <tr key={tk} className="align-top">
                  <td className="p-2 font-medium">{tk}</td>
                  <td className="p-2">
                    {editingTicker === tk ? (
                      <div className="space-y-2">
                        {editingEvents.map((s, i) => (
                          <div key={i} className="flex flex-wrap gap-2 items-center">
                            <input
                              type="date"
                              className="border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                              value={(s.date || '').slice(0,10)}
                              onChange={e => updateEvent(i, { date: e.target.value })}
                            />
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              className="border rounded px-2 py-1 text-sm w-28 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                              value={String(s.factor ?? '')}
                              onChange={e => updateEvent(i, { factor: Number(e.target.value) })}
                            />
                            <button
                              className="px-2 py-1 text-xs rounded border hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                              onClick={() => removeEventRow(i)}
                            >Удалить</button>
                          </div>
                        ))}
                                                 <button
                           className="px-2 py-1 text-xs rounded border hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                           onClick={addEventRow}
                         >Добавить событие</button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {(data[tk] || []).map((s, i) => (
                                                     <span key={i} className="px-2 py-0.5 rounded border bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                            {s.date.slice(0,10)} × {s.factor}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-2 space-x-2">
                    {editingTicker === tk ? (
                      <>
                        <button
                          className="px-3 py-1.5 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
                          onClick={saveEdits}
                          disabled={actionBusy}
                        >Сохранить</button>
                        <button
                          className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-50"
                          onClick={cancelEdit}
                        >Отмена</button>
                      </>
                    ) : (
                      <>
                        <button
                          className="inline-flex items-center justify-center px-2 py-1.5 text-sm rounded border bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors"
                          onClick={() => beginEdit(tk)}
                          title="Редактировать"
                          aria-label="Редактировать"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          className="inline-flex items-center justify-center px-2 py-1.5 text-sm rounded border bg-white hover:bg-red-50 text-red-600 dark:border-gray-700 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors"
                          onClick={() => deleteTicker(tk)}
                          disabled={actionBusy}
                          title="Удалить тикер"
                          aria-label="Удалить тикер"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-gray-500">Изменения сохраняются на сервере в `server/splits.json`.</div>
    </div>
  );
}


