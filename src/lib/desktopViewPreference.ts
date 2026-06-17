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

const DEFAULT_VIEWPORT =
  "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";
/** Wide layout + pinch zoom when user forces desktop chrome on a phone (APK / mobile browser). */
const FORCED_DESKTOP_VIEWPORT =
  "width=1280, initial-scale=0.32, minimum-scale=0.2, maximum-scale=4.0, user-scalable=yes, viewport-fit=cover";

function applyForcedDesktopViewport(enabled: boolean): void {
  if (typeof document === "undefined") return;
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  meta.setAttribute("content", enabled ? FORCED_DESKTOP_VIEWPORT : DEFAULT_VIEWPORT);
}

export function applyForceDesktopViewAttribute(enabled?: boolean): void {
  if (typeof document === "undefined") return;
  const on = enabled ?? isForceDesktopViewEnabled();
  if (on) {
    document.documentElement.setAttribute("data-force-desktop-view", "true");
  } else {
    document.documentElement.removeAttribute("data-force-desktop-view");
  }
  applyForcedDesktopViewport(on);
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
