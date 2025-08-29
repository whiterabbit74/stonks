import React, { useEffect, useState } from 'react';
import { Laptop, Moon, Sun } from 'lucide-react';

export type ThemeMode = 'auto' | 'dark' | 'light';

function applyTheme(mode: ThemeMode) {
  try {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const effectiveDark = mode === 'dark' || (mode === 'auto' && prefersDark);
    const html = document.documentElement;
    html.classList.add('theme-changing');
    html.dataset.theme = mode;
    if (effectiveDark) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', effectiveDark ? '#0b1220' : '#ffffff');
    setTimeout(() => { try { html.classList.remove('theme-changing'); } catch {} }, 80);
    try {
      window.dispatchEvent(new CustomEvent('themechange', { detail: { mode, effectiveDark } }));
    } catch {}
  } catch {}
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>('auto');

  useEffect(() => {
    try {
      const stored = (localStorage.getItem('theme') as ThemeMode | null) || 'auto';
      setMode(stored);
    } catch {}
  }, []);

  useEffect(() => {
    applyTheme(mode);
    try { localStorage.setItem('theme', mode); } catch {}
  }, [mode]);

  // Update on system theme change while in auto
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { if (mode === 'auto') applyTheme('auto'); };
    try { mq.addEventListener('change', handler); } catch { mq.addListener(handler); }
    return () => { try { mq.removeEventListener('change', handler); } catch { mq.removeListener(handler); } };
  }, [mode]);

  const cycle = () => {
    setMode(prev => prev === 'auto' ? 'dark' : prev === 'dark' ? 'light' : 'auto');
  };

  const icon = mode === 'auto' ? <Laptop className="w-5 h-5" /> : mode === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />;
  const label = mode === 'auto' ? 'Авто' : mode === 'dark' ? 'Тёмная' : 'Светлая';

  return (
    <button
      onClick={cycle}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-gray-200 text-gray-700 hover:text-gray-900 hover:bg-gray-100 bg-white/80 backdrop-blur-sm shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:text-gray-200 dark:hover:text-white dark:hover:bg-slate-700/80 dark:bg-slate-800/80 dark:backdrop-blur-sm dark:shadow-sm dark:focus-visible:ring-offset-slate-900 transition-colors"
      title={`Тема: ${label}`}
      aria-label={`Тема: ${label}`}
    >
      {icon}
      <span className="hidden sm:inline text-sm">{label}</span>
    </button>
  );
}