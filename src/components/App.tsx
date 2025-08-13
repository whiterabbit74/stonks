import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Settings } from 'lucide-react';
import { useAppStore } from '../stores';
import { DataUpload } from './DataUpload';
import { DataEnhancer } from './DataEnhancer';
// import { StrategySettings } from './StrategySettings';
import { Results } from './Results';
import { TelegramWatches } from './TelegramWatches';
// import { AppSettings } from './AppSettings';
import { createStrategyFromTemplate, STRATEGY_TEMPLATES } from '../lib/strategy';
import { Footer } from './Footer';
import { ThemeToggle } from './ThemeToggle';

type Tab = 'data' | 'enhance' | 'results' | 'watches' | 'splits' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('data');
  const [apiBuildId, setApiBuildId] = useState<string | null>(null);
  const hasAutoNavigatedRef = useRef(false);
  const marketData = useAppStore(s => s.marketData);
  const currentStrategy = useAppStore(s => s.currentStrategy);
  const backtestResults = useAppStore(s => s.backtestResults);
  const runBacktest = useAppStore(s => s.runBacktest);
  const backtestStatus = useAppStore(s => s.backtestStatus);
  const setStrategy = useAppStore(s => s.setStrategy);
  const loadSettingsFromServer = useAppStore(s => s.loadSettingsFromServer);

  // Автоматически создаем IBS стратегию когда есть данные
  useEffect(() => {
    if (marketData.length > 0 && !currentStrategy) {
      const ibsTemplate = STRATEGY_TEMPLATES[0]; // Единственная стратегия
      const strategy = createStrategyFromTemplate(ibsTemplate);
      setStrategy(strategy);
    }
  }, [marketData, currentStrategy, setStrategy, loadSettingsFromServer]);

  // Поддержка hash-навигации (#data|#enhance|#results|#watches|#splits|#settings)
  useEffect(() => {
    const applyHash = () => {
      const h = (window.location.hash || '').replace('#', '');
      if (h === 'data' || h === 'enhance' || h === 'results' || h === 'watches' || h === 'splits' || h === 'settings') {
        setActiveTab(h as Tab);
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  useEffect(() => {
    const current = `#${activeTab}`;
    if (window.location.hash !== current) {
      window.location.hash = current;
    }
  }, [activeTab]);

  // Автоматически запускаем бэктест когда есть данные и стратегия
  useEffect(() => {
    if (marketData.length > 0 && currentStrategy && backtestStatus === 'idle') {
      console.log('Auto-running backtest...');
      runBacktest();
    }
  }, [marketData, currentStrategy, backtestStatus, runBacktest]);

  // Как только появились результаты бэктеста — один раз автоматически переключаемся на вкладку результатов
  useEffect(() => {
    if (
      backtestResults &&
      activeTab === 'data' &&
      !hasAutoNavigatedRef.current
    ) {
      setActiveTab('results');
      hasAutoNavigatedRef.current = true;
    }
  }, [backtestResults, activeTab]);

  const tabs = [
    { id: 'data' as Tab, label: 'Данные', enabled: true },
    { id: 'enhance' as Tab, label: 'New data', enabled: true },
    { id: 'results' as Tab, label: 'Результаты', enabled: true },
    { id: 'watches' as Tab, label: 'Мониторинг', enabled: true },
    { id: 'splits' as Tab, label: 'Сплиты', enabled: true },
    { id: 'settings' as Tab, label: 'Настройки', enabled: true },
  ] as const;


  useEffect(() => {
    (async () => {
      try {
        const base = window.location.href.includes('/stonks') ? '/stonks/api' : '/api';
        const r = await fetch(`${base}/auth/check`, { credentials: 'include' });
        if (r.ok) setAuthorized(true);
      } catch (e) {
        console.warn('Auth check failed', e);
      }
      setCheckingAuth(false);
    })();
  }, []);

  // Fetch API build id for reliable display
  useEffect(() => {
    (async () => {
      try {
        const base = window.location.href.includes('/stonks') ? '/stonks/api' : '/api';
        const r = await fetch(`${base}/status`, { credentials: 'include', cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          setApiBuildId(j?.timestamp || null);
        }
      } catch (e) {
        console.warn('Status fetch failed', e);
      }
    })();
  }, []);

  if (checkingAuth) {
    return <div className="min-h-screen flex items-center justify-center text-gray-600 dark:bg-gray-950 dark:text-gray-300">Проверка доступа…</div>;
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col dark:bg-gray-950">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-xl border shadow p-6 dark:bg-gray-900 dark:border-gray-800">
            <h2 className="text-xl font-semibold text-gray-900 mb-1 dark:text-gray-100">Доступ к приложению</h2>
            <p className="text-sm text-gray-600 mb-4 dark:text-gray-400">Введите пароль</p>
            {loginError && <div className="mb-3 text-sm text-red-600 dark:text-red-400">{loginError}</div>}
            <input
              type="email"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              className="w-full px-3 py-2 border rounded-md mb-3 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              placeholder="Email"
            />
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="w-full px-3 py-2 border rounded-md mb-3 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              placeholder="Пароль"
            />
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 mb-4 dark:text-gray-300">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
              Запомнить меня (30 дней)
            </label>
            <button
              onClick={async () => {
                setLoginError(null);
                try {
                  const base = window.location.href.includes('/stonks') ? '/stonks/api' : '/api';
                  const r = await fetch(`${base}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ username: usernameInput, password: passwordInput, remember: rememberMe }),
                  });
                  if (!r.ok) {
                    let msg = `${r.status} ${r.statusText}`;
                    const err = await r.json().catch(() => null);
                    if (err && typeof err.error === 'string') msg = err.error;
                    throw new Error(msg);
                  }
                  // Try to capture bearer token from response (optional) and persist
                  try {
                    const json = await r.json();
                    if (json && typeof json.token === 'string') {
                      window.localStorage.setItem('auth_token', json.token);
                    }
                  } catch {}
                  setAuthorized(true);
                  // Eagerly prefetch settings and datasets after login
                  try { await useAppStore.getState().loadSettingsFromServer(); } catch {}
                  try { await useAppStore.getState().loadDatasetsFromServer(); } catch {}
                } catch (e) {
                  const msg = e instanceof Error ? e.message : 'Ошибка входа';
                  setLoginError(msg);
                }
              }}
              className="w-full inline-flex items-center justify-center bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              Войти
            </button>
          </div>
        </div>
        <Footer apiBuildId={apiBuildId} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col dark:bg-gray-950">
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2 dark:text-gray-100">
                  IBS Trading Backtester
                </h1>
                <div className="text-gray-600 flex flex-wrap items-center gap-3 dark:text-gray-400">
                  <span>Internal Bar Strength Mean Reversion Strategy</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ThemeToggle />
                {currentStrategy && (
                  <button
                    onClick={() => setActiveTab('settings')}
                    className="p-2 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 border border-gray-200 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800 dark:border-gray-700"
                    aria-label="Настройки"
                    title="Настройки"
                  >
                    <Settings className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="border-b border-gray-200 mb-8 dark:border-gray-800">
            <nav className="flex space-x-8">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { if (tab.enabled) setActiveTab(tab.id); }}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : tab.enabled
                      ? 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
                      : 'border-transparent text-gray-300 cursor-not-allowed dark:text-gray-600'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-lg shadow p-6 dark:bg-gray-900 dark:text-gray-100">
            {activeTab === 'data' && (
              <DataUpload onNext={() => setActiveTab('results')} />
            )}
            {activeTab === 'enhance' && (
              <DataEnhancer onNext={() => setActiveTab('results')} />
            )}
            {activeTab === 'results' && <Results />}
            {activeTab === 'watches' && <TelegramWatches />}
            {activeTab === 'splits' && <SplitsTab />}
            {activeTab === 'settings' && <AppSettings />}
          </div>

          {/* Strategy Settings Modal */}
            {showSettings && currentStrategy && (
            <StrategySettings
              strategy={currentStrategy}
              onSave={(updatedStrategy) => {
                setStrategy(updatedStrategy);
                // Перезапускаем бэктест, чтобы метрики обновились сразу
                runBacktest();
                setShowSettings(false);
              }}
              onClose={() => setShowSettings(false)}
            />
          )}
        </div>
      </div>
      <Footer apiBuildId={apiBuildId} />
    </div>
  );
}