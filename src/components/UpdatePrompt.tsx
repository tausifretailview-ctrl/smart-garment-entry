import { useCallback, useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  confirmReloadIfPosCartBusy,
  reloadAppWithUpdateCheck,
  SILENT_UPDATE_BANNER_FALLBACK_MS,
  SILENT_UPDATE_BANNER_FALLBACK_STANDALONE_MS,
  STANDALONE_SW_UPDATE_CHECK_MS,
  startSilentUpdateWhenSafe,
} from "@/lib/appReload";
import { isElectronShell } from "@/lib/electronShell";
import { isStandalonePwa } from "@/lib/orgPwaManifest";

const SNOOZE_KEY = "ezzy_pwa_update_snooze_until";
/** After "Later", hide the banner (browser tab). */
const SNOOZE_MS = 8 * 60 * 60 * 1000;
/** Installed PWA — shorter snooze so deploys are not ignored all day. */
const SNOOZE_STANDALONE_MS = 60 * 60 * 1000;

function snoozeMs(): number {
  return isStandalonePwa() ? SNOOZE_STANDALONE_MS : SNOOZE_MS;
}

function isUpdateSnoozed(): boolean {
  try {
    const until = sessionStorage.getItem(SNOOZE_KEY);
    if (!until) return false;
    if (Date.now() < Number(until)) return true;
    sessionStorage.removeItem(SNOOZE_KEY);
    return false;
  } catch {
    return false;
  }
}

function snoozeUpdatePrompt(): void {
  try {
    sessionStorage.setItem(SNOOZE_KEY, String(Date.now() + snoozeMs()));
  } catch {
    // ignore
  }
}

/**
 * Prompt-mode PWA update — silent reload when idle/hidden; banner after fallback.
 * Installed (standalone) PWAs check for SW updates more often and surface the
 * banner sooner so shops do not sit on a dead precache after deploy.
 */
export function UpdatePrompt() {
  const { currentOrganization } = useOrganization();
  const [snoozed, setSnoozed] = useState(isUpdateSnoozed);
  const [reloading, setReloading] = useState(false);
  const [allowBanner, setAllowBanner] = useState(false);
  const [updateToken, setUpdateToken] = useState(0);
  const prevNeedRefresh = useRef(false);
  const orgIdRef = useRef(currentOrganization?.id);
  orgIdRef.current = currentOrganization?.id;
  const standalone = isStandalonePwa();

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error("SW registration error:", error);
    },
  });

  // Installed PWA: poll SW updates often + on every focus so deploys do not leave a waiting worker all day.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const intervalMs = standalone ? STANDALONE_SW_UPDATE_CHECK_MS : 60 * 60 * 1000;
    let cancelled = false;
    let intervalId = 0;

    const tick = () => {
      void navigator.serviceWorker.getRegistration().then((reg) => {
        if (!cancelled && reg) void reg.update().catch(() => undefined);
      });
    };

    tick();
    intervalId = window.setInterval(tick, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [standalone]);

  useEffect(() => {
    if (needRefresh && !prevNeedRefresh.current) {
      setUpdateToken((token) => token + 1);
      setAllowBanner(false);
      setSnoozed(isUpdateSnoozed());
    }
    if (!needRefresh) {
      setAllowBanner(false);
    }
    prevNeedRefresh.current = needRefresh;
  }, [needRefresh]);

  useEffect(() => {
    if (!needRefresh || updateToken === 0) return;

    const session = startSilentUpdateWhenSafe({
      getOrganizationId: () => orgIdRef.current,
      bannerFallbackMs: standalone
        ? SILENT_UPDATE_BANNER_FALLBACK_STANDALONE_MS
        : SILENT_UPDATE_BANNER_FALLBACK_MS,
      onFallbackBanner: () => {
        setSnoozed(isUpdateSnoozed());
        setAllowBanner(true);
      },
      beforeReload: async () => {
        try {
          await updateServiceWorker(true);
        } catch (error) {
          console.warn("Service worker activate failed:", error);
        }
      },
    });

    return () => session.stop();
  }, [needRefresh, updateToken, updateServiceWorker, standalone]);

  const handleReload = useCallback(async () => {
    if (reloading) return;
    if (!confirmReloadIfPosCartBusy(currentOrganization?.id)) return;

    setReloading(true);
    try {
      // Activate waiting worker when possible; may not reload on all browsers.
      await updateServiceWorker(true);
    } catch (error) {
      console.warn("Service worker activate failed:", error);
    }

    // Always hard-reload with cache bust — fixes "Reload clicked but nothing happens".
    await reloadAppWithUpdateCheck();
  }, [currentOrganization?.id, reloading, updateServiceWorker]);

  const handleLater = useCallback(() => {
    snoozeUpdatePrompt();
    setSnoozed(true);
  }, []);

  if (!needRefresh || !allowBanner || snoozed) return null;

  const versionHint = isElectronShell()
    ? "Reload to load the latest features from the server."
    : standalone
      ? "A new version is ready. Reload now to avoid blank screens after update."
      : "Reload when you are between tasks.";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-3 top-3 z-[100] flex max-w-[min(calc(100vw-1.5rem),20rem)] items-start gap-2 rounded-lg border border-slate-200/90 bg-white/95 px-3 py-2 shadow-md backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95 sm:right-4 sm:top-4"
    >
      <RefreshCw
        className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600 ${reloading ? "animate-spin" : ""}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-800 dark:text-slate-100">
          Update available
        </p>
        <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          {versionHint}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            disabled={reloading}
            onClick={() => void handleReload()}
          >
            {reloading ? "Reloading…" : "Reload"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-slate-600"
            disabled={reloading}
            onClick={handleLater}
          >
            Later
          </Button>
        </div>
      </div>
      <button
        type="button"
        className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        aria-label="Dismiss update reminder for now"
        disabled={reloading}
        onClick={handleLater}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
