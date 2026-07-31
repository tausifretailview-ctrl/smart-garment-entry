import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  confirmReloadIfPosCartBusy,
  reloadAppWithUpdateCheck,
  startSilentUpdateWhenSafe,
} from "@/lib/appReload";
import { getElectronWebBuildStaleInfo } from "@/lib/electronWebBuildCheck";

const SNOOZE_KEY = "ezzy_electron_web_update_snooze_until";
const SNOOZE_MS = 4 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

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
    sessionStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  } catch {
    // ignore
  }
}

/**
 * Desktop shell loads the live web app from the server. When a new deploy ships,
 * silent-reload when idle/hidden; banner only after the 2h fallback ceiling.
 */
export function ElectronWebUpdatePrompt() {
  const { currentOrganization } = useOrganization();
  const [needRefresh, setNeedRefresh] = useState(false);
  const [snoozed, setSnoozed] = useState(isUpdateSnoozed);
  const [reloading, setReloading] = useState(false);
  const [allowBanner, setAllowBanner] = useState(false);
  const [updateToken, setUpdateToken] = useState(0);
  const checkingRef = useRef(false);
  const lastStaleKeyRef = useRef<string | null>(null);
  const orgIdRef = useRef(currentOrganization?.id);
  orgIdRef.current = currentOrganization?.id;

  const runCheck = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const info = await getElectronWebBuildStaleInfo();
      if (!info.stale || !info.latest) return;

      // Key off the server's latest asset so a newer deploy while waiting
      // restarts the silent-update / 2h banner ceiling (no stacked timers).
      if (lastStaleKeyRef.current !== info.latest) {
        lastStaleKeyRef.current = info.latest;
        setUpdateToken((token) => token + 1);
        setAllowBanner(false);
      }
      setNeedRefresh(true);
      setSnoozed(isUpdateSnoozed());
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void runCheck();
    const interval = window.setInterval(() => void runCheck(), CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void runCheck();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [runCheck]);

  useEffect(() => {
    if (!needRefresh || updateToken === 0) return;

    const session = startSilentUpdateWhenSafe({
      getOrganizationId: () => orgIdRef.current,
      onFallbackBanner: () => {
        setSnoozed(isUpdateSnoozed());
        setAllowBanner(true);
      },
    });

    return () => session.stop();
  }, [needRefresh, updateToken]);

  const handleReload = useCallback(async () => {
    if (reloading) return;
    if (!confirmReloadIfPosCartBusy(currentOrganization?.id)) return;
    setReloading(true);
    await reloadAppWithUpdateCheck();
  }, [currentOrganization?.id, reloading]);

  const handleLater = useCallback(() => {
    snoozeUpdatePrompt();
    setSnoozed(true);
  }, []);

  if (!needRefresh || !allowBanner || snoozed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-3 top-3 z-[100] flex max-w-[min(calc(100vw-1.5rem),22rem)] items-start gap-2 rounded-lg border border-slate-200/90 bg-white/95 px-3 py-2 shadow-md backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95 sm:right-4 sm:top-4"
    >
      <RefreshCw
        className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600 ${reloading ? "animate-spin" : ""}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-800 dark:text-slate-100">
          New version on server
        </p>
        <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          Reload to load the latest Accounts and other features (F5 also works).
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            disabled={reloading}
            onClick={() => void handleReload()}
          >
            {reloading ? "Reloading…" : "Reload now"}
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
