import { useCallback, useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { confirmReloadIfPosCartBusy, reloadAppWithUpdateCheck } from "@/lib/appReload";
import { isElectronShell } from "@/lib/electronShell";

const SNOOZE_KEY = "ezzy_pwa_update_snooze_until";
/** After "Later", hide the banner until this many ms elapse (or next browser session). */
const SNOOZE_MS = 8 * 60 * 60 * 1000;

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
 * Prompt-mode PWA update — unobtrusive top-right chip; Reload uses hard refresh fallback.
 */
export function UpdatePrompt() {
  const { currentOrganization } = useOrganization();
  const [snoozed, setSnoozed] = useState(isUpdateSnoozed);
  const [reloading, setReloading] = useState(false);
  const prevNeedRefresh = useRef(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error("SW registration error:", error);
    },
  });

  useEffect(() => {
    if (needRefresh && !prevNeedRefresh.current) {
      setSnoozed(isUpdateSnoozed());
    }
    prevNeedRefresh.current = needRefresh;
  }, [needRefresh]);

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

  if (!needRefresh || snoozed) return null;

  const versionHint = isElectronShell()
    ? "Reload to load the latest features from the server."
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
