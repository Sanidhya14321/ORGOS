"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import {
  DEFAULT_THEME_PREFERENCE,
  applyThemePreference,
  getStoredThemePreference,
  getSystemTheme,
  resolveThemePreference,
  type ResolvedTheme,
  type ThemePreference
} from "@/lib/theme";

type ThemeContextValue = {
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setThemePreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => {
    return getStoredThemePreference() ?? DEFAULT_THEME_PREFERENCE;
  });
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    return resolveThemePreference(
      getStoredThemePreference() ?? DEFAULT_THEME_PREFERENCE,
      getSystemTheme()
    );
  });

  useEffect(() => {
    setResolvedTheme(applyThemePreference(themePreference));

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = () => {
      if (themePreference === "auto") {
        setResolvedTheme(applyThemePreference("auto", { persist: false }));
      }
    };
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== "orgos-theme") {
        return;
      }
      const nextPreference = getStoredThemePreference() ?? DEFAULT_THEME_PREFERENCE;
      setThemePreferenceState(nextPreference);
      setResolvedTheme(applyThemePreference(nextPreference, { persist: false }));
    };

    mediaQuery.addEventListener("change", handleMediaChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [themePreference]);

  const setThemePreference = useCallback((preference: ThemePreference) => {
    setThemePreferenceState(preference);
    setResolvedTheme(applyThemePreference(preference));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ themePreference, resolvedTheme, setThemePreference }),
    [resolvedTheme, setThemePreference, themePreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
