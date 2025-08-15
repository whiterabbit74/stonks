import { useEffect, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { DatasetAPI } from '../lib/api';
import { ConfirmModal } from './ConfirmModal';
import { InfoModal } from './InfoModal';
import { useAppStore } from '../stores';

interface WatchItem {
  symbol: string;
  highIBS: number;
  entryPrice: number | null;
  isOpenPosition: boolean;
}

export function TelegramWatches() {
  const [watches, setWatches] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Тест уведомлений удалён
  const [confirm, setConfirm] = useState<{ open: boolean; symbol: string | null }>(() => ({ open: false, symbol: null }));
  const [info, setInfo] = useState<{ open: boolean; title: string; message: string; kind?: 'success'|'error'|'info' }>({ open: false, title: '', message: '' });
  const [secondsToNext, setSecondsToNext] = useState<number | null>(null);
  const watchThresholdPct = useAppStore(s => s.watchThresholdPct);

  function getETParts(date: Date = new Date()): { y: number; m: number; d: number; hh: number; mm: number; ss: number; weekday: number } {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    const parts = fmt.formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      y: Number(map.year),
      m: Number(map.month),
      d: Number(map.day),
      hh: Number(map.hour),
      mm: Number(map.minute),
      ss: Number(map.second),
      weekday: wdMap[map.weekday] ?? 0,
    };
  }

  function secondsUntilNextSignal(now: Date = new Date()): number {
    const p = getETParts(now);
    const secOfDay = p.hh * 3600 + p.mm * 60 + p.ss;
    const target1 = 15 * 3600 + 49 * 60; // 15:49 ET (11 минут до закрытия)
    const target2 = 15 * 3600 + 58 * 60; // 15:58 ET (2 минуты до закрытия)
    const isWeekday = p.weekday >= 1 && p.weekday <= 5;

    if (isWeekday) {
      if (secOfDay < target1) return target1 - secOfDay;
      if (secOfDay < target2) return target2 - secOfDay;
    }

    // Roll to next weekday 15:49 ET
    let daysToAdd = 1;
    let wd = p.weekday;
    while (true) {
      wd = (wd + 1) % 7;
      if (wd >= 1 && wd <= 5) break;
      daysToAdd++;
    }
    const remainingToday = 24 * 3600 - secOfDay;
    const extraFullDays = daysToAdd - 1;
    return remainingToday + extraFullDays * 24 * 3600 + target1;
  }

  function formatDuration(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    const parts: string[] = [];
    if (days > 0) parts.push(`${days} д`);
    if (hours > 0 || days > 0) parts.push(`${hours} ч`);
    parts.push(`${minutes} мин`);
    parts.push(`${secs} с`);
    return parts.join(' ');
  }

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const list = await DatasetAPI.listTelegramWatches();
      // С сервера может прийти thresholdPct — игнорируем его, используем глобальную настройку
      const mapped = list.map((w: any) => ({ symbol: w.symbol, highIBS: w.highIBS, entryPrice: w.entryPrice ?? null, isOpenPosition: !!w.isOpenPosition }));
      setWatches(mapped);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось загрузить список';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const tick = () => setSecondsToNext(secondsUntilNextSignal());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Мониторинг</h2>
        <button
          onClick={load}
          className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          title="Обновить список"
          aria-label="Обновить список"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {typeof watchThresholdPct === 'number' && (
        <div className="text-sm text-gray-600">
          Текущий порог уведомлений: {watchThresholdPct}% — вход при IBS ≤ {(0.10 + watchThresholdPct/100).toFixed(2)}, выход при IBS ≥ {(0.75 - watchThresholdPct/100).toFixed(2)} <span className="ml-2 text-xs text-gray-500">(T-11/T-2)</span>
        </div>
      )}

      {typeof secondsToNext === 'number' && (
        <div className="text-sm text-gray-600">
          До следующего подсчёта сигналов: {formatDuration(secondsToNext)}
        </div>
      )}

      {/* Убран блок тестовых уведомлений по запросу */}

      {loading ? (
        <div className="text-sm text-gray-500">Загрузка…</div>
      ) : error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : watches.length === 0 ? (
        <div className="text-sm text-gray-500">Нет активных наблюдений. Включите мониторинг на вкладке «Результаты».</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="text-left p-3">Тикер</th>
                <th className="text-left p-3">IBS (верх)</th>
                <th className="text-left p-3">Цена входа</th>
                <th className="text-left p-3">Позиция</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {watches.map(w => (
                <tr key={w.symbol} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="p-3 font-medium">{w.symbol}</td>
                  <td className="p-3">{w.highIBS}</td>
                  <td className="p-3">{w.entryPrice != null ? w.entryPrice.toFixed(2) : '—'}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${w.isOpenPosition ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'}`}>{w.isOpenPosition ? 'Открыта' : 'Нет'}</span>
                      <button
                        onClick={() => setConfirm({ open: true, symbol: w.symbol })}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-600 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-red-900/30"
                        title="Удалить из мониторинга"
                        aria-label="Удалить из мониторинга"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Bottom-right test buttons */}
          <div className="flex items-center justify-end gap-2 mt-4">
            <button
              onClick={async () => {
                try {
                  const r = await DatasetAPI.simulateTelegram('overview');
                  setInfo({ open: true, title: 'Тест отправки (11 мин)', message: r.success ? 'Сообщение отправлено (T-11, TEST)' : 'Отправка не произошла', kind: r.success ? 'success' : 'error' });
                } catch (e) {
                  setInfo({ open: true, title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось выполнить тест', kind: 'error' });
                }
              }}
              className="inline-flex items-center px-3 py-2 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Тест: 11 мин
            </button>
            <button
              onClick={async () => {
                try {
                  const r = await DatasetAPI.simulateTelegram('confirmations');
                  setInfo({ open: true, title: 'Тест отправки (2 мин)', message: r.success ? 'Сообщение отправлено (T-2, TEST)' : 'Отправка не произошла', kind: r.success ? 'success' : 'error' });
                } catch (e) {
                  setInfo({ open: true, title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось выполнить тест', kind: 'error' });
                }
              }}
              className="inline-flex items-center px-3 py-2 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Тест: 2 мин
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirm.open}
        title="Удалить из мониторинга?"
        message={confirm.symbol ? `Тикер ${confirm.symbol} будет удалён из мониторинга.` : ''}
        confirmText="Удалить"
        cancelText="Отмена"
        onConfirm={async () => {
          if (!confirm.symbol) return;
          try { await DatasetAPI.deleteTelegramWatch(confirm.symbol); await load(); setInfo({ open: true, title: 'Удалено', message: `Тикер ${confirm.symbol} удалён из мониторинга`, kind: 'success' }); }
          catch (e) { setInfo({ open: true, title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось удалить', kind: 'error' }); }
          finally { setConfirm({ open: false, symbol: null }); }
        }}
        onClose={() => setConfirm({ open: false, symbol: null })}
      />
      <InfoModal open={info.open} title={info.title} message={info.message} kind={info.kind} onClose={() => setInfo({ open: false, title: '', message: '' })} />
    </div>
  );
}


