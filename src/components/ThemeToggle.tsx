'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export type ThemeMode = 'light' | 'dark';

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = localStorage.getItem('theme_mode');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {}
  return 'light';
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }
  try {
    localStorage.setItem('theme_mode', mode);
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('theme-change', { detail: mode }));
  }
}

interface ThemeToggleProps {
  variant?: 'menu' | 'header' | 'portal-menu';
}

export default function ThemeToggle({ variant = 'menu' }: ThemeToggleProps) {
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = getStoredTheme();
    setTheme(initial);
    applyTheme(initial);
    setMounted(true);

    const onThemeChange = (e: Event) => {
      const custom = e as CustomEvent<ThemeMode>;
      if (custom.detail === 'dark' || custom.detail === 'light') {
        setTheme(custom.detail);
      } else {
        setTheme(getStoredTheme());
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'theme_mode') {
        const next = getStoredTheme();
        setTheme(next);
        applyTheme(next);
      }
    };

    window.addEventListener('theme-change', onThemeChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('theme-change', onThemeChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const toggle = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  const isDark = mounted && theme === 'dark';

  if (variant === 'header') {
    return (
      <button
        type="button"
        onClick={toggle}
        title={isDark ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
      >
        {isDark ? (
          <>
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Claro</span>
          </>
        ) : (
          <>
            <Moon className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Oscuro</span>
          </>
        )}
      </button>
    );
  }

  if (variant === 'portal-menu') {
    return (
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/70 hover:bg-slate-800 border border-slate-700/70 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2.5">
          {isDark ? (
            <Moon className="w-4 h-4 text-sky-400" />
          ) : (
            <Sun className="w-4 h-4 text-amber-400" />
          )}
          <span>{isDark ? 'Modo Oscuro: Activo' : 'Modo Oscuro'}</span>
        </span>
        <span
          className={`inline-flex items-center w-8 h-4 rounded-full p-0.5 transition-colors ${
            isDark ? 'bg-sky-500 justify-end' : 'bg-slate-600 justify-start'
          }`}
        >
          <span className="w-3 h-3 rounded-full bg-white shadow" />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? 'Desactivar Modo Oscuro (Volver a Modo Claro)' : 'Activar Modo Oscuro'}
      className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 text-xs font-bold text-slate-200 transition-colors cursor-pointer"
    >
      <span className="flex items-center gap-2">
        {isDark ? (
          <Moon className="w-3.5 h-3.5 text-sky-400" />
        ) : (
          <Sun className="w-3.5 h-3.5 text-amber-400" />
        )}
        <span>{isDark ? 'Modo Oscuro' : 'Modo Claro'}</span>
      </span>
      <span
        className={`inline-flex items-center w-8 h-4 rounded-full p-0.5 transition-colors ${
          isDark ? 'bg-sky-500 justify-end' : 'bg-slate-600 justify-start'
        }`}
      >
        <span className="w-3 h-3 rounded-full bg-white shadow" />
      </span>
    </button>
  );
}

