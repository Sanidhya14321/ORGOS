export type ThemePreference = "light" | "dark" | "auto";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "orgos-theme";
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "light";

export const THEME_BOOTSTRAP_SCRIPT = `(() => {
  try {
    const storageKey = "${THEME_STORAGE_KEY}";
    const rawPreference = window.localStorage.getItem(storageKey);
    const preference = rawPreference === "light" || rawPreference === "dark" || rawPreference === "auto"
      ? rawPreference
      : "${DEFAULT_THEME_PREFERENCE}";
    const resolved = preference === "auto"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preference;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  } catch (_error) {
    document.documentElement.dataset.theme = "${DEFAULT_THEME_PREFERENCE}";
    document.documentElement.style.colorScheme = "${DEFAULT_THEME_PREFERENCE}";
  }
})();`;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "auto";
}

export function resolveThemePreference(
  preference: ThemePreference,
  systemTheme: ResolvedTheme
): ResolvedTheme {
  return preference === "auto" ? systemTheme : preference;
}

export function getStoredThemePreference(): ThemePreference | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : null;
  } catch {
    return null;
  }
}

export function persistThemePreference(preference: ThemePreference) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Ignore storage failures and still apply the theme in-memory.
  }
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyThemePreference(
  preference: ThemePreference,
  options: { persist?: boolean } = {}
): ResolvedTheme {
  const persist = options.persist ?? true;
  const resolved = resolveThemePreference(preference, getSystemTheme());

  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }

  if (persist) {
    persistThemePreference(preference);
  }

  return resolved;
}
