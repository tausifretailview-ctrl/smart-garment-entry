/** Mobile screen look — "classic" (older shadcn/theme-color screens) vs
 *  "premium" (Ezzy dark-shell redesign, `.ez` scope). Presentation only —
 *  does not affect data, queries or the desktop app. */
export type MobileUiTheme = "classic" | "premium";

/** Look for users who never picked one. A saved "classic" choice is kept. */
export const DEFAULT_MOBILE_UI_THEME: MobileUiTheme = "premium";

export const MOBILE_UI_THEME_KEY = "ezzyerp:mobile-ui-theme";

const CHANGE_EVENT = "ezzyerp:mobile-ui-theme-change";

export function getMobileUiTheme(): MobileUiTheme {
  if (typeof window === "undefined") return DEFAULT_MOBILE_UI_THEME;
  try {
    const saved = localStorage.getItem(MOBILE_UI_THEME_KEY);
    if (saved === "premium" || saved === "classic") return saved;
    return DEFAULT_MOBILE_UI_THEME;
  } catch {
    return DEFAULT_MOBILE_UI_THEME;
  }
}

export function setMobileUiTheme(theme: MobileUiTheme): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MOBILE_UI_THEME_KEY, theme);
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeMobileUiTheme(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => listener();
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
