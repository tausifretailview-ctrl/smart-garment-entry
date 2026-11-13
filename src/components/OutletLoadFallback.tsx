import { useEffect, useRef, useState } from "react";
import { EntryBillLoadingFallback } from "@/components/EntryBillLoadingFallback";
import { DashboardSkeleton } from "@/components/ui/skeletons";
import { SalesInvoiceDashboardLoadShell } from "@/components/skeletons/SalesInvoiceDashboardLoadShell";
import { Button } from "@/components/ui/button";
import { isEntryFullscreenPath } from "@/lib/entryPageLayout";
import { resolveTabCachePath } from "@/lib/tabPageRegistry";
import {
  confirmReloadIfPosCartBusy,
  isSilentReloadCartBusy,
  reloadAppWithUpdateCheck,
} from "@/lib/appReload";
import { claimNewerBuildReload, newerServerEntryScript } from "@/lib/appBuildCheck";
import { hasUnsavedEntryWork } from "@/lib/unsavedWorkGuard";
import { isElectronShell } from "@/lib/electronShell";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  STUCK_PAGE_REPORT_AFTER_MS,
  buildStuckPageReport,
  claimStuckPageReport,
  noteLongTask,
  noteTimerGap,
  noteVisibility,
  reportStuckPage,
  startStuckPageWatch,
  type StuckPageOutcome,
  type StuckPageWatch,
} from "@/lib/stuckPageDiagnostics";

/** After this long on the skeleton, offer Reload app instead of an endless grey page. */
export const SLOW_OUTLET_LOAD_MS = 10_000;

/**
 * Outlet pages outside the tab cache (Settings > Organization, …) had no way out of
 * their skeleton: a page file that stalled (PC woke from sleep) or belongs to an older
 * build waits on the same pending download forever, and re-rendering cannot restart it.
 * After {@link SLOW_OUTLET_LOAD_MS}: reload once by itself onto a newer build when
 * nothing unsaved is open, otherwise show a Reload app button.
 */
function SlowOutletLoadHint({ path }: { path: string }) {
  const [slow, setSlow] = useState(false);
  const { currentOrganization } = useOrganization() ?? {};
  const orgIdRef = useRef<string | null>(null);
  orgIdRef.current = currentOrganization?.id ?? null;
  const watchRef = useRef<StuckPageWatch | null>(null);

  const reportRef = useRef<(outcome: StuckPageOutcome) => Promise<void>>(() => Promise.resolve());

  // Diagnostics (src/lib/stuckPageDiagnostics.ts): what the PC was doing while this skeleton
  // was up. Reported once, only when the slow hint was due (judged by the clock, so a PC that
  // slept through the 10 s timer still counts).
  useEffect(() => {
    const watch = startStuckPageWatch(path, Date.now(), document.visibilityState === "hidden");
    watchRef.current = watch;
    let reported = false;
    const report = (outcome: StuckPageOutcome): Promise<void> => {
      if (reported || Date.now() - watch.startedAt < SLOW_OUTLET_LOAD_MS) return Promise.resolve();
      reported = true;
      if (!claimStuckPageReport(path, typeof sessionStorage !== "undefined" ? sessionStorage : null)) {
        return Promise.resolve();
      }
      return reportStuckPage(buildStuckPageReport(watch, outcome), orgIdRef.current);
    };
    reportRef.current = report;
    const onVisibility = () => noteVisibility(watch, document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) noteLongTask(watch, entry.duration);
      });
      observer.observe({ type: "longtask", buffered: false });
    } catch {
      observer = null; // longtask not supported (Safari / Firefox)
    }
    let lastTick = Date.now();
    const ticker = window.setInterval(() => {
      const now = Date.now();
      noteTimerGap(watch, now - lastTick - 1000);
      lastTick = now;
    }, 1000);
    const stillStuck = window.setTimeout(() => void report("still-loading"), STUCK_PAGE_REPORT_AFTER_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
      window.clearInterval(ticker);
      window.clearTimeout(stillStuck);
      // Unmount = the page finished loading, or the user went elsewhere.
      void report(window.location.pathname.endsWith(`/${path}`) ? "loaded" : "left-page");
    };
  }, [path]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_OUTLET_LOAD_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!slow || isElectronShell()) return;
    let cancelled = false;
    void newerServerEntryScript().then((serverEntry) => {
      if (watchRef.current) watchRef.current.newerBuildOnServer = !!serverEntry;
      if (cancelled || !serverEntry) return;
      if (hasUnsavedEntryWork() || isSilentReloadCartBusy()) return;
      if (claimNewerBuildReload(serverEntry)) {
        void reloadAppWithUpdateCheck("page was stuck loading and a newer version was on the server");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slow]);

  if (!slow) return null;
  return (
    <div className="flex flex-col items-center gap-2 py-3 text-center">
      <p className="text-sm text-muted-foreground">
        This page is taking longer than expected to load. Reload loads it fresh.
      </p>
      <Button
        size="sm"
        onClick={async () => {
          if (!confirmReloadIfPosCartBusy()) return;
          // Write the diagnostics row before the reload wipes the page (at most 1.5 s).
          await Promise.race([reportRef.current("reload-pressed"), new Promise((r) => window.setTimeout(r, 1_500))]);
          void reloadAppWithUpdateCheck("Reload app on a page stuck loading");
        }}
      >
        Reload app
      </Button>
    </div>
  );
}

/**
 * Suspense fallback for OrgLayout's route <Outlet>. Without a boundary here a page
 * chunk that suspends (e.g. after the 4s Outlet rescue) climbs to App.tsx's app-wide
 * boundary, which swaps the whole window — menu bar, sidebar, tabs — for a bare
 * skeleton, or the blue boot splash on the org home route.
 */
export function OutletLoadFallback({ path }: { path: string }) {
  if (isEntryFullscreenPath(`/${path}`)) return <EntryBillLoadingFallback />;
  if (resolveTabCachePath(path) === "sales-invoice-dashboard") {
    return <SalesInvoiceDashboardLoadShell />;
  }
  return (
    <div className="min-h-[40vh] w-full">
      <SlowOutletLoadHint path={path} />
      <DashboardSkeleton />
    </div>
  );
}
