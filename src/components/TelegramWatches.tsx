import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Trash2, ExternalLink, Edit2, Check, X } from 'lucide-react';
import { DatasetAPI } from '../lib/api';
import { ConfirmModal } from './ConfirmModal';
import { InfoModal } from './InfoModal';
import { useAppStore } from '../stores';
import { useNavigate } from 'react-router-dom';

interface WatchItem {
  symbol: string;
  highIBS: number;
  lowIBS?: number;
  entryPrice: number | null;
  isOpenPosition: boolean;
}

export function TelegramWatches() {
  const navigate = useNavigate();
  const [watches, setWatches] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Тест уведомлений удалён
  const [confirm, setConfirm] = useState<{ open: boolean; symbol: string | null }>(() => ({ open: false, symbol: null }));
  const [info, setInfo] = useState<{ open: boolean; title: string; message: string; kind?: 'success'|'error'|'info' }>({ open: false, title: '', message: '' });
  const [secondsToNext, setSecondsToNext] = useState<number | null>(null);
  const [editingPrice, setEditingPrice] = useState<{ symbol: string; value: string } | null>(null);
  const watchThresholdPct = useAppStore(s => s.watchThresholdPct);

  const handleTickerClick = (symbol: string) => {
    navigate(`/results?ticker=${encodeURIComponent(symbol)}`);
  };

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

  const secondsUntilNextSignal = useCallback((now: Date = new Date()): number => {
    const p = getETParts(now);
    const secOfDay = p.hh * 3600 + p.mm * 60 + p.ss;
    
    // Для упрощения используем обычные часы торгов: 9:30-16:00, короткие дни: 9:30-13:00
    // В реальности должен загружаться календарь торгов, но для данной задачи используем стандартное время
    const isNormalDay = true; // В реальности нужно проверить календарь
    const closeHour = isNormalDay ? 16 : 13;
    const closeMin = closeHour * 60; // в минутах от начала дня
    
    const target1 = (closeMin - 11) * 60; // 11 минут до закрытия в секундах
    const target2 = (closeMin - 2) * 60;  // 2 минуты до закрытия в секундах
    const isWeekday = p.weekday >= 1 && p.weekday <= 5;

    if (isWeekday) {
      if (secOfDay < target1) return target1 - secOfDay;
      if (secOfDay < target2) return target2 - secOfDay;
    }

    // Roll to next weekday
    let daysToAdd = 1;
    let wd = p.weekday;
    let attempts = 0;
    const maxAttempts = 7; // Safety limit for weekday search
    
    while (attempts < maxAttempts) {
      wd = (wd + 1) % 7;
      if (wd >= 1 && wd <= 5) break;
      daysToAdd++;
      attempts++;
    }
    
    // If no weekday found within 7 attempts, fallback to Monday (1)
    if (attempts >= maxAttempts) {
      console.warn('Could not find next weekday, using Monday as fallback');
      daysToAdd = 1;
    }
    const remainingToday = 24 * 3600 - secOfDay;
    const extraFullDays = daysToAdd - 1;
    return remainingToday + extraFullDays * 24 * 3600 + target1;
  }, []);

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
      const mapped = list.map((w: unknown) => {
        const watch = w as Record<string, unknown>;
        return {
          symbol: watch.symbol as string,
          highIBS: watch.highIBS as number,
          lowIBS: watch.lowIBS as number ?? 0.1,
          entryPrice: watch.entryPrice as number | null ?? null,
          isOpenPosition: !!watch.isOpenPosition
        };
      });
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
  }, [secondsUntilNextSignal]);

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
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Глобальный порог уведомлений: {watchThresholdPct}% <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(применяется ко всем отслеживаемым акциям)</span>
        </div>
      )}

      {typeof secondsToNext === 'number' && (
        <div className="text-sm text-gray-600 dark:text-gray-300">
          До следующего подсчёта сигналов: {formatDuration(secondsToNext)}
        </div>
      )}

      {/* Убран блок тестовых уведомлений по запросу */}

      {loading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">Загрузка…</div>
      ) : error ? (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      ) : watches.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">Нет активных наблюдений. Включите мониторинг на вкладке «Результаты».</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="text-left p-3 dark:text-gray-100">Тикер</th>
                <th className="text-left p-3 dark:text-gray-100">IBS вход</th>
                <th className="text-left p-3 dark:text-gray-100">IBS выход</th>
                <th className="text-left p-3 dark:text-gray-100">Цена входа</th>
                <th className="text-left p-3 dark:text-gray-100">Позиция</th>
                <th className="text-left p-3 dark:text-gray-100">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {watches.map(w => (
                <tr key={w.symbol} className="group hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="p-3">
                    <button
                      onClick={() => handleTickerClick(w.symbol)}
                      className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                      title={`Перейти к результатам для ${w.symbol}`}
                    >
                      {w.symbol}
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </td>
                  <td className="p-3 dark:text-gray-300">≤ {(w.lowIBS ?? 0.1).toFixed(2)}</td>
                  <td className="p-3 dark:text-gray-300">≥ {w.highIBS.toFixed(2)}</td>
                  <td className="p-3">
                    {editingPrice?.symbol === w.symbol ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={editingPrice.value}
                          onChange={(e) => setEditingPrice({ symbol: w.symbol, value: e.target.value })}
                          className="w-20 px-2 py-1 text-xs border border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              const price = parseFloat(editingPrice.value);
                              if (!isNaN(price) && price >= 0) {
                                try {
                                  await DatasetAPI.updateTelegramWatch(w.symbol, { 
                                    entryPrice: price > 0 ? price : null 
                                  });
                                  await load();
                                  setEditingPrice(null);
                                } catch (e) {
                                  setError(e instanceof Error ? e.message : 'Не удалось обновить цену');
                                }
                              }
                            }
                            if (e.key === 'Escape') {
                              setEditingPrice(null);
                            }
                          }}
                          autoFocus
                        />
                        <button
                          onClick={async () => {
                            const price = parseFloat(editingPrice.value);
                            if (!isNaN(price) && price >= 0) {
                              try {
                                await DatasetAPI.updateTelegramWatch(w.symbol, { 
                                  entryPrice: price > 0 ? price : null 
                                });
                                await load();
                                setEditingPrice(null);
                              } catch (e) {
                                setError(e instanceof Error ? e.message : 'Не удалось обновить цену');
                              }
                            }
                          }}
                          className="p-1 text-green-600 hover:text-green-800"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setEditingPrice(null)}
                          className="p-1 text-gray-600 hover:text-gray-800"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="dark:text-gray-300">
                          {w.entryPrice != null ? `$${w.entryPrice.toFixed(2)}` : '—'}
                        </span>
                        <button
                          onClick={() => setEditingPrice({ 
                            symbol: w.symbol, 
                            value: w.entryPrice?.toString() || '' 
                          })}
                          className="p-1 text-blue-600 hover:text-blue-800 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Редактировать цену входа"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${w.isOpenPosition ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800' : 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'}`}>
                      {w.isOpenPosition ? 'Открыта' : 'Нет'}
                    </span>
                    {w.isOpenPosition && (
                      <div className="text-xs text-gray-500 mt-1" title="Позиция автоматически определяется по цене входа">
                        ${w.entryPrice?.toFixed(2)}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => setConfirm({ open: true, symbol: w.symbol })}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-600 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-red-900/30"
                      title="Удалить из мониторинга"
                      aria-label="Удалить из мониторинга"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
            <button
              onClick={async () => {
                try {
                  const r = await DatasetAPI.actualizePrices();
                  const message = r.success 
                    ? `Обновлено тикеров: ${r.count}${r.tickers?.length ? ` (${r.tickers.join(', ')})` : ''}`
                    : 'Обновление не выполнено';
                  setInfo({ open: true, title: 'Актуализация цен', message, kind: r.success ? 'success' : 'error' });
                } catch (e) {
                  setInfo({ open: true, title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось выполнить актуализацию', kind: 'error' });
                }
              }}
              className="inline-flex items-center px-3 py-2 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Актуализация цен
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


