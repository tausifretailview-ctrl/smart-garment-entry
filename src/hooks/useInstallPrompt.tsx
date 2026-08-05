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

/** Shared across Header / banner / salesman layout — event fires once, early. */
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
  window.addEventListener("appinstalled", () => {
    clearPrompt();
  });
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

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    ensureGlobalPromptCapture();

    if (isStandaloneDisplay() || isNativeShell()) {
      setIsInstalled(true);
      return;
    }

    const sync = () => {
      const next =
        sharedDeferredPrompt ||
        (window.__pwaInstallPrompt as BeforeInstallPromptEvent | undefined) ||
        null;
      if (next && !sharedDeferredPrompt) {
        sharedDeferredPrompt = next;
      }
      setDeferredPrompt(sharedDeferredPrompt);
    };

    sync();
    promptListeners.add(sync);

    const handleAppInstalled = () => {
      setIsInstalled(true);
      clearPrompt();
    };
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      promptListeners.delete(sync);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const promptEvent = sharedDeferredPrompt || deferredPrompt;
    if (!promptEvent?.prompt) return false;

    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;

      // Chrome invalidates the event after one prompt() — always clear.
      clearPrompt();
      setDeferredPrompt(null);

      if (outcome === "accepted") {
        setIsInstalled(true);
        return true;
      }
      return false;
    } catch (err) {
      console.warn("[PWA] Install prompt failed:", err);
      clearPrompt();
      setDeferredPrompt(null);
      return false;
    }
  }, [deferredPrompt]);

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
