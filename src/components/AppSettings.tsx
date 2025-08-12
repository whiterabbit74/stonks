import { useEffect, useState } from 'react';
import { DatasetAPI } from '../lib/api';
import { useAppStore } from '../stores';
import { StrategySettings } from './StrategySettings';

export function AppSettings() {
  const loadSettingsFromServer = useAppStore(s => s.loadSettingsFromServer);
  const saveSettingsToServer = useAppStore(s => s.saveSettingsToServer);
  const resultsQuoteProvider = useAppStore(s => s.resultsQuoteProvider);
  const resultsRefreshProvider = useAppStore(s => s.resultsRefreshProvider);
  const enhancerProvider = useAppStore(s => s.enhancerProvider);
  const setResultsQuoteProvider = useAppStore(s => s.setResultsQuoteProvider);
  const setResultsRefreshProvider = useAppStore(s => s.setResultsRefreshProvider);
  const setEnhancerProvider = useAppStore(s => s.setEnhancerProvider);
  const watchThresholdPct = useAppStore(s => s.watchThresholdPct);
  const setWatchThresholdPct = useAppStore(s => s.setWatchThresholdPct);
  const currentStrategy = useAppStore(s => s.currentStrategy);
  const setStrategy = useAppStore(s => s.setStrategy);
  const runBacktest = useAppStore(s => s.runBacktest);

  useEffect(() => { loadSettingsFromServer(); }, [loadSettingsFromServer]);

  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
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

  const saveProviders = async () => {
    setSaving(true); setSaveOk(null); setSaveErr(null);
    try {
      await saveSettingsToServer();
      setSaveOk('Сохранено');
    } catch (e: any) {
      setSaveErr(e?.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Настройки</h2>

      {/* Параметры стратегии */}
      {currentStrategy && (
        <div className="p-4 rounded-lg border">
          <div className="text-sm font-medium text-gray-700 mb-3">Параметры стратегии</div>
          <StrategySettings
            strategy={currentStrategy}
            onSave={(updated) => { setStrategy(updated); runBacktest(); }}
            onClose={() => {}}
            mode="inline"
          />
        </div>
      )}

      {/* Уведомления */}
      <div className="p-4 rounded-lg border">
        <div className="text-sm font-medium text-gray-700 mb-2">Уведомления</div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Граница близости к IBS-цели для уведомления (%)</label>
        <p className="text-xs text-gray-500 mb-2">Диапазон 0–20%. По умолчанию 5%.</p>
        <div className="flex items-center gap-4">
          <input type="range" min={0} max={20} step={0.5} value={watchThresholdPct} onChange={(e)=>setWatchThresholdPct(Number(e.target.value))} className="flex-1" />
          <input type="number" min={0} max={20} step={0.5} value={watchThresholdPct} onChange={(e)=>setWatchThresholdPct(Number(e.target.value))} className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <span className="text-sm text-gray-500">%</span>
        </div>
      </div>

      {/* Провайдеры данных */}
      <div className="p-4 rounded-lg border">
        <div className="text-sm font-medium text-gray-700 mb-3">Провайдеры данных</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded p-3 border">
            <div className="text-xs text-gray-500 mb-2">Котировки (страница «Результаты»)</div>
            <label className="flex items-center gap-2 text-sm mb-1">
              <input type="radio" name="quoteProvider" checked={resultsQuoteProvider === 'finnhub'} onChange={() => setResultsQuoteProvider('finnhub')} />
              Finnhub
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="quoteProvider" checked={resultsQuoteProvider === 'alpha_vantage'} onChange={() => setResultsQuoteProvider('alpha_vantage')} />
              Alpha Vantage
            </label>
          </div>

          <div className="bg-gray-50 rounded p-3 border">
            <div className="text-xs text-gray-500 mb-2">Актуализация датасета (серверный refresh)</div>
            <label className="flex items-center gap-2 text-sm mb-1">
              <input type="radio" name="refreshProvider" checked={resultsRefreshProvider === 'finnhub'} onChange={() => setResultsRefreshProvider('finnhub')} />
              Finnhub
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="refreshProvider" checked={resultsRefreshProvider === 'alpha_vantage'} onChange={() => setResultsRefreshProvider('alpha_vantage')} />
              Alpha Vantage
            </label>
          </div>

          <div className="bg-gray-50 rounded p-3 border">
            <div className="text-xs text-gray-500 mb-2">Импорт «New data» (энхансер)</div>
            <label className="flex items-center gap-2 text-sm mb-1">
              <input type="radio" name="enhancerProvider" checked={enhancerProvider === 'alpha_vantage'} onChange={() => setEnhancerProvider('alpha_vantage')} />
              Alpha Vantage
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="enhancerProvider" checked={enhancerProvider === 'finnhub'} onChange={() => setEnhancerProvider('finnhub')} />
              Finnhub
            </label>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={saveProviders} disabled={saving} className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:bg-gray-400">
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          {saveOk && <span className="text-sm text-green-600">{saveOk}</span>}
          {saveErr && <span className="text-sm text-red-600">{saveErr}</span>}
        </div>
        <div className="text-xs text-gray-500 mt-2">Подсказки: Alpha Vantage может возвращать лимит на сплиты и adjusted данные. Для refresh лучше использовать тот провайдер, который стабильно доступен на вашем тарифе.</div>
      </div>
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



