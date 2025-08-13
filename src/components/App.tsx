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
    <div className="min-h-screen bg-gray-50 text-gray-800 dark:text-gray-100">
      {/* Floating theme toggle in top-right corner */}
      <div className="fixed top-3 right-3 z-50">
        <ThemeToggle />
      </div>

      <header className="border-b bg-white/60 backdrop-blur sticky top-0 z-20 dark:bg-slate-900/60 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Removed ThemeToggle from here to place it in the top-right corner */}
            <h1 className="text-lg font-semibold tracking-tight">Trading strategies</h1>
            {apiBuildId && (
              <span className="text-xs text-gray-500 dark:text-gray-400">API build: {apiBuildId}</span>
            )}
            {activeTab === 'enhance' && (
              <DataEnhancer onNext={() => setActiveTab('results')} />
            )}
            {activeTab === 'results' && <Results />}
            {activeTab === 'watches' && <TelegramWatches />}
            {activeTab === 'splits' && <SplitsTab />}
            {activeTab === 'settings' && <AppSettings />}
          </div>
          <div className="flex items-center gap-2">
            <a className="inline-flex items-center gap-2 text-sm hover:text-indigo-600 dark:hover:text-indigo-400" href="#settings">
              <Settings size={16} />
              Settings
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-4">
          <nav className="flex gap-2 flex-wrap">
            {tabs.map(t => (
              <button
                key={t.id}
                disabled={!t.enabled}
                onClick={() => setActiveTab(t.id)}
                className={`${activeTab === t.id
                  ? 'px-3 py-1 rounded text-sm border bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500'
                  : 'px-3 py-1 rounded text-sm border bg-white hover:bg-gray-50 text-gray-700 border-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-gray-200 dark:border-slate-700'}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'data' && <DataUpload />}
        {activeTab === 'enhance' && <DataEnhancer />}
        {activeTab === 'results' && <Results />}
        {activeTab === 'watches' && <TelegramWatches />}
        {activeTab === 'splits' && <SplitsTab />}
        {activeTab === 'settings' && <AppSettings />}
      </main>

      <Footer authorized={authorized} checkingAuth={checkingAuth} loginError={loginError} setLoginError={setLoginError} usernameInput={usernameInput} setUsernameInput={setUsernameInput} passwordInput={passwordInput} setPasswordInput={setPasswordInput} rememberMe={rememberMe} setRememberMe={setRememberMe} />
    </div>
  );
}