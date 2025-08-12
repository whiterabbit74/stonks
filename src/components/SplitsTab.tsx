import { useEffect, useState } from 'react';
import { DatasetAPI } from '../lib/api';

type SplitsMap = Record<string, Array<{ date: string; factor: number }>>;

export function SplitsTab() {
  const [data, setData] = useState<SplitsMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const json = await DatasetAPI.getSplitsMap();
        if (active) setData(json || {});
      } catch (e: any) {
        if (active) setError(e?.message || 'Не удалось загрузить сплиты');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const tickers = Object.keys(data).sort();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Сплиты (из splits.json)</h2>
      {loading ? (
        <div className="text-sm text-gray-500">Загрузка…</div>
      ) : error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : tickers.length === 0 ? (
        <div className="text-sm text-gray-500">Пусто</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-2">Тикер</th>
                <th className="text-left p-2">События</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tickers.map(tk => (
                <tr key={tk} className="hover:bg-gray-50 align-top">
                  <td className="p-2 font-medium">{tk}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2">
                      {(data[tk] || []).map((s, i) => (
                        <span key={i} className="px-2 py-0.5 rounded border bg-gray-50">
                          {s.date.slice(0,10)} × {s.factor}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-xs text-gray-500">Источник: только `server/splits.json`. Чтобы изменить — правьте этот файл на сервере.</div>
    </div>
  );
}


