import { Suspense, useEffect, useMemo, useState } from "react";
import {
  getLazyTabPage,
  TAB_PAGE_REGISTRY,
  isTabCachePath,
  prefetchTabPage,
  prefetchTabPagesIdle,
  type TabPageLayout,
  type TabPageRole,
} from "@/lib/tabPageRegistry";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleProtectedRoute } from "@/components/RoleProtectedRoute";
import { Layout } from "@/components/Layout";
import { FullScreenLayout } from "@/components/FullScreenLayout";
import { POSLayout } from "@/components/POSLayout";
import { cn } from "@/lib/utils";
import { DashboardSkeleton } from "@/components/ui/skeletons";

const DASHBOARD_TAB_PATHS = new Set(["", "dashboard"]);

function TabPageFallback({ active, path }: { active: boolean; path: string }) {
  if (!active) return null;
  if (DASHBOARD_TAB_PATHS.has(path)) {
    return <DashboardSkeleton />;
  }
  return (
    <div className="flex flex-1 h-full min-h-[40vh] w-full items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function wrapWithLayout(layout: TabPageLayout, page: React.ReactNode) {
  switch (layout) {
    case "pos":
      return <POSLayout>{page}</POSLayout>;
    case "fullscreen":
      return <FullScreenLayout>{page}</FullScreenLayout>;
    default:
      return <Layout>{page}</Layout>;
  }
}

function CachedTabPane({
  path,
  active,
  roles,
  layout,
}: {
  path: string;
  active: boolean;
  roles?: TabPageRole[];
  layout: TabPageLayout;
}) {
  const LazyPage = getLazyTabPage(path);
  if (!LazyPage) return null;

  const page = (
    <Suspense fallback={<TabPageFallback active={active} path={path} />}>
      <LazyPage />
    </Suspense>
  );

  const withLayout = wrapWithLayout(layout, page);
  const withRole =
    roles && roles.length > 0 ? (
      <RoleProtectedRoute allowedRoles={roles}>{withLayout}</RoleProtectedRoute>
    ) : (
      withLayout
    );

  return (
    <div
      className={cn(
        "flex flex-col min-h-0",
        active ? "flex-1 h-full w-full" : "hidden",
      )}
      aria-hidden={!active}
      data-tab-cache-path={path}
    >
      <ProtectedRoute>{withRole}</ProtectedRoute>
    </div>
  );
}

type TabCachedPagesProps = {
  /** Paths to keep mounted (open window tabs). */
  paths: string[];
  /** Current URL path segment — which cached pane is visible. */
  activePath: string;
};

/**
 * Tally-style window tabs: keep each visited module mounted (hidden) so switching
 * tabs does not reload lazy chunks or lose form state.
 *
 * On full reload only the active tab is mounted first — other open tabs mount when
 * the user switches to them (avoids loading 8+ dashboards at once).
 */
export function TabCachedPages({ paths, activePath }: TabCachedPagesProps) {
  const uniquePaths = useMemo(
    () => [...new Set(paths.filter((p) => isTabCachePath(p)))],
    [paths],
  );

  const [mountedPaths, setMountedPaths] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (isTabCachePath(activePath)) initial.add(activePath);
    return initial;
  });

  useEffect(() => {
    if (!isTabCachePath(activePath)) return;
    setMountedPaths((prev) => {
      if (prev.has(activePath)) return prev;
      const next = new Set(prev);
      next.add(activePath);
      return next;
    });
  }, [activePath]);

  // Warm main dashboard in the background while POS (or other tabs) are open — instant first return.
  useEffect(() => {
    const shouldWarmDashboard =
      uniquePaths.includes("") ||
      uniquePaths.includes("pos-sales") ||
      activePath === "pos-sales";
    if (!shouldWarmDashboard) return;

    prefetchTabPage("");
    setMountedPaths((prev) => {
      if (prev.has("")) return prev;
      const next = new Set(prev);
      next.add("");
      return next;
    });
  }, [uniquePaths, activePath]);

  useEffect(() => {
    return prefetchTabPagesIdle(uniquePaths, activePath);
  }, [uniquePaths, activePath]);

  if (uniquePaths.length === 0) return null;

  return (
    <div className="flex flex-1 flex-col min-h-0 min-w-0 h-full w-full overflow-hidden">
      {uniquePaths.map((path) => {
        if (!mountedPaths.has(path)) return null;
        const meta = TAB_PAGE_REGISTRY[path];
        if (!meta || !getLazyTabPage(path)) return null;
        return (
          <CachedTabPane
            key={path === "" ? "__dashboard__" : path}
            path={path}
            active={path === activePath}
            layout={meta.layout}
            roles={meta.roles}
          />
        );
      })}
    </div>
  );
}
