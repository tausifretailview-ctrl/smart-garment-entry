import { useEffect, useState } from "react";
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

/** After this long on the skeleton, offer Reload app instead of an endless grey page. */
export const SLOW_OUTLET_LOAD_MS = 10_000;

/**
 * Outlet pages outside the tab cache (Settings > Organization, …) had no way out of
 * their skeleton: a page file that stalled (PC woke from sleep) or belongs to an older
 * build waits on the same pending download forever, and re-rendering cannot restart it.
 * After {@link SLOW_OUTLET_LOAD_MS}: reload once by itself onto a newer build when
 * nothing unsaved is open, otherwise show a Reload app button.
 */
function SlowOutletLoadHint() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_OUTLET_LOAD_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!slow || isElectronShell()) return;
    let cancelled = false;
    void newerServerEntryScript().then((serverEntry) => {
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
        onClick={() => {
          if (!confirmReloadIfPosCartBusy()) return;
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
      <SlowOutletLoadHint />
      <DashboardSkeleton />
    </div>
  );
}
