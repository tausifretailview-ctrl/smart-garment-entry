import { DashboardSkeleton } from "@/components/ui/skeletons";
import { AppBootSplash } from "@/components/AppBootSplash";
import { isAppBootRoute } from "@/lib/appBootSplash";
import { isEntryFullscreenPath } from "@/lib/entryPageLayout";
import { EntryBillLoadingFallback } from "@/components/EntryBillLoadingFallback";

/** Suspense fallback: boot splash, bill-screen shell or dashboard skeleton — never blank. */
const SafeEntryFallback =
  typeof EntryBillLoadingFallback === "function"
    ? EntryBillLoadingFallback
    : () => (
        <div className="flex min-h-[40vh] w-full items-center justify-center">
          <span className="text-sm text-muted-foreground">Loading bill screen…</span>
        </div>
      );

export const LazyFallback = () => {
  const path = window.location.pathname;
  if (isAppBootRoute(path)) {
    return <AppBootSplash message="Loading…" />;
  }
  if (isEntryFullscreenPath(path)) {
    return <SafeEntryFallback />;
  }
  return (
    <div className="min-h-[40vh] w-full">
      <DashboardSkeleton />
    </div>
  );
};
