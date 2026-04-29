import { useState, useEffect } from 'react';

export function useTheme() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem('livehoops_theme') || 'dark'
  );

  useEffect(() => {
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(`theme-${theme}`);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('livehoops_theme', next);
      return next;
    });
  };

  return { theme, toggleTheme, isDark: theme === 'dark' };
}
