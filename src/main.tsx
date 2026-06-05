import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary";
import { initNativeShell } from "@/hooks/useNativeApp";
import { initForceDesktopViewPreference } from "@/lib/desktopViewPreference";
import { initUIScale } from "@/components/UIScaleSelector";
import { isElectronShell } from "@/lib/electronShell";
import "./index.css";

initForceDesktopViewPreference();
initUIScale();
void initNativeShell();

// Capture PWA install prompt BEFORE React mounts (event fires once, early)
declare global {
  interface Window {
    __pwaInstallPrompt?: Event;
  }
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__pwaInstallPrompt = e;
});

// Global error handlers for async errors (not caught by React error boundaries)
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  // Don't prevent default - let ErrorBoundary handle if possible
});

window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

// Desktop shell: recover from blank root after chunk/network failures (white screen)
if (isElectronShell()) {
  const ELECTRON_BLANK_RELOAD_KEY = "electron_blank_reload_count";
  window.setTimeout(() => {
    const root = document.getElementById("root");
    if (root && root.childNodes.length > 0) return;
    const reloadCount = parseInt(sessionStorage.getItem(ELECTRON_BLANK_RELOAD_KEY) || "0", 10);
    if (reloadCount < 2) {
      sessionStorage.setItem(ELECTRON_BLANK_RELOAD_KEY, String(reloadCount + 1));
      window.location.reload();
    }
  }, 15000);

  window.setTimeout(() => {
    const root = document.getElementById("root");
    if (root && root.childNodes.length > 0) {
      sessionStorage.removeItem(ELECTRON_BLANK_RELOAD_KEY);
    }
  }, 20000);
}
