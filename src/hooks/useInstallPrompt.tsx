import { useState, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { isElectronShell } from "@/lib/electronShell";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __pwaInstallPrompt?: Event;
  }
}

/** Shared across Header / banner / install page — event fires once, early. */
let sharedDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

function notifyPromptListeners() {
  promptListeners.forEach((fn) => fn());
}

function capturePrompt(e: Event) {
  e.preventDefault();
  sharedDeferredPrompt = e as BeforeInstallPromptEvent;
  window.__pwaInstallPrompt = e;
  notifyPromptListeners();
}

function clearPrompt() {
  sharedDeferredPrompt = null;
  window.__pwaInstallPrompt = undefined;
  notifyPromptListeners();
}

let globalListenersBound = false;
function ensureGlobalPromptCapture() {
  if (globalListenersBound || typeof window === "undefined") return;
  globalListenersBound = true;

  if (window.__pwaInstallPrompt) {
    sharedDeferredPrompt = window.__pwaInstallPrompt as BeforeInstallPromptEvent;
  }

  window.addEventListener("beforeinstallprompt", capturePrompt);
  // main.tsx may capture BIP before this module binds — sync when it signals.
  window.addEventListener("ezzy-pwa-prompt-ready", () => {
    if (window.__pwaInstallPrompt) {
      sharedDeferredPrompt = window.__pwaInstallPrompt as BeforeInstallPromptEvent;
      notifyPromptListeners();
    }
  });
  window.addEventListener("appinstalled", () => {
    clearPrompt();
  });
}

/** Latest deferred Chrome/Edge install event (if any). */
export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  ensureGlobalPromptCapture();
  const fromWindow = window.__pwaInstallPrompt as BeforeInstallPromptEvent | undefined;
  const next = sharedDeferredPrompt || fromWindow || null;
  if (next && next !== sharedDeferredPrompt) {
    sharedDeferredPrompt = next;
  }
  return sharedDeferredPrompt;
}

/** Wait briefly for beforeinstallprompt (manifest swap / late SW can delay it). */
export async function waitForInstallPrompt(
  timeoutMs = 4000,
): Promise<BeforeInstallPromptEvent | null> {
  ensureGlobalPromptCapture();
  const existing = getDeferredInstallPrompt();
  if (existing?.prompt) return existing;

  return new Promise((resolve) => {
    const started = Date.now();
    const finish = (value: BeforeInstallPromptEvent | null) => {
      window.clearInterval(timer);
      promptListeners.delete(onChange);
      resolve(value);
    };
    const onChange = () => {
      const p = getDeferredInstallPrompt();
      if (p?.prompt) finish(p);
    };
    promptListeners.add(onChange);
    const timer = window.setInterval(() => {
      onChange();
      if (Date.now() - started >= timeoutMs) {
        finish(getDeferredInstallPrompt());
      }
    }, 200);
  });
}

export type PwaInstallOutcome = "accepted" | "dismissed" | "unavailable";

/**
 * Open the native Chrome/Edge “Install app” dialog (creates Start Menu + desktop icon on Windows).
 * Returns unavailable when the browser has no deferred prompt (user can still use the address-bar icon).
 */
export async function triggerPwaInstall(): Promise<PwaInstallOutcome> {
  if (typeof window === "undefined") return "unavailable";
  if (isStandaloneDisplay() || isNativeShell()) return "accepted";

  const promptEvent = await waitForInstallPrompt(4000);
  if (!promptEvent?.prompt) return "unavailable";

  try {
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    clearPrompt();
    return outcome;
  } catch (err) {
    console.warn("[PWA] Install prompt failed:", err);
    clearPrompt();
    return "unavailable";
  }
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
}

export function isAndroidDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/** Native APK / Electron already installed — no browser PWA prompt. */
export function isNativeShell(): boolean {
  try {
    if (isElectronShell()) return true;
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** True when Chrome reports this origin’s PWA is already installed (shows “Open in app”). */
export async function detectInstalledWebApp(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  if (isStandaloneDisplay() || isNativeShell()) return true;
  try {
    const nav = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<Array<{ platform?: string; url?: string }>>;
    };
    if (typeof nav.getInstalledRelatedApps !== "function") return false;
    const related = await nav.getInstalledRelatedApps();
    return Array.isArray(related) && related.length > 0;
  } catch {
    return false;
  }
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    ensureGlobalPromptCapture();

    if (isStandaloneDisplay() || isNativeShell()) {
      setIsInstalled(true);
      return;
    }

    void detectInstalledWebApp().then((installed) => {
      if (installed) setIsInstalled(true);
    });

    const sync = () => {
      setDeferredPrompt(getDeferredInstallPrompt());
    };

    sync();
    promptListeners.add(sync);

    // Late BIP after org manifest blob swap / service worker ready.
    const poll = window.setInterval(sync, 500);
    const stopPoll = window.setTimeout(() => window.clearInterval(poll), 8000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        sync();
        void detectInstalledWebApp().then((installed) => {
          if (installed) setIsInstalled(true);
        });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const handleAppInstalled = () => {
      setIsInstalled(true);
      clearPrompt();
    };
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      promptListeners.delete(sync);
      window.clearInterval(poll);
      window.clearTimeout(stopPoll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const outcome = await triggerPwaInstall();
    if (outcome === "accepted") {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    setDeferredPrompt(getDeferredInstallPrompt());
    return false;
  }, []);

  const isInstallable = !!deferredPrompt && !isInstalled;
  /** Show Install App in browser chrome when not already a standalone/native app. */
  const canOfferInstall = !isInstalled && !isNativeShell();

  return {
    isInstallable,
    isInstalled,
    canOfferInstall,
    isIOS: isIOSDevice(),
    isAndroid: isAndroidDevice(),
    promptInstall,
  };
}
