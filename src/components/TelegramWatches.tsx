import { useEffect, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { DatasetAPI } from '../lib/api';
import { ConfirmModal } from './ConfirmModal';
import { InfoModal } from './InfoModal';

interface WatchItem {
  symbol: string;
  highIBS: number;
  thresholdPct: number;
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

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const list = await DatasetAPI.listTelegramWatches();
      setWatches(list);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить список');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Мониторинг</h2>
        <button
          onClick={load}
          className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-800"
          title="Обновить список"
          aria-label="Обновить список"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Убран блок тестовых уведомлений по запросу */}

      {loading ? (
        <div className="text-sm text-gray-500">Загрузка…</div>
      ) : error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : watches.length === 0 ? (
        <div className="text-sm text-gray-500">Нет активных наблюдений. Включите мониторинг из вкладки «Результаты».</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3">Тикер</th>
                <th className="text-left p-3">High IBS</th>
                <th className="text-left p-3">Порог близости, %</th>
                <th className="text-left p-3">Цена входа</th>
                <th className="text-left p-3">Позиция</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {watches.map(w => (
                <tr key={w.symbol} className="hover:bg-gray-50">
                  <td className="p-3 font-medium">{w.symbol}</td>
                  <td className="p-3">{w.highIBS}</td>
                  <td className="p-3">{w.thresholdPct}</td>
                  <td className="p-3">{w.entryPrice != null ? w.entryPrice.toFixed(2) : '—'}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${w.isOpenPosition ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>{w.isOpenPosition ? 'Открыта' : 'Нет'}</span>
                      <button
                        onClick={() => setConfirm({ open: true, symbol: w.symbol })}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-600 hover:bg-red-50 hover:text-red-600"
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
          catch (e:any) { setInfo({ open: true, title: 'Ошибка', message: e?.message || 'Не удалось удалить', kind: 'error' }); }
          finally { setConfirm({ open: false, symbol: null }); }
        }}
        onClose={() => setConfirm({ open: false, symbol: null })}
      />
      <InfoModal open={info.open} title={info.title} message={info.message} kind={info.kind as any} onClose={() => setInfo({ open: false, title: '', message: '' })} />
    </div>
  );
}


