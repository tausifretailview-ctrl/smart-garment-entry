import { isElectronShell } from "@/lib/electronShell";
import { readPosCartSnapshot } from "@/lib/posCartPersistence";

type ElectronReloadApi = {
  isElectron?: boolean;
  reloadApp?: () => Promise<{ success?: boolean }>;
  checkForUpdates?: () => Promise<{ success?: boolean }>;
};

function getElectronAPI(): ElectronReloadApi | undefined {
  return (window as Window & { electronAPI?: ElectronReloadApi }).electronAPI;
}

/** Idle with no pointer/keyboard activity — not used for visible-tab silent reload. */
export const SILENT_UPDATE_IDLE_MS = 45_000;
/** If no safe moment arrives, show the existing update banner. */
export const SILENT_UPDATE_BANNER_FALLBACK_MS = 2 * 60 * 60 * 1000;
/**
 * Installed Windows/Android PWA — show update banner sooner. Busy shops otherwise
 * stay on a waiting SW all day and hit MIME text/html chunk skew after deploy.
 */
export const SILENT_UPDATE_BANNER_FALLBACK_STANDALONE_MS = 15 * 60 * 1000;
/** How often installed PWAs should call registration.update(). */
export const STANDALONE_SW_UPDATE_CHECK_MS = 5 * 60 * 1000;

/** How often to re-check hidden-tab + cart + dialog gates. */
const SILENT_UPDATE_POLL_MS = 5_000;

export function hasAnyPosCartItemsInSession(): boolean {
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith("pos_cart_")) continue;
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { items?: unknown[] };
      if (Array.isArray(parsed.items) && parsed.items.length > 0) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/** Warn before reload when an unsaved POS bill may be open. */
export function confirmReloadIfPosCartBusy(orgId?: string | null): boolean {
  const hasCart =
    (orgId && readPosCartSnapshot(orgId)) || hasAnyPosCartItemsInSession();
  if (!hasCart) return true;
  return window.confirm(
    "You have an unsaved bill — reload anyway? Your cart is saved in this browser session and should restore after reload.",
  );
}

/** True when POS cart session data would be disrupted by a reload. */
export function isSilentReloadCartBusy(organizationId?: string | null): boolean {
  if (hasAnyPosCartItemsInSession()) return true;
  if (organizationId && readPosCartSnapshot(organizationId)) return true;
  return false;
}

/**
 * Radix dialog / sheet / alertdialog open — do not silent-reload mid-interaction
 * (barcode scan, product entry, etc.).
 */
export function isBlockingUiOverlayOpen(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.querySelector('[role="dialog"], [role="alertdialog"]');
}

export function isSilentReloadSafe(organizationId?: string | null): boolean {
  return !isSilentReloadCartBusy(organizationId) && !isBlockingUiOverlayOpen();
}

async function clearServiceWorkerAndCaches(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    }

    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
  } catch (error) {
    console.error("Error clearing web app caches:", error);
  }
}

/**
 * Manual refresh from the header — fetches the latest web build from the server.
 * Desktop installer updates are checked on startup and via Help → Check for Updates.
 */
export async function reloadAppWithUpdateCheck(): Promise<void> {
  const api = getElectronAPI();

  if (isElectronShell()) {
    await clearServiceWorkerAndCaches();
    // Refresh loads the latest web build only — installer updates are checked on startup / Help menu.
    if (api?.reloadApp) {
      await api.reloadApp();
      return;
    }
    window.location.reload();
    return;
  }

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    }
  } catch (error) {
    console.warn("Service worker update check failed:", error);
  }

  await clearServiceWorkerAndCaches();
  window.location.reload();
}

export type SilentUpdateWhenSafeOptions = {
  /** Resolved on each safety check so org switches do not restart the 2h ceiling. */
  getOrganizationId?: () => string | null | undefined;
  /** Called once when the 2h ceiling elapses without a silent reload. */
  onFallbackBanner: () => void;
  /** Optional pre-reload hook (e.g. activate waiting service worker). */
  beforeReload?: () => void | Promise<void>;
  /** Overrides for tests. */
  idleMs?: number;
  bannerFallbackMs?: number;
  pollMs?: number;
  now?: () => number;
};

export type SilentUpdateWhenSafeHandle = {
  stop: () => void;
};

type ActiveSilentSession = {
  generation: number;
  stop: () => void;
};

let activeSilentSession: ActiveSilentSession | null = null;
let silentReloadInFlight = false;

/**
 * When an update is available: wait for a safe moment, then reload silently.
 * Does not show UI — callers show the existing banner only via onFallbackBanner
 * after {@link SILENT_UPDATE_BANNER_FALLBACK_MS}.
 *
 * Safe moment = no POS cart + no open dialog/sheet, and the tab is hidden
 * (minimize / switch app). A visible idle dashboard must stay put — shops
 * were losing the current page to auto-refresh after every deploy.
 *
 * Calling again while a prior session is active stops the old timers and
 * restarts the 2-hour banner ceiling (no stacking).
 */
export function startSilentUpdateWhenSafe(
  options: SilentUpdateWhenSafeOptions,
): SilentUpdateWhenSafeHandle {
  activeSilentSession?.stop();

  const bannerFallbackMs = options.bannerFallbackMs ?? SILENT_UPDATE_BANNER_FALLBACK_MS;
  const pollMs = options.pollMs ?? SILENT_UPDATE_POLL_MS;

  let stopped = false;
  let bannerFired = false;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let bannerTimer: ReturnType<typeof setTimeout> | undefined;
  const generation = (activeSilentSession?.generation ?? 0) + 1;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (pollTimer !== undefined) clearInterval(pollTimer);
    if (bannerTimer !== undefined) clearTimeout(bannerTimer);
    document.removeEventListener("visibilitychange", onVisibility);
    if (activeSilentSession?.generation === generation) {
      activeSilentSession = null;
    }
  };

  const trySilentReload = async () => {
    if (stopped || silentReloadInFlight) return;
    const organizationId = options.getOrganizationId?.() ?? null;
    if (!isSilentReloadSafe(organizationId)) return;

    const tabHidden =
      typeof document !== "undefined" && document.visibilityState === "hidden";
    // Never reload a visible page — idle dashboards must stick.
    if (!tabHidden) return;

    silentReloadInFlight = true;
    stop();
    try {
      try {
        await options.beforeReload?.();
      } catch (error) {
        console.warn("Silent update beforeReload failed:", error);
      }
      await reloadAppWithUpdateCheck();
    } catch (error) {
      console.warn("Silent update reload failed:", error);
    } finally {
      // Normal browsers unload on reload; reset so mocked/failed reloads can retry.
      silentReloadInFlight = false;
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      void trySilentReload();
    }
  };

  document.addEventListener("visibilitychange", onVisibility);

  pollTimer = setInterval(() => {
    void trySilentReload();
  }, pollMs);

  bannerTimer = setTimeout(() => {
    if (stopped || bannerFired) return;
    bannerFired = true;
    try {
      options.onFallbackBanner();
    } catch (error) {
      console.warn("Silent update fallback banner callback failed:", error);
    }
  }, bannerFallbackMs);

  activeSilentSession = { generation, stop };

  void trySilentReload();

  return { stop };
}
