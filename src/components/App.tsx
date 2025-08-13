import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Settings } from 'lucide-react';
import { useAppStore } from '../stores';
import { DataUpload } from './DataUpload';
import { DataEnhancer } from './DataEnhancer';
// import { StrategySettings } from './StrategySettings';
import { Results } from './Results';
import { TelegramWatches } from './TelegramWatches';
import { SplitsTab } from './SplitsTab';
import { AppSettings } from './AppSettings';
import { createStrategyFromTemplate, STRATEGY_TEMPLATES } from '../lib/strategy';
import { Footer } from './Footer';
import { ThemeToggle } from './ThemeToggle';

type Tab = 'data' | 'enhance' | 'results' | 'watches' | 'splits' | 'settings';

export default function App() {
  const [authorized, setAuthorized] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<Tab>('data');
  const [apiBuildId, setApiBuildId] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);
  const hasAutoNavigatedRef = useRef(false);
  const marketData = useAppStore(s => s.marketData);
  const currentStrategy = useAppStore(s => s.currentStrategy);
  const backtestResults = useAppStore(s => s.backtestResults);
  const runBacktest = useAppStore(s => s.runBacktest);
  const backtestStatus = useAppStore(s => s.backtestStatus);
  const setStrategy = useAppStore(s => s.setStrategy);
  const loadSettingsFromServer = useAppStore(s => s.loadSettingsFromServer);
  const loadDatasetsFromServer = useAppStore(s => s.loadDatasetsFromServer);

  // Загружаем настройки один раз при монтировании
  useEffect(() => {
    loadSettingsFromServer();
  }, [loadSettingsFromServer]);

  // После успешного логина — обновляем настройки и список датасетов
  useEffect(() => {
    if (authorized) {
      loadSettingsFromServer();
      loadDatasetsFromServer();
    }
  }, [authorized, loadSettingsFromServer, loadDatasetsFromServer]);

  // Автоматически создаем IBS стратегию когда есть данные
  useEffect(() => {
    if (marketData.length > 0 && !currentStrategy) {
      const ibsTemplate = STRATEGY_TEMPLATES[0]; // Единственная стратегия
      const strategy = createStrategyFromTemplate(ibsTemplate);
      setStrategy(strategy);
    }
  }, [marketData, currentStrategy, setStrategy]);

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
        let headers: Record<string, string> = {};
        try {
          const t = window.localStorage.getItem('auth_token');
          if (t) headers = { Authorization: `Bearer ${t}` };
        } catch { void 0; }
        const r = await fetch(`${base}/auth/check`, { credentials: 'include', headers });
        if (r.ok) setAuthorized(true);
      } catch (e) {
        console.warn('Auth check failed', e);
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      setAuthorized(false);
      setLoginError('Сессия истекла. Пожалуйста, войдите снова.');
    };
    window.addEventListener('app:unauthorized', onUnauthorized);
    return () => window.removeEventListener('app:unauthorized', onUnauthorized);
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
      } catch {
        setApiBuildId(null);
      }
    })();
  }, []);

  const handleLogout = async () => {
    try {
      const base = window.location.href.includes('/stonks') ? '/stonks/api' : '/api';
      await fetch(`${base}/logout`, { method: 'POST', credentials: 'include' });
    } catch {}
    try { window.localStorage.removeItem('auth_token'); } catch {}
    setAuthorized(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 dark:text-gray-100">
      {/* Floating theme toggle in top-right corner */}
      <div className="fixed top-3 right-3 z-50">
        <ThemeToggle />
      </div>

      <header className="border-b bg-white/60 backdrop-blur sticky top-0 z-40 dark:bg-slate-900/60 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Removed ThemeToggle from here to place it in the top-right corner */}
            <h1 className="text-lg font-semibold tracking-tight">Trading strategies</h1>
            {apiBuildId && (
              <span className="text-xs text-gray-500 dark:text-gray-400">API build: {apiBuildId}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <a className="inline-flex items-center gap-2 text-sm hover:text-indigo-600 dark:hover:text-indigo-400" href="#settings">
              <Settings size={16} />
              Settings
            </a>
            {authorized && (
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 text-sm px-3 py-1 rounded border bg-white hover:bg-gray-50 text-gray-700 border-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-gray-200 dark:border-slate-700"
                title="Выйти из аккаунта"
              >
                Выйти
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {showLogin ? (
          <div className="max-w-md mx-auto bg-white border border-gray-200 rounded-lg p-4 shadow-sm dark:bg-slate-900 dark:border-slate-800">
            <h2 className="text-base font-semibold mb-3">Вход</h2>
            <form className="space-y-3" onSubmit={handleLogin}>
              <div>
                <label className="block text-sm text-gray-600 mb-1 dark:text-gray-300">Email</label>
                <input
                  type="email"
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-gray-100"
                  placeholder="user@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1 dark:text-gray-300">Пароль</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-gray-100"
                  required
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                Запомнить меня
              </label>
              {loginError && <div className="text-sm text-red-600">{loginError}</div>}
              <div className="flex gap-2">
                <button type="submit" className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm">Войти</button>
              </div>
            </form>
          </div>
        ) : (
          <>
            {/* Navigation Tabs */}
            <div className="border-b border-gray-200 mb-8 dark:border-gray-800">
              <nav className="flex space-x-8">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => { if (tab.enabled) setActiveTab(tab.id); }}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                        : tab.enabled
                        ? 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600'
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
              {activeTab === 'data' && <DataUpload onNext={() => setActiveTab('results')} />}
              {activeTab === 'enhance' && <DataEnhancer onNext={() => setActiveTab('results')} />}
              {activeTab === 'results' && <Results />}
              {activeTab === 'watches' && <TelegramWatches />}
              {activeTab === 'splits' && <SplitsTab />}
              {activeTab === 'settings' && <AppSettings />}
            </div>
          </>
        )}
      </main>

      <Footer apiBuildId={apiBuildId} />
    </div>
  );
}