import { useState, useEffect, useCallback } from 'react';
import { ACCENTS, DEFAULT_ACCENT, resolveAccent } from '../utils/accents';

// Re-exported so components can render the picker without importing two
// modules for one feature.
export { ACCENTS, DEFAULT_ACCENT };

const THEME_KEY  = 'livehoops_theme';
const ACCENT_KEY = 'livehoops_accent';

export function useTheme() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem(THEME_KEY) || 'dark'
  );

  // Which accent colour the user picked. resolveAccent guards the read: this
  // value survives app versions and is editable by hand, so it can hold a
  // colour that no longer exists.
  const [accent, setAccentState] = useState(
    () => resolveAccent(localStorage.getItem(ACCENT_KEY))
  );

  useEffect(() => {
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(`theme-${theme}`);
  }, [theme]);

  // The [data-accent="…"] blocks in index.css hang off this attribute. It sits
  // on <body> next to the theme class so the two combine — each accent has a
  // different value per theme.
  useEffect(() => {
    document.body.dataset.accent = accent;
  }, [accent]);

  // Keep the browser/OS UI tint in step with the accent — on Android Chrome
  // and installed PWAs this colours the status bar, so leaving it fixed would
  // frame a purple app in orange.
  //
  // The value is read back out of the stylesheet rather than duplicated from
  // the ACCENTS table, so the tag can't drift from what's actually rendering,
  // and it automatically picks up the theme-specific variant.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const resolved = getComputedStyle(document.body)
      .getPropertyValue('--accent')
      .trim();
    if (resolved) meta.setAttribute('content', resolved);
  }, [theme, accent]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  const setAccent = useCallback((id) => {
    const next = resolveAccent(id);
    localStorage.setItem(ACCENT_KEY, next);
    setAccentState(next);
  }, []);

  return { theme, toggleTheme, isDark: theme === 'dark', accent, setAccent };
}
