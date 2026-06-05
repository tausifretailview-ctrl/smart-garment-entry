import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import {
  getLazyTabPage,
  TAB_PAGE_REGISTRY,
  isTabCachePath,
  prefetchTabPage,
  prefetchTabPagesIdle,
  resetTabPageChunk,
  type TabPageLayout,
  type TabPageRole,
} from "@/lib/tabPageRegistry";
import { isEntryTabPath } from "@/lib/entryPageLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleProtectedRoute } from "@/components/RoleProtectedRoute";
import { TabPaneErrorBoundary } from "@/components/TabPaneErrorBoundary";
import { Layout } from "@/components/Layout";
import { FullScreenLayout } from "@/components/FullScreenLayout";
import { POSLayout } from "@/components/POSLayout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DashboardSkeleton } from "@/components/ui/skeletons";
import { shouldElectronMountOnlyActiveTab } from "@/lib/electronShell";

/** Hidden tab panes idle longer than this may be unmounted (read-only dashboards only). */
const IDLE_UNMOUNT_MS = 600_000;
/** Avoid churn when few tabs are open — never auto-unmount at or below this count. */
const MIN_KEEP_TABS = 3;
const IDLE_UNMOUNT_CHECK_INTERVAL_MS = 60_000;

/** Live working screens — never auto-unmount (cart, bill entry, unsaved-work proxy). */
const EXPLICIT_PROTECTED_TAB_PATHS = new Set(["pos-sales", "product-entry"]);

function isProtectedTabPath(path: string): boolean {
  return EXPLICIT_PROTECTED_TAB_PATHS.has(path) || isEntryTabPath(path);
}

const DASHBOARD_TAB_PATHS = new Set(["", "dashboard"]);
/** Match SalesmanLayout — never spin forever on slow desktop WebView / many open tabs. */
const TAB_LOAD_TIMEOUT_MS = 8_000;
/** Large admin chunks (Settings ~5k lines) need more time on first cold load. */
const HEAVY_TAB_LOAD_TIMEOUT_MS = 20_000;
const HEAVY_TAB_PATHS = new Set(["settings", "user-rights", "barcode-printing", "accounts"]);

function getTabLoadTimeoutMs(path: string): number {
  return HEAVY_TAB_PATHS.has(path) ? HEAVY_TAB_LOAD_TIMEOUT_MS : TAB_LOAD_TIMEOUT_MS;
}

function TabPageFallback({
  active,
  path,
  onRetry,
}: {
  active: boolean;
  path: string;
  onRetry: () => void;
}) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!active) {
      setTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => {
      console.warn(`[TabCachedPages] Load timeout for tab: ${path || "dashboard"}`);
      setTimedOut(true);
    }, getTabLoadTimeoutMs(path));
    return () => window.clearTimeout(timer);
  }, [active, path]);

  if (!active) return null;

  if (DASHBOARD_TAB_PATHS.has(path) && !timedOut) {
    return <DashboardSkeleton />;
  }

  if (timedOut) {
    return (
      <div className="flex flex-1 h-full min-h-[40vh] w-full items-center justify-center p-6">
        <div className="text-center space-y-3 max-w-sm">
          <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">Taking longer than expected</p>
          <p className="text-xs text-muted-foreground">
            This page is still loading. Retry the tab or refresh the app.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button size="sm" onClick={onRetry}>
              Retry tab
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              Refresh app
            </Button>
          </div>
        </div>
      </div>
    );
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
  const [loadKey, setLoadKey] = useState(0);

  const retryTabLoad = useCallback(() => {
    resetTabPageChunk(path);
    prefetchTabPage(path);
    setLoadKey((k) => k + 1);
  }, [path]);

  const LazyPage = getLazyTabPage(path);
  if (!LazyPage) return null;

  const page = (
    <TabPaneErrorBoundary tabPath={path} onRetry={retryTabLoad}>
      <Suspense
        key={loadKey}
        fallback={<TabPageFallback active={active} path={path} onRetry={retryTabLoad} />}
      >
        <LazyPage />
      </Suspense>
    </TabPaneErrorBoundary>
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

  const electronSingleTab = shouldElectronMountOnlyActiveTab();
  const lastActiveAtRef = useRef<Map<string, number>>(new Map());

  const touchTabActiveAt = useCallback((path: string) => {
    lastActiveAtRef.current.set(path, Date.now());
  }, []);

  const evictIdleMountedTabs = useCallback(() => {
    if (electronSingleTab) return;

    setMountedPaths((prev) => {
      if (prev.size <= MIN_KEEP_TABS) return prev;

      const now = Date.now();
      const idleCandidates: string[] = [];

      for (const path of prev) {
        if (path === activePath) continue;
        if (isProtectedTabPath(path)) continue;
        const lastActive = lastActiveAtRef.current.get(path) ?? 0;
        if (now - lastActive > IDLE_UNMOUNT_MS) {
          idleCandidates.push(path);
        }
      }

      if (idleCandidates.length === 0) return prev;

      const next = new Set(prev);
      for (const path of idleCandidates) {
        if (next.size <= MIN_KEEP_TABS) break;
        next.delete(path);
      }

      return next.size === prev.size ? prev : next;
    });
  }, [activePath, electronSingleTab]);

  useEffect(() => {
    if (!isTabCachePath(activePath)) return;
    touchTabActiveAt(activePath);
    setMountedPaths((prev) => {
      if (electronSingleTab) {
        return new Set([activePath]);
      }
      if (prev.has(activePath)) return prev;
      const next = new Set(prev);
      next.add(activePath);
      touchTabActiveAt(activePath);
      return next;
    });
    evictIdleMountedTabs();
  }, [activePath, electronSingleTab, touchTabActiveAt, evictIdleMountedTabs]);

  useEffect(() => {
    if (electronSingleTab) return;
    const id = window.setInterval(evictIdleMountedTabs, IDLE_UNMOUNT_CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [evictIdleMountedTabs, electronSingleTab]);

  // Prefetch dashboard chunk while POS is open; pre-mount hidden pane only in browser (not Electron).
  useEffect(() => {
    const shouldWarmDashboard =
      uniquePaths.includes("") ||
      uniquePaths.includes("pos-sales") ||
      activePath === "pos-sales";
    if (!shouldWarmDashboard) return;

    prefetchTabPage("");
    if (electronSingleTab) return;

    setMountedPaths((prev) => {
      if (prev.has("")) return prev;
      const next = new Set(prev);
      next.add("");
      touchTabActiveAt("");
      return next;
    });
  }, [uniquePaths, activePath, electronSingleTab, touchTabActiveAt]);

  useEffect(() => {
    return prefetchTabPagesIdle(uniquePaths, activePath);
  }, [uniquePaths, activePath]);

  // Warm Settings chunk as soon as the tab is opened or listed in the tab bar.
  useEffect(() => {
    if (activePath === "settings" || uniquePaths.includes("settings")) {
      prefetchTabPage("settings");
    }
  }, [activePath, uniquePaths]);

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
