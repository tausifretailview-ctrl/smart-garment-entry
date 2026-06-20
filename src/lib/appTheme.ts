/** Custom palette classes on `<html>` (next-themes `light`/`dark` is separate). */
export const APP_CUSTOM_THEME_KEY = "custom-theme";
export const NEXT_THEME_STORAGE_KEY = "theme";

export const CUSTOM_THEME_CLASSES = [
  "theme-indigo",
  "theme-purple",
  "theme-enterprise",
] as const;

export type CustomThemeId = "indigo" | "purple" | "enterprise";

export function stripCustomThemeClasses(el: HTMLElement = document.documentElement): void {
  el.classList.remove(...CUSTOM_THEME_CLASSES);
}

export function applyCustomTheme(
  theme: CustomThemeId,
  el: HTMLElement = document.documentElement,
): void {
  stripCustomThemeClasses(el);
  el.classList.add(`theme-${theme}`);
}

/**
 * Restore saved palette or default to Purple (Ezzy) on first visit / cleared storage.
 * Call before React mount so cookie/localStorage clear does not fall back to dark teal.
 */
export function initAppTheme(): void {
  if (typeof window === "undefined") return;
  const root = document.documentElement;

  try {
    const savedCustom = localStorage.getItem(APP_CUSTOM_THEME_KEY) as CustomThemeId | null;
    const savedMode = localStorage.getItem(NEXT_THEME_STORAGE_KEY);

    stripCustomThemeClasses(root);

    if (savedCustom === "indigo") {
      applyCustomTheme("indigo", root);
      return;
    }
    if (savedCustom === "enterprise") {
      applyCustomTheme("enterprise", root);
      return;
    }
    if (savedCustom === "purple") {
      applyCustomTheme("purple", root);
      return;
    }

    // User chose plain dark/light without a custom palette — keep next-themes class.
    if (savedMode === "dark" || savedMode === "light") {
      return;
    }

    // First visit or full storage clear → default Purple Theme (light).
    applyCustomTheme("purple", root);
    localStorage.setItem(APP_CUSTOM_THEME_KEY, "purple");
    localStorage.setItem(NEXT_THEME_STORAGE_KEY, "light");
    root.classList.remove("dark");
  } catch {
    applyCustomTheme("purple", root);
    root.classList.remove("dark");
  }
}

export function readCustomThemeId(): CustomThemeId | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(APP_CUSTOM_THEME_KEY);
    if (saved === "indigo" || saved === "purple" || saved === "enterprise") {
      return saved;
    }
  } catch {
    /* private mode */
  }
  return null;
}
