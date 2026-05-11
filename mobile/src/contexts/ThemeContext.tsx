import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { settingsApi } from '../lib/api';

const THEME_STORAGE_KEY = 'myvoicepost_color_theme';
const THEME_SETTING_KEY = 'color_theme';

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryMuted: string;
  secondary: string;
  secondaryMuted: string;
  background: string;
  surface: string;
  surfaceLight: string;
  cardBackground: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  success: string;
  error: string;
  warning: string;
}

export interface ColorTheme {
  id: string;
  name: string;
  colors: ThemeColors;
  preview: [string, string, string];
}

const INDIGO_THEME: ThemeColors = {
  primary: '#6366f1',
  primaryDark: '#4f46e5',
  primaryMuted: '#1e1b4b',
  secondary: '#8b5cf6',
  secondaryMuted: '#2e1065',
  background: '#0f0f23',
  surface: '#1a1a2e',
  surfaceLight: '#252541',
  cardBackground: '#1a1a2e',
  text: '#ffffff',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  border: '#27273f',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
};

const OCEAN_THEME: ThemeColors = {
  primary: '#0ea5e9',
  primaryDark: '#0284c7',
  primaryMuted: '#0c2d48',
  secondary: '#38bdf8',
  secondaryMuted: '#082f49',
  background: '#0a1628',
  surface: '#132035',
  surfaceLight: '#1c2e4a',
  cardBackground: '#132035',
  text: '#f0f9ff',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  border: '#1e3a5f',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
};

const EMERALD_THEME: ThemeColors = {
  primary: '#10b981',
  primaryDark: '#059669',
  primaryMuted: '#064e3b',
  secondary: '#34d399',
  secondaryMuted: '#022c22',
  background: '#0a1a14',
  surface: '#122a20',
  surfaceLight: '#1a3c2e',
  cardBackground: '#122a20',
  text: '#f0fdf4',
  textSecondary: '#94a3b0',
  textMuted: '#6b7c74',
  border: '#1a3a2c',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
};

const ROSE_THEME: ThemeColors = {
  primary: '#f43f5e',
  primaryDark: '#e11d48',
  primaryMuted: '#4c0519',
  secondary: '#fb7185',
  secondaryMuted: '#3b0412',
  background: '#1a0a10',
  surface: '#2a1420',
  surfaceLight: '#3a1e30',
  cardBackground: '#2a1420',
  text: '#fff1f2',
  textSecondary: '#b0a0a6',
  textMuted: '#7a6b72',
  border: '#3d1d2e',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
};

const AMBER_THEME: ThemeColors = {
  primary: '#f59e0b',
  primaryDark: '#d97706',
  primaryMuted: '#451a03',
  secondary: '#fbbf24',
  secondaryMuted: '#3b1a00',
  background: '#1a1308',
  surface: '#2a2010',
  surfaceLight: '#3a2e1a',
  cardBackground: '#2a2010',
  text: '#fffbeb',
  textSecondary: '#b0a68e',
  textMuted: '#7a7260',
  border: '#3d3018',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
};

const VIOLET_THEME: ThemeColors = {
  primary: '#8b5cf6',
  primaryDark: '#7c3aed',
  primaryMuted: '#2e1065',
  secondary: '#a78bfa',
  secondaryMuted: '#1e0a4e',
  background: '#0f0a1e',
  surface: '#1a1330',
  surfaceLight: '#261d42',
  cardBackground: '#1a1330',
  text: '#f5f3ff',
  textSecondary: '#a8a0be',
  textMuted: '#6e6688',
  border: '#2d2550',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
};

const SLATE_THEME: ThemeColors = {
  primary: '#64748b',
  primaryDark: '#475569',
  primaryMuted: '#1e293b',
  secondary: '#94a3b8',
  secondaryMuted: '#0f172a',
  background: '#0f1218',
  surface: '#1a1e28',
  surfaceLight: '#252a36',
  cardBackground: '#1a1e28',
  text: '#f8fafc',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  border: '#2a3040',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
};

const TEAL_THEME: ThemeColors = {
  primary: '#14b8a6',
  primaryDark: '#0d9488',
  primaryMuted: '#042f2e',
  secondary: '#2dd4bf',
  secondaryMuted: '#032726',
  background: '#0a1616',
  surface: '#122424',
  surfaceLight: '#1a3434',
  cardBackground: '#122424',
  text: '#f0fdfa',
  textSecondary: '#8eaba5',
  textMuted: '#5f7c76',
  border: '#1a3838',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
};

export const COLOR_THEMES: ColorTheme[] = [
  { id: 'indigo', name: 'Indigo', colors: INDIGO_THEME, preview: ['#6366f1', '#0f0f23', '#1a1a2e'] },
  { id: 'ocean', name: 'Ocean', colors: OCEAN_THEME, preview: ['#0ea5e9', '#0a1628', '#132035'] },
  { id: 'emerald', name: 'Emerald', colors: EMERALD_THEME, preview: ['#10b981', '#0a1a14', '#122a20'] },
  { id: 'rose', name: 'Rose', colors: ROSE_THEME, preview: ['#f43f5e', '#1a0a10', '#2a1420'] },
  { id: 'amber', name: 'Amber', colors: AMBER_THEME, preview: ['#f59e0b', '#1a1308', '#2a2010'] },
  { id: 'violet', name: 'Violet', colors: VIOLET_THEME, preview: ['#8b5cf6', '#0f0a1e', '#1a1330'] },
  { id: 'teal', name: 'Teal', colors: TEAL_THEME, preview: ['#14b8a6', '#0a1616', '#122424'] },
  { id: 'slate', name: 'Slate', colors: SLATE_THEME, preview: ['#64748b', '#0f1218', '#1a1e28'] },
];

const DEFAULT_THEME_ID = 'indigo';

function isValidThemeId(id: string): boolean {
  return COLOR_THEMES.some(t => t.id === id);
}

interface ThemeContextType {
  themeId: string;
  colors: ThemeColors;
  setThemeId: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  themeId: DEFAULT_THEME_ID,
  colors: INDIGO_THEME,
  setThemeId: () => {},
});

interface ThemeProviderProps {
  children: React.ReactNode;
  isAuthenticated?: boolean;
}

export function ThemeProvider({ children, isAuthenticated = false }: ThemeProviderProps) {
  const [themeId, setThemeIdState] = useState(DEFAULT_THEME_ID);
  const [isLoaded, setIsLoaded] = useState(false);
  const hasSyncedFromDb = useRef(false);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const prevAuthRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;

  useEffect(() => {
    if (isAuthenticated) {
      loadThemeForAuthUser();
    } else {
      if (prevAuthRef.current) {
        AsyncStorage.removeItem(THEME_STORAGE_KEY).catch(() => {});
        setThemeIdState(DEFAULT_THEME_ID);
        hasSyncedFromDb.current = false;
      }
      setIsLoaded(true);
    }
    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated]);

  const loadThemeForAuthUser = async () => {
    try {
      const localTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (localTheme && isValidThemeId(localTheme)) {
        setThemeIdState(localTheme);
      }
      setIsLoaded(true);

      if (!hasSyncedFromDb.current) {
        hasSyncedFromDb.current = true;
        try {
          const settings = await settingsApi.getSettings();
          const themeSetting = settings.find(s => s.setting_key === THEME_SETTING_KEY);
          if (themeSetting && isValidThemeId(themeSetting.setting_value)) {
            setThemeIdState(themeSetting.setting_value);
            await AsyncStorage.setItem(THEME_STORAGE_KEY, themeSetting.setting_value);
          } else if (localTheme && isValidThemeId(localTheme)) {
            await settingsApi.updateSettings([
              { setting_key: THEME_SETTING_KEY, setting_value: localTheme },
            ]);
          }
        } catch {
        }
      }
    } catch {
      setIsLoaded(true);
    }
  };

  const setThemeId = useCallback((id: string) => {
    if (!isValidThemeId(id) || !isAuthenticatedRef.current) return;
    setThemeIdState(id);

    AsyncStorage.setItem(THEME_STORAGE_KEY, id).catch(() => {});

    settingsApi.updateSettings([
      { setting_key: THEME_SETTING_KEY, setting_value: id },
    ]).catch(() => {});
  }, []);

  const colors = COLOR_THEMES.find(t => t.id === themeId)?.colors || INDIGO_THEME;

  if (!isLoaded) return null;

  return (
    <ThemeContext.Provider value={{ themeId, colors, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}

export function useTheme() {
  return useContext(ThemeContext);
}
