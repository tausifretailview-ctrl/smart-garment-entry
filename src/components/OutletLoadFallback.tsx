import { EntryBillLoadingFallback } from "@/components/EntryBillLoadingFallback";
import { DashboardSkeleton } from "@/components/ui/skeletons";
import { SalesInvoiceDashboardLoadShell } from "@/components/skeletons/SalesInvoiceDashboardLoadShell";
import { isEntryFullscreenPath } from "@/lib/entryPageLayout";
import { resolveTabCachePath } from "@/lib/tabPageRegistry";

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
      <DashboardSkeleton />
    </div>
  );
}
