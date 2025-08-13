import { useState, useEffect, useRef } from 'react';
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

  // Загружаем настройки один раз при монтировании
  useEffect(() => {
    loadSettingsFromServer();
  }, [loadSettingsFromServer]);

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
  ];


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

      <Footer apiBuildId={apiBuildId} />
    </div>
  );
}