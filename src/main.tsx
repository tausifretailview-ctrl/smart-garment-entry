import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary";
import { initNativeShell } from "@/hooks/useNativeApp";
import { initForceDesktopViewPreference } from "@/lib/desktopViewPreference";
import { initUIScale } from "@/components/UIScaleSelector";
import { initBootSplashWatchdog } from "@/lib/appBootSplash";
import { recoverElectronOAuthErrorPage } from "@/lib/electronOAuthRecovery";
import { initElectronViewportSync } from "@/lib/electronViewportSync";
import { ensurePosAppSession } from "@/lib/posCartPersistence";
import "./index.css";

recoverElectronOAuthErrorPage();

initForceDesktopViewPreference();
initUIScale();
initElectronViewportSync();
ensurePosAppSession();
void initNativeShell();
initBootSplashWatchdog();

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

// Auto-reload disabled per user request — keep window sticky with existing data.
// User can manually refresh via F5, Ctrl+R, right-click, or File → Refresh App.
