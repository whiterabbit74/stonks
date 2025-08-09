import { useState } from 'react';
import { DatasetAPI } from '../lib/api';

export function AppSettings() {
  const [testMsg, setTestMsg] = useState('Тестовое сообщение ✅');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const sendTest = async () => {
    setSending(true); setError(null); setOk(null);
    try {
      await DatasetAPI.sendTelegramTest(testMsg);
      setOk('Отправлено');
    } catch (e: any) {
      setError(e?.message || 'Не удалось отправить');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Настройки</h2>
      <div className="p-4 rounded-lg border bg-gray-50">
        <div className="text-sm font-medium text-gray-700 mb-2">Тест сообщения в Telegram</div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={testMsg} onChange={(e)=>setTestMsg(e.target.value)} className="flex-1 min-w-[260px] px-3 py-2 rounded-md border" />
          <button onClick={sendTest} disabled={sending} className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:bg-gray-400">
            {sending ? 'Отправка…' : 'Отправить тест'}
          </button>
        </div>
        {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
        {ok && <div className="text-sm text-green-600 mt-2">{ok}</div>}
      </div>
      <p className="text-xs text-gray-500">Примечание: Telegram бот и чат должны быть настроены на сервере (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`).</p>
    </div>
  );
}



