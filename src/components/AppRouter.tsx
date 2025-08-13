import { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { useAppStore } from '../stores';
import { DataUpload } from './DataUpload';
import { DataEnhancer } from './DataEnhancer';
import { Results } from './Results';
import { TelegramWatches } from './TelegramWatches';
import { SplitsTab } from './SplitsTab';
import { AppSettings } from './AppSettings';
import { Footer } from './Footer';
import { ThemeToggle } from './ThemeToggle';
import { API_BASE_URL } from '../lib/api';

function useBaseName(): string | undefined {
  const base = useMemo(() => {
    try {
      const p = window.location.pathname || '';
      if (p.startsWith('/stonks')) return '/stonks';
    } catch {}
    return undefined;
  }, []);
  return base;
}

function ProtectedLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [apiBuildId, setApiBuildId] = useState<string | null>(null);
  const hasAutoNavigatedRef = useRef(false);

  const marketData = useAppStore(s => s.marketData);
  const currentStrategy = useAppStore(s => s.currentStrategy);
  const backtestResults = useAppStore(s => s.backtestResults);
  const backtestStatus = useAppStore(s => s.backtestStatus);
  const runBacktest = useAppStore(s => s.runBacktest);
  const setStrategy = useAppStore(s => s.setStrategy);
  const loadSettingsFromServer = useAppStore(s => s.loadSettingsFromServer);
  const loadDatasetsFromServer = useAppStore(s => s.loadDatasetsFromServer);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/auth/check`, { credentials: 'include' });
        if (r.ok) {
          setAuthorized(true);
          try { await loadSettingsFromServer(); } catch {}
          try { await loadDatasetsFromServer(); } catch {}
        } else {
          setAuthorized(false);
          navigate('/login', { replace: true, state: { from: location.pathname } });
        }
      } catch {
        setAuthorized(false);
        navigate('/login', { replace: true, state: { from: location.pathname } });
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, [navigate, location.pathname, loadSettingsFromServer, loadDatasetsFromServer]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/status`, { credentials: 'include', cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          setApiBuildId(j?.timestamp || null);
        } else {
          setApiBuildId(null);
        }
      } catch {
        setApiBuildId(null);
      }
    })();
  }, []);

  // Auto-create strategy when data arrives
  useEffect(() => {
    if (marketData.length > 0 && !currentStrategy) {
      // Strategy is auto-created inside components where needed via existing logic;
      // here we ensure runBacktest chain can progress once set externally
      try {
        // setStrategy might be a no-op if strategy is already created elsewhere
        setStrategy(useAppStore.getState().currentStrategy);
      } catch {}
    }
  }, [marketData, currentStrategy, setStrategy]);

  // Auto-run backtest when ready
  useEffect(() => {
    if (marketData.length > 0 && currentStrategy && backtestStatus === 'idle') {
      runBacktest();
    }
  }, [marketData, currentStrategy, backtestStatus, runBacktest]);

  // Navigate to results once available (one-time)
  useEffect(() => {
    if (backtestResults && !hasAutoNavigatedRef.current) {
      hasAutoNavigatedRef.current = true;
      navigate('/results');
    }
  }, [backtestResults, navigate]);

  const tabs = [
    { to: '/data', label: 'Данные' },
    { to: '/enhance', label: 'New data' },
    { to: '/results', label: 'Результаты' },
    { to: '/watches', label: 'Мониторинг' },
    { to: '/splits', label: 'Сплиты' },
    { to: '/settings', label: 'Настройки' },
  ];

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/logout`, { method: 'POST', credentials: 'include' });
    } catch {}
    setAuthorized(false);
    navigate('/login', { replace: true });
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-500">Проверка авторизации…</div>
      </div>
    );
  }
  if (!authorized) {
    return null; // Redirect handled in effect
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 dark:text-gray-100">
      <header className="border-b bg-white/60 backdrop-blur sticky top-0 z-20 dark:bg-slate-900/60 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">Trading strategies</h1>
            {apiBuildId && (
              <span className="text-xs text-gray-500">API build: {apiBuildId}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NavLink to="/settings" className={({ isActive }) => `inline-flex items-center gap-2 text-sm ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'hover:text-indigo-600 dark:hover:text-indigo-400'}`}>
              <Settings size={16} />
              Settings
            </NavLink>
            <button onClick={handleLogout} className="inline-flex items-center gap-2 text-sm text-red-600 hover:text-red-700">
              Выйти
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-4">
          <nav className="flex gap-2 flex-wrap">
            {tabs.map(t => (
              <NavLink key={t.to} to={t.to} className={({ isActive }) => `px-3 py-1 rounded text-sm border ${isActive ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'}`}>
                {t.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <Outlet />
      </main>

      <Footer apiBuildId={apiBuildId} />
    </div>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [loginError, setLoginError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, remember }),
      });
      if (!r.ok) {
        let msg = 'Login failed';
        try { const j = await r.json(); if (j && j.error) msg = j.error; } catch {}
        setLoginError(msg);
        return;
      }
      const to = location.state?.from && location.state.from.startsWith('/') ? location.state.from : '/data';
      setUsername(''); setPassword(''); setRemember(false);
      navigate(to, { replace: true });
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 dark:text-gray-100 flex flex-col">
      <header className="border-b bg-white/60 backdrop-blur sticky top-0 z-20 dark:bg-slate-900/60 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">Trading strategies</h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg border dark:bg-slate-900 dark:border-slate-800">
          <h2 className="text-lg font-semibold mb-3">Вход</h2>
          {loginError && (
            <div className="mb-2 text-sm text-red-600">{loginError}</div>
          )}
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="block text-sm mb-1">Email</label>
              <input type="email" value={username} onChange={e => setUsername(e.target.value)} className="w-full rounded border px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-700" placeholder="you@example.com" autoFocus />
            </div>
            <div>
              <label className="block text-sm mb-1">Пароль</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded border px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-700" placeholder="••••••••" />
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
              Запомнить меня
            </label>
            <div className="flex justify-end gap-2">
              <button type="submit" className="px-3 py-1.5 rounded text-sm bg-indigo-600 text-white hover:bg-indigo-700">Войти</button>
            </div>
          </form>
        </div>
      </main>

      <Footer apiBuildId={null} />
    </div>
  );
}

export default function AppRouter() {
  const basename = useBaseName();
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedLayout />}>
          <Route index element={<Navigate to="/data" replace />} />
          <Route path="/data" element={<DataUpload />} />
          <Route path="/enhance" element={<DataEnhancer />} />
          <Route path="/results" element={<Results />} />
          <Route path="/watches" element={<TelegramWatches />} />
          <Route path="/splits" element={<SplitsTab />} />
          <Route path="/settings" element={<AppSettings />} />
        </Route>
        <Route path="*" element={<Navigate to="/data" replace />} />
      </Routes>
    </BrowserRouter>
  );
}