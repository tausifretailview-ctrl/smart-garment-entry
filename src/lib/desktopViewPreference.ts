/** When true, the app uses desktop chrome (sidebar, header) even on narrow screens. */
export const FORCE_DESKTOP_VIEW_KEY = "ezzyerp:force-desktop-view";

const CHANGE_EVENT = "ezzyerp:desktop-view-change";

export function isForceDesktopViewEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(FORCE_DESKTOP_VIEW_KEY) === "1";
  } catch {
    return false;
  }
}

export function setForceDesktopView(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) {
      localStorage.setItem(FORCE_DESKTOP_VIEW_KEY, "1");
    } else {
      localStorage.removeItem(FORCE_DESKTOP_VIEW_KEY);
    }
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  applyForceDesktopViewAttribute(enabled);
}

export function applyForceDesktopViewAttribute(enabled?: boolean): void {
  if (typeof document === "undefined") return;
  const on = enabled ?? isForceDesktopViewEnabled();
  if (on) {
    document.documentElement.setAttribute("data-force-desktop-view", "true");
  } else {
    document.documentElement.removeAttribute("data-force-desktop-view");
  }
}

export function subscribeForceDesktopView(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => listener();
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/** Apply on first paint before React hydrates (import from main.tsx). */
export function initForceDesktopViewPreference(): void {
  applyForceDesktopViewAttribute();
}
