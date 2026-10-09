// "Install app" for the customer PWA. Chrome fires `beforeinstallprompt` once, early, so it is
// captured at startup (imported from main.tsx) and replayed when the customer taps Install.

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** How this browser can install the app, decided once per render. */
export type InstallMode =
  /** Already opened from the home screen. Nothing to show. */
  | "installed"
  /** Chrome / Edge / Samsung offered a native install prompt. */
  | "prompt"
  /** iPhone / iPad Safari: Share → Add to Home Screen. */
  | "ios"
  /** Android in-app browser (WhatsApp, Instagram, Facebook): open the page in Chrome first. */
  | "open-in-chrome"
  /** Android browser without a prompt yet: browser menu → Install app / Add to Home screen. */
  | "menu"
  /** Desktop or anything else: don't show the card. */
  | "none";

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

export function startInstallCapture(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    // Keep Chrome's own mini-infobar from showing at a random moment; our button shows it instead.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installedNow = true;
    deferred = null;
    notify();
  });
}

export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches
  );
}

/** Android in-app browsers that never offer install (links opened inside WhatsApp, Instagram, …). */
export function isInAppBrowser(ua: string): boolean {
  return /(FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|; wv\)|WhatsApp)/i.test(ua);
}

export function installMode(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): InstallMode {
  if (installedNow || isStandalone()) return "installed";
  if (deferred) return "prompt";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return isInAppBrowser(ua) ? "open-in-chrome" : "menu";
  return "none";
}

/** Shows the native install sheet. Returns true when the customer accepted. */
export async function promptInstall(): Promise<boolean> {
  const ev = deferred;
  if (!ev) return false;
  deferred = null;
  try {
    await ev.prompt();
    const choice = await ev.userChoice;
    if (choice.outcome === "accepted") installedNow = true;
    return choice.outcome === "accepted";
  } catch {
    return false;
  } finally {
    notify();
  }
}

/** intent:// link that opens this same page in Chrome from an Android in-app browser. */
export function chromeIntentUrl(href: string): string {
  try {
    const u = new URL(href);
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(u.href)};end`;
  } catch {
    return href;
  }
}
