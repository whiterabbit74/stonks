import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Settings, Menu, X } from 'lucide-react';

import { useAppStore } from '../stores';
import { DataUpload } from './DataUpload';
import { DataEnhancer } from './DataEnhancer';
import { Results } from './Results';
import { TelegramWatches } from './TelegramWatches';
import { AppSettings } from './AppSettings';

import { SplitsTab } from './SplitsTab';
import { CalendarPage } from './CalendarPage';
import { Footer } from './Footer';
import { ThemeToggle } from './ThemeToggle';
import { Logo } from './Logo';
import { API_BASE_URL } from '../lib/api';

// App is now always served from root '/'

function ProtectedLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
          try { await loadSettingsFromServer(); } catch {
            // Ignore settings loading errors
          }
          try { await loadDatasetsFromServer(); } catch {
            // Ignore datasets loading errors
          }
        } else {
          setAuthorized(false);
          navigate('/login', { replace: true, state: { from: location.pathname } });
        }
      } catch {
        // Ignore auth check errors
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
      } catch {
        // Ignore strategy setting errors
      }
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
    { to: '/enhance', label: 'Новые данные' },
    { to: '/results', label: 'Результаты' },
    { to: '/calendar', label: 'Календарь' },
    { to: '/split', label: 'Сплиты' },
    { to: '/watches', label: 'Мониторинг' },
  ];

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/logout`, { method: 'POST', credentials: 'include' });
    } catch {
      // Ignore logout errors
    }
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
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-800 dark:text-gray-100">
      {/* Skip to main content link */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:rounded"
      >
        Перейти к основному содержимому
      </a>
      <header className="border-b bg-white/60 backdrop-blur dark:bg-slate-900/60 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size="sm" showText={false} />
            <span className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              IBS Trading Strategy
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NavLink to="/settings" title="Настройки" aria-label="Настройки" className={({ isActive }) => `inline-flex items-center gap-2 px-3 py-2 rounded-full border ${isActive ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-700 hover:text-gray-900 hover:bg-gray-100 bg-white/80 backdrop-blur-sm shadow-sm dark:border-slate-700 dark:text-gray-200 dark:hover:text-white dark:hover:bg-slate-700/80 dark:bg-slate-800/80 dark:backdrop-blur-sm dark:shadow-sm'}`}>
              <Settings className="w-5 h-5" />
            </NavLink>
            {/* Mobile menu button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden inline-flex items-center gap-2 px-3 py-2 rounded-full border border-gray-200 text-gray-700 hover:text-gray-900 hover:bg-gray-100 bg-white/80 backdrop-blur-sm shadow-sm dark:border-slate-700 dark:text-gray-200 dark:hover:text-white dark:hover:bg-slate-700/80 dark:bg-slate-800/80 dark:backdrop-blur-sm dark:shadow-sm"
              title="Меню"
              aria-label="Открыть меню"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <button onClick={handleLogout} className="hidden md:inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded border bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-800 dark:hover:bg-gray-800">
              Выйти
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white/95 backdrop-blur-sm dark:bg-slate-900/95">
            <div className="px-4 py-3 space-y-2">
              {tabs.map(t => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  onClick={closeMobileMenu}
                  className={({ isActive }) => `block px-3 py-2 rounded-md text-base font-medium transition-colors ${isActive ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-200 dark:hover:bg-slate-700 dark:hover:text-white'}`}
                >
                  {t.label}
                </NavLink>
              ))}
              <button
                onClick={handleLogout}
                className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-200 dark:hover:bg-slate-700 dark:hover:text-white"
              >
                Выйти
              </button>
            </div>
          </div>
        )}
      </header>

      <main id="main-content" className="flex-1 w-full px-4 sm:px-6 lg:px-8 pt-6 pb-24 safe-area-pb">
        <div className="mb-4">
          {/* Desktop navigation */}
          <nav className="hidden md:flex gap-2 flex-wrap">
            {tabs.map(t => (
              <NavLink key={t.to} to={t.to} className={({ isActive }) => `px-3 py-1 rounded text-sm border ${isActive ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-800 dark:hover:bg-gray-800'}`}>
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
        let msg = 'Ошибка входа';
        try { const j = await r.json(); if (j && j.error) msg = j.error; } catch {
          // Ignore JSON parsing errors
        }
        setLoginError(msg);
        return;
      }
      const to = location.state?.from && location.state.from.startsWith('/') ? location.state.from : '/data';
      setUsername(''); setPassword(''); setRemember(false);
      navigate(to, { replace: true });
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Ошибка входа');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 dark:text-gray-100 flex flex-col">
      <header className="border-b bg-white/60 backdrop-blur dark:bg-slate-900/60 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size="sm" showText={false} />
            <span className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              IBS Trading Strategy
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-24 safe-area-pb">
        <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg border dark:bg-gray-900 dark:border-gray-800">
          <h2 className="text-lg font-semibold mb-3">Вход</h2>
          {loginError && (
            <div className="mb-2 text-sm text-red-600">{loginError}</div>
          )}
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="block text-sm mb-1">Эл. почта</label>
              <input type="email" value={username} onChange={e => setUsername(e.target.value)} className="w-full rounded border px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" placeholder="ivan@example.com" autoFocus />
            </div>
            <div>
              <label className="block text-sm mb-1">Пароль</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded border px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" placeholder="••••••••" />
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
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedLayout />}>
          <Route index element={<Navigate to="/data" replace />} />
          <Route path="/data" element={<DataUpload />} />
          <Route path="/enhance" element={<DataEnhancer />} />
          <Route path="/results" element={<Results />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/split" element={<SplitsTab />} />
          <Route path="/watches" element={<TelegramWatches />} />
          <Route path="/settings" element={<AppSettings />} />
        </Route>
        <Route path="*" element={<Navigate to="/data" replace />} />
      </Routes>
    </BrowserRouter>
  );
}