import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  isThemeReady: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "mvp_theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authIsLoading } = useAuth();

  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem(STORAGE_KEY) as Theme) ?? "dark";
  });

  const [isThemeReady, setIsThemeReady] = useState(() => !getAuthToken());

  const lastSyncedUserId = useRef<string | null>(null);
  const userChangedTheme = useRef(false);

  useEffect(() => {
    if (authIsLoading) return;

    if (!user) {
      lastSyncedUserId.current = null;
      setIsThemeReady(true);
      return;
    }

    if (lastSyncedUserId.current === user.id) return;
    lastSyncedUserId.current = user.id;

    setIsThemeReady(false);

    apiRequest("GET", "/api/v1/a/settings")
      .then((res) => res.json())
      .then((data) => {
        const entry = data?.settings?.find(
          (s: { setting_key: string; setting_value: string }) => s.setting_key === "theme"
        );
        if (entry && (entry.setting_value === "dark" || entry.setting_value === "light")) {
          setThemeState(entry.setting_value as Theme);
        }
      })
      .catch(() => {})
      .finally(() => setIsThemeReady(true));
  }, [user, authIsLoading]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem(STORAGE_KEY, theme);

    if (userChangedTheme.current) {
      userChangedTheme.current = false;
      const token = getAuthToken();
      if (token) {
        apiRequest("PUT", "/api/v1/a/settings", {
          settings: [{ setting_key: "theme", setting_value: theme }],
        }).catch(() => {});
      }
    }
  }, [theme]);

  const setTheme = (t: Theme) => {
    userChangedTheme.current = true;
    setThemeState(t);
  };

  const toggleTheme = () => {
    userChangedTheme.current = true;
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, isThemeReady }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
