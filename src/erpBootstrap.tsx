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
import { initMainThreadViolationProbe } from "@/lib/mainThreadViolationProbe";

recoverElectronOAuthErrorPage();
initMainThreadViolationProbe();

initAppTheme();
initForceDesktopViewPreference();
initUIScale();
initElectronViewportSync();
ensurePosAppSession();
initScrollWheelFix();
void initNativeShell();
initBootSplashWatchdog();

declare global {
  interface Window {
    __pwaInstallPrompt?: Event;
  }
}
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.__pwaInstallPrompt = e;
  window.dispatchEvent(new Event("ezzy-pwa-prompt-ready"));
});

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
