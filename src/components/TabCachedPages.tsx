import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { AlertCircle } from "lucide-react";
import {
  getLazyTabPage,
  TAB_PAGE_REGISTRY,
  isTabCachePath,
  isTabPageChunkLoaded,
  prefetchCriticalEntryChunks,
  prefetchTabPage,
  prefetchTabPagesIdle,
  POST_LOGIN_WEB_IDLE_ADMIN_PREFETCH_TAB_PATHS,
  MASTER_TAB_PREFETCH_PATHS,
  INVENTORY_TAB_PREFETCH_PATHS,
  SALES_TAB_PREFETCH_PATHS,
  ACCOUNTS_TAB_PREFETCH_PATHS,
  resetTabPageChunk,
  refreshStaleInFlightTabChunk,
  resolveTabCachePath,
  type TabPageLayout,
  type TabPageRole,
} from "@/lib/tabPageRegistry";
import { isCacheableEntryTabPath, isEntryTabPath } from "@/lib/entryPageLayout";
import { RoleProtectedRoute } from "@/components/RoleProtectedRoute";
import { TabPaneErrorBoundary } from "@/components/TabPaneErrorBoundary";
import { Layout } from "@/components/Layout";
import { FullScreenLayout } from "@/components/FullScreenLayout";
import { POSLayout } from "@/components/POSLayout";
import { PosDeliveryChallanLayout } from "@/components/PosDeliveryChallanLayout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DashboardSkeleton } from "@/components/ui/skeletons";
import { AppBootSplash } from "@/components/AppBootSplash";
import { reloadAppWithUpdateCheck } from "@/lib/appReload";
import { tabLoadMessage } from "@/lib/tabLoadLabels";
import { resolveTabLoadShell } from "@/lib/tabLoadShell";
import { isElectronShell, shouldElectronMountOnlyActiveTab } from "@/lib/electronShell";
import { beginUserPriorityLoad, pauseBackgroundPrefetch } from "@/lib/chunkLoadRetry";
import {
  isTabCachePaneContentReady,
  isTabCachePaneMounted,
  markTabCachePaneContentReady,
  markTabCachePaneMounted,
  markTabCachePaneUnmounted,
} from "@/lib/tabCacheMountRegistry";
import {
  isPaintedTabSibling,
  shouldSilentTabSuspenseFallback,
} from "@/lib/tabCacheReadiness";
import { TabCacheLayoutContext } from "@/contexts/TabCacheLayoutContext";
import {
  isNavigationPerfEnabled,
  recordChunkLoadEnd,
  recordChunkLoadStart,
  recordTabSwitch,
} from "@/lib/navigationPerfDiagnostics";

/** Hidden tab panes idle longer than this may be unmounted (read-only dashboards only). */
const IDLE_UNMOUNT_MS = 600_000;
/** Windows desktop: evict idle dashboards sooner to avoid renderer OOM / blank window. */
const ELECTRON_IDLE_UNMOUNT_MS = 120_000;
/** Avoid churn when few tabs are open — never auto-unmount at or below this count. */
const MIN_KEEP_TABS = 3;
const ELECTRON_MIN_KEEP_TABS = 2;
const IDLE_UNMOUNT_CHECK_INTERVAL_MS = 60_000;

/** Heavy admin screens — only these may idle-evict when many tabs are open. */
// NOTE: Settings was previously evictable, but users reported the tab "reloading"
// after minimize/tab-switch. Keep it mounted like Sales/Purchase dashboards.
const IDLE_EVICT_ALLOWED_PATHS = new Set(["user-rights"]);

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
  "third-party-entry",
  "third-party-balances",
  "ledger-opening-balances",
  "customers",
  "suppliers",
  "employees",
  "salesman-commission",
  "pos-dashboard",
  "sales-invoice-dashboard",
  "settings",
  "customer-account-statement",
  "customer-ledger-report",
  "customer-points-report",
  "customer-balance-activity",
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

/** Hidden tabs use display:none — on return, force scroll containers to recalc overflow. */
function nudgePaneScrollLayout(root: HTMLElement) {
  collectTabScrollTargets(root).forEach((el) => {
    const top = el.scrollTop;
    el.style.overflowY = "hidden";
    // Chrome logs this as [Violation] Forced reflow. Do not remove without a
    // replacement — it unsticks tab-return scroll. An expanded shop stack that
    // lands here should be ~1 frame, not 500ms, unless the pane subtree is huge.
    void el.offsetHeight;
    el.style.overflowY = "";
    el.scrollTop = top;
  });
}

/** Screens with live carts / unsaved bill work — never idle-evict. */
const LIVE_WORK_TAB_PATHS = new Set([
  "pos-sales",
  "pos-delivery-challan",
  "sales-invoice",
  "purchase-entry",
  "sale-return-entry",
  "purchase-return-entry",
  "product-entry",
  "quotation-entry",
  "sale-order-entry",
]);

/** Core workflow dashboards — stay mounted on Electron tab switch (matches browser). */
const ELECTRON_WORKFLOW_DASHBOARD_PATHS = new Set([
  "purchase-bills",
  "purchase-bill-dashboard",
  "pos-dashboard",
  "sales-invoice-dashboard",
  // Match browser behavior — keep these dashboards mounted on Electron too so
  // tab change / window minimize does not reload the page.
  "purchase-returns",
  "purchase-return-dashboard",
  "product-dashboard",
  "products",
  "accounts",
  "payments-dashboard",
  "chart-of-accounts",
  "journal-vouchers",
  "manual-journal",
  "third-party-entry",
  "third-party-balances",
  "ledger-opening-balances",
  "customer-account-statement",
  "customer-ledger-report",
  "customer-points-report",
  "customer-balance-activity",
  // Party masters — Customers ↔ Suppliers must reopen instantly (no remount splash).
  "customers",
  "suppliers",
  "employees",
  "salesman-commission",
  // Inventory secondary lists — same keep-alive as Purchase/Product dashboards.
  "purchase-orders",
  "bulk-product-update",
  "stock-settlement",
  "settings",
]);

function isProtectedTabPath(path: string): boolean {
  const resolved = resolveTabCachePath(path);
  if (isEntryTabPath(resolved)) return true;
  if (LIVE_WORK_TAB_PATHS.has(resolved)) return true;
  if (IDLE_EVICT_ALLOWED_PATHS.has(resolved)) return false;
  if (isElectronShell() && ELECTRON_WORKFLOW_DASHBOARD_PATHS.has(resolved)) return true;
  // Browser/PWA: keep dashboards mounted for instant tab switch.
  if (!isElectronShell()) {
    return EXPLICIT_PROTECTED_TAB_PATHS.has(resolved) || isTabCachePath(resolved);
  }
  // Electron: evict idle list dashboards — keeping every tab mounted causes OOM crashes.
  return false;
}

function getIdleUnmountMs(): number {
  return isElectronShell() ? ELECTRON_IDLE_UNMOUNT_MS : IDLE_UNMOUNT_MS;
}

function getMinKeepTabs(): number {
  return isElectronShell() ? ELECTRON_MIN_KEEP_TABS : MIN_KEEP_TABS;
}

/** Time before showing the "Retry tab / Refresh app" card. */
const TAB_LOAD_TIMEOUT_MS = 6_000;
/**
 * Large admin chunks (Settings) — keep slightly longer than default, but not 45s:
 * users were stuck on skeleton + "Still loading…" until a manual full reload.
 */
const HEAVY_TAB_LOAD_TIMEOUT_MS = 6_000;
/** Soft remount + bandwidth pause — fire early so hung cold chunks recover. */
const SOFT_LOADING_HINT_MS = 3_000;
/** Drop a background prefetch that never settled before remounting the active tab. */
const STALE_IN_FLIGHT_MS = 4_000;

const HEAVY_TAB_PATHS = new Set([
  "settings",
  "user-rights",
  "barcode-printing",
  "accounts",
  "third-party-entry",
  "third-party-balances",
  "pos-dashboard",
  "sales-invoice-dashboard",
  // Canonical URL slug + legacy registry key (resolveTabCachePath → purchase-bills)
  "purchase-bills",
  "purchase-bill-dashboard",
  "pos-sales",
  "pos-delivery-challan",
  "sales-invoice",
  "purchase-entry",
  "product-entry",
  "sale-return-entry",
  "purchase-return-entry",
  "purchase-return-dashboard",
  "purchase-returns",
  "sale-return-dashboard",
  "product-dashboard",
  "products",
]);

function getTabLoadTimeoutMs(path: string): number {
  const resolved = resolveTabCachePath(path);
  return HEAVY_TAB_PATHS.has(resolved) || HEAVY_TAB_PATHS.has(path)
    ? HEAVY_TAB_LOAD_TIMEOUT_MS
    : TAB_LOAD_TIMEOUT_MS;
}

function TabLoadShellView({ path }: { path: string }) {
  const shell = resolveTabLoadShell(path);
  const message = tabLoadMessage(path, shell);
  if (shell === "entry") {
    return <AppBootSplash message={message} />;
  }
  if (shell === "dashboard") {
    if (isElectronShell()) {
      return <AppBootSplash message={message} />;
    }
    return <DashboardSkeleton />;
  }
  return <AppBootSplash message={message} />;
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
  onSoftRetry,
  /** Sibling pane already on screen — keep it dimmed; do not paint a full loading page. */
  silent = false,
}: {
  active: boolean;
  path: string;
  onRetry: () => void;
  /** One automatic remount after soft hint — parent must gate to a single call per activation. */
  onSoftRetry?: () => void;
  silent?: boolean;
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
    // Count only foreground time: background tabs get their chunk fetches
    // throttled/paused by the browser, which used to fire a false timeout that
    // the user then saw as "Taking longer than expected" right after a refresh.
    const budgetMs = getTabLoadTimeoutMs(path);
    let elapsed = 0;
    let lastTick = Date.now();
    let softFired = false;
    const TICK_MS = 1_000;

    const interval = window.setInterval(() => {
      const now = Date.now();
      const delta = now - lastTick;
      lastTick = now;
      if (document.hidden) return;
      elapsed += delta;
      if (elapsed >= SOFT_LOADING_HINT_MS) {
        setShowSoftHint(true);
        if (!softFired) {
          softFired = true;
          console.warn(
            `[TabCachedPages] Soft-retry cold chunk: ${path || "dashboard"} (${Math.round(elapsed / 1000)}s)`,
          );
          onSoftRetry?.();
        }
      }
      if (elapsed < budgetMs) return;

      console.warn(
        `[TabCachedPages] Slow chunk still loading: ${path || "dashboard"} (${Math.round(elapsed / 1000)}s)`,
      );
      setTimedOut(true);
      window.clearInterval(interval);
    }, TICK_MS);

    const onVisible = () => {
      lastTick = Date.now();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, path, onSoftRetry, silent]);

  if (!active) return null;

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
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void reloadAppWithUpdateCheck();
              }}
            >
              Refresh app
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Desktop-like tab switch: keep the previous pane visible (dimmed) instead of
  // replacing it with DashboardSkeleton / AppBootSplash (Sales POS ↔ Invoice feel).
  // After the soft hint, always show a route-shaped shell — silent null left users
  // on a blank white pane until the 6s timeout when a sibling was dimmed behind.
  if (silent && !showSoftHint) return null;

  // Immediate route-shaped shell (<150ms target). Soft hint is second-stage only.
  return (
    <div className="relative flex flex-1 h-full min-h-0 w-full flex-col">
      <TabLoadShellView path={path} />
      {showSoftHint && (
        <p className="pointer-events-none absolute bottom-6 left-0 right-0 text-center text-xs text-muted-foreground">
          {tabLoadMessage(path, resolveTabLoadShell(path)).replace(/^Opening /, "Still opening ").replace(/…$/, " — slow network")}
        </p>
      )}
    </div>
  );
}

function wrapWithLayout(layout: TabPageLayout, page: React.ReactNode) {
  switch (layout) {
    case "pos":
      return <POSLayout>{page}</POSLayout>;
    case "pos-dc":
      return <PosDeliveryChallanLayout>{page}</PosDeliveryChallanLayout>;
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
  cacheableEntryRescueKey = 0,
  /** Destination chunk still loading — keep outgoing pane mounted but visibly dimmed (never unmount). */
  dimOutgoing = false,
  /** Suppress active Suspense shell when a sibling pane is already painted. */
  silentFallback = false,
}: {
  path: string;
  active: boolean;
  roles?: TabPageRole[];
  layout: TabPageLayout;
  onActivePaneReady?: (path: string) => void;
  cacheableEntryRescueKey?: number;
  dimOutgoing?: boolean;
  silentFallback?: boolean;
}) {
  const paneRef = useRef<HTMLDivElement>(null);
  const wasActiveRef = useRef(active);
  const hasPaneMountedRef = useRef(false);
  const softRetriedRef = useRef(false);
  const [loadKey, setLoadKey] = useState(0);

  const handlePaneReady = useCallback(() => {
    hasPaneMountedRef.current = true;
    markTabCachePaneContentReady(path);
    onActivePaneReady?.(path);
  }, [onActivePaneReady, path]);

  useEffect(() => {
    markTabCachePaneMounted(path);
    return () => markTabCachePaneUnmounted(path);
  }, [path]);

  useEffect(() => {
    if (active) softRetriedRef.current = false;
  }, [active, path]);

  useEffect(() => {
    const pane = paneRef.current;

    if (pane && wasActiveRef.current && !active) {
      tabScrollPositions.set(path, readScrollPositions(pane));
    }

    let raf = 0;
    let timer = 0;
    if (!wasActiveRef.current && active) {
      const saved = tabScrollPositions.get(path);
      const restorePane = () => {
        const current = paneRef.current;
        if (!current) return;
        nudgePaneScrollLayout(current);
        if (saved?.length) writeScrollPositions(current, saved);
      };
      raf = requestAnimationFrame(restorePane);
      timer = window.setTimeout(restorePane, 80);
      // Only signal ready when chunk already mounted — premature ready hid <Outlet> before Suspense resolved.
      if (hasPaneMountedRef.current) {
        requestAnimationFrame(() => onActivePaneReady?.(path));
      }
    }

    wasActiveRef.current = active;
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (timer) window.clearTimeout(timer);
    };
  }, [active, path, onActivePaneReady]);

  const retryTabLoad = useCallback(() => {
    hasPaneMountedRef.current = false;
    resetTabPageChunk(path);
    prefetchTabPage(path, { intent: true });
    setLoadKey((k) => k + 1);
  }, [path]);

  const softRetryTabLoad = useCallback(() => {
    if (softRetriedRef.current) return;
    softRetriedRef.current = true;
    // Yield bandwidth to this remount — idle admin prefetch must not keep starving Settings.
    pauseBackgroundPrefetch(60_000);
    retryTabLoad();
  }, [retryTabLoad]);

  const LazyPage = getLazyTabPage(path);
  if (!LazyPage) return null;

  const page = (
    <TabPaneErrorBoundary tabPath={path} onRetry={retryTabLoad}>
      <Suspense
        key={`${loadKey}-${active && isCacheableEntryTabPath(path) ? cacheableEntryRescueKey : 0}`}
        fallback={
          <TabPageFallback
            active={active}
            path={path}
            onRetry={retryTabLoad}
            onSoftRetry={softRetryTabLoad}
            silent={silentFallback}
          />
        }
      >
        <TabPageWithPerf
          path={path}
          LazyPage={LazyPage}
          onReady={active ? handlePaneReady : undefined}
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
        active
          ? "relative z-10 flex-1 h-full w-full"
          : dimOutgoing
            ? "absolute inset-0 z-0 opacity-40 pointer-events-none saturate-50"
            : "hidden",
      )}
      aria-hidden={!active}
      data-tab-cache-path={path}
      data-tab-cache-dimmed={dimOutgoing ? "true" : undefined}
    >
      <TabCacheLayoutContext.Provider value>
        {withRole}
      </TabCacheLayoutContext.Provider>
    </div>
  );
}

type TabCachedPagesProps = {
  /** Paths to keep mounted (open window tabs). */
  paths: string[];
  /** Current URL path segment — which cached pane is visible. */
  activePath: string;
  /** OrgLayout bumps this to remount a stuck cacheable entry without Outlet fallback. */
  cacheableEntryRescueKey?: number;
  /** Fired when the active pane's lazy chunk has mounted (Suspense resolved). */
  onActivePaneReady?: (path: string) => void;
  /** Fired when an idle tab is unmounted from memory (Electron OOM guard). */
  onTabEvicted?: (path: string) => void;
};

/**
 * Tally-style window tabs: keep each visited module mounted (hidden) so switching
 * tabs does not reload lazy chunks or lose form state.
 *
 * On full reload only the active tab is mounted first — other open tabs mount when
 * the user switches to them (avoids loading 8+ dashboards at once).
 */
export function TabCachedPages({
  paths,
  activePath,
  cacheableEntryRescueKey = 0,
  onActivePaneReady,
  onTabEvicted,
}: TabCachedPagesProps) {
  const resolvedActivePath = resolveTabCachePath(activePath);
  const uniquePaths = useMemo(
    () => [...new Set(paths.map(resolveTabCachePath).filter((p) => isTabCachePath(p)))],
    [paths],
  );

  const [mountedPaths, setMountedPaths] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (isTabCachePath(resolvedActivePath)) initial.add(resolvedActivePath);
    return initial;
  });

  const electronSingleTab = shouldElectronMountOnlyActiveTab();
  const lastActiveAtRef = useRef<Map<string, number>>(new Map());
  const prevMountedPathsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!onTabEvicted) {
      prevMountedPathsRef.current = new Set(mountedPaths);
      return;
    }
    for (const path of prevMountedPathsRef.current) {
      if (!mountedPaths.has(path)) {
        onTabEvicted(path);
      }
    }
    prevMountedPathsRef.current = new Set(mountedPaths);
  }, [mountedPaths, onTabEvicted]);

  const touchTabActiveAt = useCallback((path: string) => {
    lastActiveAtRef.current.set(path, Date.now());
  }, []);

  const evictIdleMountedTabs = useCallback(() => {
    if (electronSingleTab) return;

    const minKeepTabs = getMinKeepTabs();
    const idleUnmountMs = getIdleUnmountMs();

    setMountedPaths((prev) => {
      if (prev.size <= minKeepTabs) return prev;

      const now = Date.now();
      const idleCandidates: string[] = [];

      for (const path of prev) {
        if (path === resolvedActivePath) continue;
        if (isProtectedTabPath(path)) continue;
        const lastActive = lastActiveAtRef.current.get(path) ?? 0;
        if (now - lastActive > idleUnmountMs) {
          idleCandidates.push(path);
        }
      }

      if (idleCandidates.length === 0) return prev;

      const next = new Set(prev);
      for (const path of idleCandidates) {
        if (next.size <= minKeepTabs) break;
        next.delete(path);
      }

      return next.size === prev.size ? prev : next;
    });
  }, [resolvedActivePath, electronSingleTab]);

  const prevActivePathRef = useRef(resolvedActivePath);
  useEffect(() => {
    if (!isTabCachePath(resolvedActivePath)) return;
    if (isNavigationPerfEnabled() && prevActivePathRef.current !== resolvedActivePath) {
      recordTabSwitch(resolvedActivePath, {
        from: prevActivePathRef.current,
        mounted: [...mountedPaths],
      });
    }
    prevActivePathRef.current = resolvedActivePath;
    touchTabActiveAt(resolvedActivePath);
    // Cross-layout (POS outlet → purchase-entry): drop hung idle prefetches before mount.
    if (
      isCacheableEntryTabPath(resolvedActivePath) &&
      !isTabCachePaneContentReady(resolvedActivePath)
    ) {
      refreshStaleInFlightTabChunk(resolvedActivePath, 0);
    } else if (!isTabPageChunkLoaded(resolvedActivePath)) {
      refreshStaleInFlightTabChunk(resolvedActivePath, STALE_IN_FLIGHT_MS);
    }
    prefetchTabPage(resolvedActivePath, { intent: true });
    setMountedPaths((prev) => {
      if (electronSingleTab) {
        const next = new Set<string>([resolvedActivePath]);
        for (const path of prev) {
          if (path !== resolvedActivePath && isProtectedTabPath(path)) next.add(path);
        }
        return next;
      }
      if (prev.has(resolvedActivePath)) return prev;
      const next = new Set(prev);
      next.add(resolvedActivePath);
      touchTabActiveAt(resolvedActivePath);
      return next;
    });
    evictIdleMountedTabs();

    // Pause sequential idle prefetch while the destination chunk is still cold.
    // Does NOT abort in-flight web-critical parallel imports (see Step 1 report).
    if (!isTabPageChunkLoaded(resolvedActivePath)) {
      return beginUserPriorityLoad();
    }
  }, [resolvedActivePath, electronSingleTab, touchTabActiveAt, evictIdleMountedTabs]);

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

  // Inventory — intent-warm all siblings (Sales-tab parity; Save-Data must not skip).
  useEffect(() => {
    const shouldWarmInventory = INVENTORY_TAB_PREFETCH_PATHS.some(
      (p) => uniquePaths.includes(p) || activePath === p,
    );
    if (!shouldWarmInventory) return;
    for (const path of INVENTORY_TAB_PREFETCH_PATHS) {
      prefetchTabPage(path, { intent: true });
    }
  }, [uniquePaths, activePath]);

  // Party masters — intent-warm all siblings (Customers ↔ Suppliers ↔ Employees ↔ Commission).
  useEffect(() => {
    const shouldWarmMasters = MASTER_TAB_PREFETCH_PATHS.some(
      (p) => uniquePaths.includes(p) || activePath === p,
    );
    if (!shouldWarmMasters) return;
    for (const path of MASTER_TAB_PREFETCH_PATHS) {
      prefetchTabPage(path, { intent: true });
    }
  }, [uniquePaths, activePath]);

  // Sales — explicit mutual warm (documents POS Dashboard ↔ Invoice Dashboard “no loading”).
  useEffect(() => {
    const shouldWarmSales = SALES_TAB_PREFETCH_PATHS.some(
      (p) => uniquePaths.includes(p) || activePath === p,
    );
    if (!shouldWarmSales) return;
    for (const path of SALES_TAB_PREFETCH_PATHS) {
      prefetchTabPage(path, { intent: true });
    }
  }, [uniquePaths, activePath]);

  // Accounts / payments / ledger — intent-warm siblings (Payments header ↔ Accounts tab).
  useEffect(() => {
    const shouldWarmAccounts = ACCOUNTS_TAB_PREFETCH_PATHS.some(
      (p) => uniquePaths.includes(p) || activePath === p,
    );
    if (!shouldWarmAccounts) return;
    for (const path of ACCOUNTS_TAB_PREFETCH_PATHS) {
      prefetchTabPage(path, { intent: true });
    }
  }, [uniquePaths, activePath]);

  useEffect(() => {
    return prefetchTabPagesIdle(uniquePaths, activePath);
  }, [uniquePaths, activePath]);

  // After the browser tab was hidden/idle, re-warm entry chunks so Purchase /
  // Product Entry open without a cold "Loading bill screen…" wait.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      prefetchCriticalEntryChunks();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Warm admin chunks that cold-load on web (Settings blank / slow-network shell).
  // Active path uses intent so Save-Data/2g cannot skip a real navigation.
  useEffect(() => {
    for (const path of POST_LOGIN_WEB_IDLE_ADMIN_PREFETCH_TAB_PATHS) {
      if (activePath === path) {
        prefetchTabPage(path, { intent: true });
      } else if (uniquePaths.includes(path)) {
        prefetchTabPage(path);
      }
    }
  }, [activePath, uniquePaths]);

  // Include active path on the same render as navigation (do not wait for useEffect)
  // so we never paint a frame where every pane is hidden.
  const pathsToRender = useMemo(() => {
    const mounted = new Set(mountedPaths);
    if (isTabCachePath(resolvedActivePath)) mounted.add(resolvedActivePath);
    return uniquePaths.filter((path) => mounted.has(path));
  }, [mountedPaths, resolvedActivePath, uniquePaths]);

  const activeChunkReady =
    !isTabCachePath(resolvedActivePath) || isTabPageChunkLoaded(resolvedActivePath);
  const dimOutgoingDuringLoad = !activeChunkReady;
  // Ready sibling on screen → silent Suspense (no full-page loading shell).
  const hasReadySiblingPane = pathsToRender.some((p) => {
    if (p === resolvedActivePath) return false;
    return isPaintedTabSibling({
      mounted: isTabCachePaneMounted(p),
      contentReady: isTabCachePaneContentReady(p),
    });
  });
  const silentColdNav =
    dimOutgoingDuringLoad &&
    shouldSilentTabSuspenseFallback(
      hasReadySiblingPane,
      resolveTabLoadShell(resolvedActivePath),
    );

  if (uniquePaths.length === 0) return null;

  return (
    <div className="relative flex flex-1 flex-col min-h-0 min-w-0 h-full w-full overflow-hidden">
      {pathsToRender.map((path) => {
        const meta = TAB_PAGE_REGISTRY[path];
        if (!meta || !getLazyTabPage(path)) return null;
        const isActive = path === resolvedActivePath;
        return (
          <CachedTabPane
            key={path === "" ? "__dashboard__" : path}
            path={path}
            active={isActive}
            dimOutgoing={!isActive && dimOutgoingDuringLoad}
            silentFallback={isActive && silentColdNav}
            layout={meta.layout}
            roles={meta.roles}
            cacheableEntryRescueKey={cacheableEntryRescueKey}
            onActivePaneReady={onActivePaneReady}
          />
        );
      })}
    </div>
  );
}
