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
import { initScrollWheelFix } from "@/lib/scrollWheel";
import { initAppTheme } from "@/lib/appTheme";
import "./index.css";

recoverElectronOAuthErrorPage();

initAppTheme();
initForceDesktopViewPreference();
initUIScale();
initElectronViewportSync();
ensurePosAppSession();
initScrollWheelFix();
void initNativeShell();
initBootSplashWatchdog();

// Capture PWA install prompt BEFORE React mounts (event fires once, early).
// Must preventDefault so Chrome keeps a deferred event we can prompt() from Install App.
declare global {
  interface Window {
    __pwaInstallPrompt?: Event;
  }
}
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.__pwaInstallPrompt = e;
  // Keep in sync if the hook already bound its shared capture.
  window.dispatchEvent(new Event("ezzy-pwa-prompt-ready"));
});

// Global error handlers for async errors (not caught by React error boundaries)
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});

window.addEventListener("error", (event) => {
  console.error("Uncaught error:", event.error);
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

// Auto-reload disabled per user request — keep window sticky with existing data.
// User can manually refresh via F5, Ctrl+R, right-click, or File → Refresh App.
