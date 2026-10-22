import { useEffect, useState } from 'react';

/** The saved theme, else the system preference. */
export function initialTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem('va-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('va-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return { theme, toggleTheme, setTheme };
}