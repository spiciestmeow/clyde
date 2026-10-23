 import { useState } from 'react';

const THEME_STORAGE_KEY = 'vortex-theme-mode';

function readSavedTheme() {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
  } catch {
    return false;
  }
}

export function useThemeMode() {
  const [dark, setDark] = useState(readSavedTheme);

  const toggleTheme = () => {
    const nextDark = !dark;
    setDark(nextDark);
    document.documentElement.classList.toggle('theme-light', !nextDark);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextDark ? 'dark' : 'light');
    } catch {
      // Theme switching still works when browser storage is unavailable.
    }
  };

  return { dark, toggleTheme };
}
