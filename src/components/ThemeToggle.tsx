import { useEffect, useState } from 'react';
import { Laptop, Moon, Sun } from 'lucide-react';
import { LS } from '../constants';
import { IconButton } from './ui/IconButton';

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
    setTimeout(() => { try { html.classList.remove('theme-changing'); } catch {
      // Ignore theme transition errors
    } }, 80);
    try {
      window.dispatchEvent(new CustomEvent('themechange', { detail: { mode, effectiveDark } }));
    } catch {
      // Ignore event dispatch errors
    }
  } catch {
    // Ignore theme application errors
  }
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>('auto');

  useEffect(() => {
    try {
      const stored = (localStorage.getItem(LS.THEME) as ThemeMode | null) || 'auto';
      setMode(stored);
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  useEffect(() => {
    applyTheme(mode);
    try { localStorage.setItem(LS.THEME, mode); } catch {
      // Ignore localStorage errors
    }
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
    <IconButton
      onClick={cycle}
      variant="glass"
      size="lg"
      title={`Тема: ${label}`}
      aria-label={`Тема: ${label}`}
    >
      {icon}
    </IconButton>
  );
}
