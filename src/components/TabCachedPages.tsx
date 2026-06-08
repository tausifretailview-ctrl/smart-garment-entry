import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
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
import { RoleProtectedRoute } from "@/components/RoleProtectedRoute";
import { TabPaneErrorBoundary } from "@/components/TabPaneErrorBoundary";
import { Layout } from "@/components/Layout";
import { FullScreenLayout } from "@/components/FullScreenLayout";
import { POSLayout } from "@/components/POSLayout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DashboardSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { shouldElectronMountOnlyActiveTab } from "@/lib/electronShell";
import {
  isNavigationPerfEnabled,
  recordChunkLoadEnd,
  recordChunkLoadStart,
  recordTabSwitch,
} from "@/lib/navigationPerfDiagnostics";

/** Hidden tab panes idle longer than this may be unmounted (read-only dashboards only). */
const IDLE_UNMOUNT_MS = 600_000;
/** Avoid churn when few tabs are open — never auto-unmount at or below this count. */
const MIN_KEEP_TABS = 3;
const IDLE_UNMOUNT_CHECK_INTERVAL_MS = 60_000;

/** Heavy admin screens — only these may idle-evict when many tabs are open. */
const IDLE_EVICT_ALLOWED_PATHS = new Set(["settings", "user-rights"]);

/** Live working screens — never auto-unmount (cart, bill entry, unsaved-work proxy). */
const EXPLICIT_PROTECTED_TAB_PATHS = new Set([
  "pos-sales",
  "product-entry",
  "product-dashboard",
  "products",
  "purchase-bill-dashboard",
  "purchase-bills",
  "purchase-orders",
  "purchase-return-dashboard",
  "purchase-returns",
  "barcode-printing",
  "stock-settlement",
  "bulk-product-update",
  "accounts",
  "payments-dashboard",
  "chart-of-accounts",
  "journal-vouchers",
  "manual-journal",
  "ledger-opening-balances",
  "customers",
  "suppliers",
  "employees",
  "salesman-commission",
  "pos-dashboard",
  "sales-invoice-dashboard",
]);

/** Persist scroll positions per window tab when panes are hidden. */
const tabScrollPositions = new Map<string, number[]>();

function collectTabScrollTargets(root: HTMLElement): HTMLElement[] {
  const targets: HTMLElement[] = [];
  const main = root.querySelector("main");
  if (main) targets.push(main as HTMLElement);
  root.querySelectorAll<HTMLElement>("[data-tab-scroll]").forEach((el) => {
    if (!targets.includes(el)) targets.push(el);
  });
  return targets;
}

function readScrollPositions(root: HTMLElement): number[] {
  return collectTabScrollTargets(root).map((el) => el.scrollTop);
}

function writeScrollPositions(root: HTMLElement, positions: number[]) {
  const targets = collectTabScrollTargets(root);
  targets.forEach((el, i) => {
    if (positions[i] != null) el.scrollTop = positions[i];
  });
}

function isProtectedTabPath(path: string): boolean {
  if (isEntryTabPath(path)) return true;
  if (IDLE_EVICT_ALLOWED_PATHS.has(path)) return false;
  return EXPLICIT_PROTECTED_TAB_PATHS.has(path) || isTabCachePath(path);
}

const DASHBOARD_TAB_PATHS = new Set(["", "dashboard"]);
/** Inventory list dashboards — static shell while chunk loads (no center spinner). */
const LIST_DASHBOARD_SHELL_PATHS = new Set([
  ...DASHBOARD_TAB_PATHS,
  "product-dashboard",
  "products",
  "purchase-bill-dashboard",
  "purchase-bills",
  "purchase-return-dashboard",
  "purchase-returns",
  "stock-adjustment",
]);
/** Time before showing the "Retry tab / Refresh app" card. Generous on web/PWA
 *  so slow shop Wi-Fi does not false-alarm while the chunk is still downloading. */
const TAB_LOAD_TIMEOUT_MS = 20_000;
/** Large admin chunks (Settings ~5k lines) need more time on first cold load. */
const HEAVY_TAB_LOAD_TIMEOUT_MS = 45_000;
/** When to swap the bare spinner for a friendlier "Still loading…" hint. */
const SOFT_LOADING_HINT_MS = 8_000;
/** Bill-entry tabs — show a static header/table shell while the chunk loads. */
const ENTRY_TAB_SHELL_PATHS = new Set(["purchase-entry"]);

const HEAVY_TAB_PATHS = new Set([
  "settings",
  "user-rights",
  "barcode-printing",
  "accounts",
  "pos-dashboard",
  "sales-invoice-dashboard",
  "purchase-bill-dashboard",
  "pos-sales",
  "sales-invoice",
  "purchase-entry",
  "product-entry",
  "sale-return-entry",
  "purchase-return-entry",
  "purchase-return-dashboard",
  "sale-return-dashboard",
  "product-dashboard",
  "products",
]);

function getTabLoadTimeoutMs(path: string): number {
  return HEAVY_TAB_PATHS.has(path) ? HEAVY_TAB_LOAD_TIMEOUT_MS : TAB_LOAD_TIMEOUT_MS;
}

function EntryTabShellFallback() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-slate-50">
      <div className="h-[52px] shrink-0 bg-gradient-to-r from-slate-900 to-slate-800 border-b-2 border-green-500/50" />
      <div className="flex-1 min-h-0 space-y-3 p-3 sm:p-4">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-10 w-full max-w-xl rounded-md" />
        <Skeleton className="h-[min(50vh,28rem)] w-full rounded-lg" />
      </div>
    </div>
  );
}

function TabPageWithPerf({
  path,
  LazyPage,
  onReady,
}: {
  path: string;
  LazyPage: ComponentType;
  onReady?: () => void;
}) {
  useEffect(() => {
    if (!isNavigationPerfEnabled()) return;
    recordChunkLoadEnd(path);
  }, [path]);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return <LazyPage />;
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
  const [showSoftHint, setShowSoftHint] = useState(false);
  useEffect(() => {
    if (!active) {
      setTimedOut(false);
      setShowSoftHint(false);
      return;
    }
    if (isNavigationPerfEnabled()) {
      recordChunkLoadStart(path);
    }
    const hintTimer = window.setTimeout(() => setShowSoftHint(true), SOFT_LOADING_HINT_MS);
    const timer = window.setTimeout(() => {
      console.warn(`[TabCachedPages] Load timeout for tab: ${path || "dashboard"}`);
      setTimedOut(true);
    }, getTabLoadTimeoutMs(path));
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(hintTimer);
    };
  }, [active, path]);

  if (!active) return null;

  if (ENTRY_TAB_SHELL_PATHS.has(path) && !timedOut) {
    return <EntryTabShellFallback />;
  }

  if (LIST_DASHBOARD_SHELL_PATHS.has(path) && !timedOut) {
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
    <div className="flex flex-1 h-full min-h-[40vh] w-full flex-col items-center justify-center gap-3">
      <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      {showSoftHint && (
        <p className="text-xs text-muted-foreground">Still loading… slow network</p>
      )}
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
  onActivePaneReady,
}: {
  path: string;
  active: boolean;
  roles?: TabPageRole[];
  layout: TabPageLayout;
  onActivePaneReady?: (path: string) => void;
}) {
  const paneRef = useRef<HTMLDivElement>(null);
  const wasActiveRef = useRef(active);
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;

    if (wasActiveRef.current && !active) {
      tabScrollPositions.set(path, readScrollPositions(pane));
    }

    if (!wasActiveRef.current && active) {
      const saved = tabScrollPositions.get(path);
      if (saved?.length) {
        requestAnimationFrame(() => {
          if (paneRef.current) writeScrollPositions(paneRef.current, saved);
        });
      }
    }

    wasActiveRef.current = active;
  }, [active, path]);

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
        <TabPageWithPerf
          path={path}
          LazyPage={LazyPage}
          onReady={active ? () => onActivePaneReady?.(path) : undefined}
        />
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
      ref={paneRef}
      className={cn(
        "flex flex-col min-h-0",
        active ? "flex-1 h-full w-full" : "hidden",
      )}
      aria-hidden={!active}
      data-tab-cache-path={path}
    >
      {withRole}
    </div>
  );
}

type TabCachedPagesProps = {
  /** Paths to keep mounted (open window tabs). */
  paths: string[];
  /** Current URL path segment — which cached pane is visible. */
  activePath: string;
  /** Fired when the active pane's lazy chunk has mounted (Suspense resolved). */
  onActivePaneReady?: (path: string) => void;
};

/**
 * Tally-style window tabs: keep each visited module mounted (hidden) so switching
 * tabs does not reload lazy chunks or lose form state.
 *
 * On full reload only the active tab is mounted first — other open tabs mount when
 * the user switches to them (avoids loading 8+ dashboards at once).
 */
export function TabCachedPages({ paths, activePath, onActivePaneReady }: TabCachedPagesProps) {
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

  const prevActivePathRef = useRef(activePath);
  useEffect(() => {
    if (!isTabCachePath(activePath)) return;
    if (isNavigationPerfEnabled() && prevActivePathRef.current !== activePath) {
      recordTabSwitch(activePath, {
        from: prevActivePathRef.current,
        mounted: [...mountedPaths],
      });
    }
    prevActivePathRef.current = activePath;
    touchTabActiveAt(activePath);
    setMountedPaths((prev) => {
      if (electronSingleTab) {
        const next = new Set<string>([activePath]);
        for (const path of prev) {
          if (path !== activePath && isProtectedTabPath(path)) next.add(path);
        }
        return next;
      }
      if (prev.has(activePath)) return prev;
      const next = new Set(prev);
      next.add(activePath);
      touchTabActiveAt(activePath);
      return next;
    });
    evictIdleMountedTabs();
  }, [activePath, electronSingleTab, touchTabActiveAt, evictIdleMountedTabs]);

  // Browser/PWA: mount tabs lazily — only when the user activates them.
  // The activePath effect above already mounts the visible tab, and protected
  // working screens (POS, bill entry, etc.) stay mounted once visited.
  // Eagerly mounting every saved tab on cold load was triggering a chunk
  // waterfall and the "Taking longer than expected" screen on slow Wi-Fi.

  useEffect(() => {
    if (electronSingleTab) return;
    const id = window.setInterval(evictIdleMountedTabs, IDLE_UNMOUNT_CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [evictIdleMountedTabs, electronSingleTab]);

  // Prefetch dashboard + POS dashboard chunks while POS is open; pre-mount hidden pane only in browser (not Electron).
  useEffect(() => {
    const shouldWarmDashboard =
      uniquePaths.includes("") ||
      uniquePaths.includes("pos-sales") ||
      activePath === "pos-sales";
    if (!shouldWarmDashboard) return;

    prefetchTabPage("");
    prefetchTabPage("pos-dashboard");
    // Note: previously also pre-mounted the dashboard pane in browser. Removed
    // to avoid a hidden React tree + chunk waterfall on cold load.
  }, [uniquePaths, activePath]);

  // Prefetch inventory chunks while inventory tabs are open; pre-mount product dashboard in browser.
  useEffect(() => {
    const inventoryPaths = [
      "product-dashboard",
      "products",
      "purchase-bill-dashboard",
      "purchase-bills",
      "product-entry",
      "barcode-printing",
    ];
    const shouldWarmInventory = inventoryPaths.some(
      (p) => uniquePaths.includes(p) || activePath === p,
    );
    if (!shouldWarmInventory) return;

    prefetchTabPage("product-dashboard");
    prefetchTabPage("purchase-bill-dashboard");
    prefetchTabPage("purchase-bills");
    prefetchTabPage("purchase-return-dashboard");
    prefetchTabPage("purchase-returns");
    prefetchTabPage("purchase-entry");
    prefetchTabPage("product-entry");
    prefetchTabPage("barcode-printing");
    // Note: previously also pre-mounted product-dashboard. Removed to avoid
    // hidden chunk waterfall on cold load.
  }, [uniquePaths, activePath]);

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
            onActivePaneReady={onActivePaneReady}
          />
        );
      })}
    </div>
  );
}
