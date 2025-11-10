import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

type Theme = 'light' | 'dark';

type ThemeColors = {
  background: string;
  surface: string;
  border: string;
  text: string;
  mutedText: string;
  primary: string;
  primaryMuted: string;
  success: string;
  successMuted: string;
  danger: string;
  dangerMuted: string;
  overlay: string;
};

type ThemeContextValue = {
  theme: Theme;
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: () => Promise<void>;
  setTheme: (next: Theme) => Promise<void>;
};

const THEME_STORAGE_KEY = 'settings/theme';

const lightColors: ThemeColors = {
  background: '#f8fafc',
  surface: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  mutedText: '#475569',
  primary: '#1d4ed8',
  primaryMuted: '#e0ecff',
  success: '#16a34a',
  successMuted: '#dcfce7',
  danger: '#dc2626',
  dangerMuted: '#fee2e2',
  overlay: 'rgba(15, 23, 42, 0.45)',
};

const darkColors: ThemeColors = {
  background: '#0f172a',
  surface: '#1e293b',
  border: '#334155',
  text: '#e2e8f0',
  mutedText: '#94a3b8',
  primary: '#38bdf8',
  primaryMuted: 'rgba(56, 189, 248, 0.16)',
  success: '#4ade80',
  successMuted: 'rgba(74, 222, 128, 0.16)',
  danger: '#f87171',
  dangerMuted: 'rgba(248, 113, 113, 0.18)',
  overlay: 'rgba(15, 23, 42, 0.7)',
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') {
          if (!cancelled) {
            setThemeState(stored);
            return;
          }
        }
        const system = Appearance.getColorScheme();
        if (!cancelled && (system === 'dark' || system === 'light')) {
          setThemeState(system);
        }
      } catch (error) {
        console.warn('Failed to load theme preference', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistTheme = useCallback(async (next: Theme) => {
    setThemeState(next);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, next);
    } catch (error) {
      console.warn('Failed to persist theme preference', error);
    }
  }, []);

  const handleSetTheme = useCallback(
    async (next: Theme) => {
      await persistTheme(next);
    },
    [persistTheme]
  );

  const toggleTheme = useCallback(async () => {
    await persistTheme(theme === 'light' ? 'dark' : 'light');
  }, [persistTheme, theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isDark: theme === 'dark',
      colors: theme === 'dark' ? darkColors : lightColors,
      toggleTheme,
      setTheme: handleSetTheme,
    }),
    [theme, toggleTheme, handleSetTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within <ThemeProvider>');
  }
  return ctx;
}
