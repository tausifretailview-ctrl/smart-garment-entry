/** HTML splash in index.html (sibling of #root) — hide when login / app shell is ready */

import { isElectronShell } from "@/lib/electronShell";
import { Capacitor } from "@capacitor/core";

const SPLASH_ID = "splash-screen";

export function hideAppBootSplash(): void {
  if (typeof document === "undefined") return;
  const splash = document.getElementById(SPLASH_ID);
  if (!splash || splash.dataset.hiding === "1") return;
  splash.dataset.hiding = "1";
  splash.style.transition = "opacity 0.25s ease-out";
  splash.style.opacity = "0";
  window.setTimeout(() => {
    splash.remove();
  }, 280);
}

/**
 * Electron WebView can mount React while auth bootstrap is still pending, leaving
 * the HTML splash (z-index 99999) on top indefinitely. Watchdog clears it so
 * login / spinners underneath are reachable.
 */
export function initBootSplashWatchdog(): void {
  if (typeof window === "undefined") return;

  const dismissIfStuck = (label: string) => {
    const splash = document.getElementById(SPLASH_ID);
    if (!splash) return;
    console.warn(`[boot-splash] watchdog dismiss (${label})`);
    hideAppBootSplash();
  };

  // Electron cold start: auth getSession can lag behind first paint.
  if (isElectronShell()) {
    window.setTimeout(() => dismissIfStuck("electron-8s"), 8_000);
    window.setTimeout(() => dismissIfStuck("electron-15s"), 15_000);
  }

  // Capacitor remote-URL shell: slow mobile networks can delay first React paint.
  if (Capacitor.isNativePlatform()) {
    window.setTimeout(() => dismissIfStuck("native-12s"), 12_000);
    window.setTimeout(() => dismissIfStuck("native-20s"), 20_000);
  }

  // Universal safety — React mounted but hideAppBootSplash never ran.
  window.setTimeout(() => {
    const root = document.getElementById("root");
    if (root && root.childNodes.length > 0) {
      dismissIfStuck("react-mounted-20s");
    }
  }, 20_000);
}

/** Routes where a bare spinner should not replace the branded splash */
export function isAppBootRoute(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/auth" || path === "/organization-setup" || path === "/reset-password") {
    return true;
  }
  // Org login: /{slug} only (single segment)
  const segments = path.split("/").filter(Boolean);
  return segments.length === 1;
}
