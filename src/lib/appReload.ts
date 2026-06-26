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

function hasAnyPosCartItemsInSession(): boolean {
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
 * Manual refresh from the header — fetches the latest web build and, on desktop,
 * also checks for a new installer version.
 */
export async function reloadAppWithUpdateCheck(): Promise<void> {
  const api = getElectronAPI();

  if (isElectronShell()) {
    await clearServiceWorkerAndCaches();
    void api?.checkForUpdates?.();
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
