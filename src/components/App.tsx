import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Settings } from 'lucide-react';
import { useAppStore } from '../stores';
import { DataUpload } from './DataUpload';
import { DataEnhancer } from './DataEnhancer';
// import { StrategySettings } from './StrategySettings';
import { Results } from './Results';
import { TelegramWatches } from './TelegramWatches';
import { AppSettings } from './AppSettings';
import { createStrategyFromTemplate, STRATEGY_TEMPLATES } from '../lib/strategy';
import { Footer } from './Footer';
import { API_BASE_URL } from '../lib/api';
import { ThemeToggle } from './ThemeToggle';
import { Logo } from './Logo';

type Tab = 'data' | 'enhance' | 'results' | 'watches' | 'settings';

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
  const loadDatasetsFromServer = useAppStore(s => s.loadDatasetsFromServer);

  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showLogin, setShowLogin] = useState(false);


  // Автоматически создаем IBS стратегию когда есть данные
  useEffect(() => {
    if (marketData.length > 0 && !currentStrategy) {
      const ibsTemplate = STRATEGY_TEMPLATES[0]; // Единственная стратегия
      const strategy = createStrategyFromTemplate(ibsTemplate);
      setStrategy(strategy);
    }
  }, [marketData, currentStrategy, setStrategy]);

  // Поддержка hash-навигации (#data|#enhance|#results|#watches|#settings)
  useEffect(() => {
    const applyHash = () => {
      const h = (window.location.hash || '').replace('#', '');
      if (h === 'data' || h === 'enhance' || h === 'results' || h === 'watches' || h === 'settings') {
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
    { id: 'enhance' as Tab, label: 'Новые данные', enabled: true },
    { id: 'results' as Tab, label: 'Результаты', enabled: true },
    { id: 'watches' as Tab, label: 'Мониторинг', enabled: true },
  ] as const;

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/logout`, { method: 'POST', credentials: 'include' });
    } catch (e) {
      console.warn('Logout failed', e);
    } finally {
      setAuthorized(false);
    }
  };

  const handleLogin = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setLoginError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput, remember: rememberMe }),
      });
      if (!r.ok) {
        let msg = 'Ошибка входа';
        try { const j = await r.json(); if (j && j.error) msg = j.error; } catch {
          // Ignore JSON parsing errors
        }
        setLoginError(msg);
        return;
      }
      setAuthorized(true);
      setShowLogin(false);
      setUsernameInput('');
      setPasswordInput('');
      setRememberMe(false);
      try { await loadSettingsFromServer(); } catch {
        // Ignore settings loading errors
      }
      try { await loadDatasetsFromServer(); } catch {
        // Ignore datasets loading errors
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Ошибка входа');
    }
  };

  // Check auth on mount
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/auth/check`, { credentials: 'include' });
        if (r.ok) {
          setAuthorized(true);
          try { await loadSettingsFromServer(); } catch {
            // Ignore settings loading errors on mount
          }
          try { await loadDatasetsFromServer(); } catch {
            // Ignore datasets loading errors on mount
          }
        }
      } catch (e) {
        console.warn('Auth check failed', e);
      }
      setCheckingAuth(false);
    })();
  }, [loadSettingsFromServer, loadDatasetsFromServer]);

  useEffect(() => {
    if (!checkingAuth && !authorized) {
      setShowLogin(true);
    }
  }, [checkingAuth, authorized]);

  // Fetch API build id for reliable display
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/status`, { credentials: 'include', cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          setApiBuildId(j?.timestamp || null);
        }
      } catch {
        setApiBuildId(null);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-800 dark:text-gray-100">
      <header className="border-b bg-white/60 backdrop-blur dark:bg-slate-900/60 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <Logo size="sm" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-gray-200 text-gray-700 hover:text-gray-900 hover:bg-gray-100 bg-white/80 backdrop-blur-sm shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:text-gray-200 dark:hover:text-white dark:hover:bg-slate-700/80 dark:bg-slate-800/80 dark:backdrop-blur-sm dark:shadow-sm" href="#settings" title="Настройки" aria-label="Настройки">
              <Settings className="w-5 h-5" />
            </a>
            {authorized && (
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded border bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-800 dark:hover:bg-gray-800"
              >
                Выйти
              </button>
            )}
            {!authorized && (
              <button
                onClick={() => setShowLogin(true)}
                className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded border bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-800 dark:hover:bg-gray-800"
              >
                Войти
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 pt-8 pb-32 safe-area-pb">
        <div className="mb-4">
          <nav className="flex gap-2 flex-wrap">
            {tabs.map(t => (
              <button
                key={t.id}
                disabled={!t.enabled}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1 rounded text-sm border ${activeTab === t.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'}`}
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
        {activeTab === 'settings' && <AppSettings />}
      </main>

      {showLogin && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg border dark:bg-slate-900 dark:border-slate-800">
            <h2 className="text-lg font-semibold mb-3">Вход</h2>
            {loginError && (
              <div className="mb-2 text-sm text-red-600">
                {loginError}
              </div>
            )}
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="block text-sm mb-1">Эл. почта</label>
                <input
                  type="email"
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value)}
                  className="w-full rounded border px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-700"
                  placeholder="ivan@example.com"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Пароль</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  className="w-full rounded border px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-700"
                  placeholder="••••••••"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                Запомнить меня
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowLogin(false)}
                  className="px-3 py-1.5 rounded border text-sm bg-white hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded text-sm bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Войти
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer apiBuildId={apiBuildId} />
    </div>
  );
}