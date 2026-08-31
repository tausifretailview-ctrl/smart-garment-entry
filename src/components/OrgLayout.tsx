import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Outlet, useParams, useLocation } from "react-router-dom";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { AppBootSplash } from "@/components/AppBootSplash";
import { DashboardSkeleton } from "@/components/ui/skeletons";
import OrgAuth from "@/pages/OrgAuth";
import { storeOrgSlug } from "@/lib/orgSlug";
import { applyOrgPwaManifest } from "@/lib/orgPwaManifest";
import { hideAppBootSplash } from "@/lib/appBootSplash";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GlobalShortcuts } from "@/components/GlobalShortcuts";
import { useWindowTabs } from "@/contexts/WindowTabsContext";
import { TabCachedPages } from "@/components/TabCachedPages";
import {
  isCacheableEntryTabPath,
  isEntryTabPath,
  isFillHeightShellPath,
  isMainDashboardPath,
  isNoSidebarEntrySegment,
  isViewportFixedEntryPath,
} from "@/lib/entryPageLayout";
import {
  isTabCachePath,
  isTabPageChunkInFlight,
  isTabPageChunkLoaded,
  prefetchPostLoginCriticalPages,
  prefetchPostLoginIdlePages,
  prefetchTabPage,
  resetTabPageChunk,
  resolveTabCachePath,
} from "@/lib/tabPageRegistry";
import { bumpRecentTabPaneRetention } from "@/lib/recentTabPaneRetention";
import { isElectronShell, shouldElectronMountOnlyActiveTab } from "@/lib/electronShell";
import {
  POS_CONTEXT_PURCHASE_PREFETCH_PATHS,
  POS_CONTEXT_WARM_TAB_PATH,
} from "@/lib/chunkLoadRetry";
import { syncElectronViewportHeight } from "@/lib/electronViewportSync";
import {
  isNavigationPerfEnabled,
  recordNavigation,
  recordRenderPath,
  recordTabCacheSnapshot,
  recordRenderOwnerDecision,
  recordBlankFrame,
  type RenderOwner,
} from "@/lib/navigationPerfDiagnostics";
import {
  classifySpinnerChrome,
  recordPwaColdOpenSnapshot,
} from "@/lib/pwaColdOpenDiagnostics";
import { cn } from "@/lib/utils";
import { invoiceDashboardPrefetchQueryOptions } from "@/utils/invoiceDashboardData";
import {
  isTabCachePaneContentReady,
  isTabCachePaneMounted,
} from "@/lib/tabCacheMountRegistry";
import {
  hasPaintedWorkspaceContent,
  isLongBudgetOutletEntryPath,
  isPaintedTabSibling,
  LONG_BUDGET_STUCK_RESCUE_MS,
  shouldArmLongBudgetStuckRescue,
  shouldArmOutletFallbackTimer,
  shouldFireLongBudgetStuckRescue,
  shouldRemountStuckCacheableEntry,
  usesLongLoadBudget as usesLongLoadBudgetForNav,
  workspaceHasCommittedEntryUi,
} from "@/lib/tabCacheReadiness";
import { prefetchPurchaseDashboardQueries } from "@/utils/purchaseDashboardPrefetch";
import { prefetchMainDashboardQueries } from "@/utils/mainDashboardPrefetch";
import { prefetchPosDashboardQueries } from "@/utils/posDashboardPrefetch";
import { DesktopAppShell } from "@/components/DesktopAppShell";
import { SharedAppShellContext } from "@/contexts/SharedAppShellContext";
import { useShowDesktopChrome } from "@/hooks/useDesktopViewPreference";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { formatDocumentTitle } from "@/lib/pageTitles";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

/** Sentinel — no cached pane is active while a bill-entry screen uses <Outlet>. */
const TAB_CACHE_INACTIVE = "__none__";

/** How long after a navigation the workspace may stay empty before we rescue it. */
const BLANK_FRAME_GRACE_MS = 1_200;
/** Stuck tab-cache Suspense → hand route to <Outlet> (with App DashboardSkeleton). */
const OUTLET_FALLBACK_MS = 4_000;
/** Cacheable entry stuck on load shell (POS → purchase-entry) → remount chunk, not Outlet. */
const CACHEABLE_ENTRY_STUCK_RESCUE_MS = LONG_BUDGET_STUCK_RESCUE_MS;

function getOrgPathSegment(pathname: string, orgSlug?: string): string {
  if (orgSlug && pathname.startsWith(`/${orgSlug}`)) {
    return pathname.slice(orgSlug.length + 2) || "";
  }
  return pathname.replace(/^\//, "");
}

export const OrgLayout = () => {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, loading: authLoading } = useAuth();
  const {
    currentOrganization,
    organizations,
    loading: orgLoading,
    fetchError: orgFetchError,
    hasResolvedOrganizations,
    switchOrganization,
    refetchOrganizations,
  } = useOrganization();
  const queryClient = useQueryClient();
  const [isOrgSynced, setIsOrgSynced] = useState(false);
  const [accessDeniedForSlug, setAccessDeniedForSlug] = useState<string | null>(null);
  /** Tab-cache pane has mounted for the current path — keep Outlet as fallback until then. */
  const [tabPaneReady, setTabPaneReady] = useState(false);
  /**
   * If the cached pane never signals ready (chunk hang / deploy skew), fall back to
   * <Outlet> so Purchase Bills / dashboards are not stuck on DashboardSkeleton forever.
   */
  const [forceOutletFallback, setForceOutletFallback] = useState(false);
  /** Bumped to remount a stuck cacheable-entry tab-cache pane (draft-safe — no Outlet). */
  const [cacheableEntryRescueKey, setCacheableEntryRescueKey] = useState(0);
  const cacheableEntryRescuedPathRef = useRef<string | null>(null);
  /** Bumped to remount a stuck long-budget Outlet entry (POS / bill screens). */
  const [outletRescueKey, setOutletRescueKey] = useState(0);
  const outletRescuedPathRef = useRef<string | null>(null);
  /** Paths whose lazy chunk already mounted — skip Outlet flash when switching back. */
  const tabPaneReadyPathsRef = useRef<Set<string>>(new Set());
  /** Workspace container — watched by the blank-frame watchdog. */
  const workspaceRef = useRef<HTMLDivElement>(null);

  const isTabPaneReadyForPath = useCallback((path: string): boolean => {
    const canonical = resolveTabCachePath(path);
    // Wrapper mount + lazy content committed — not prefetch / not empty Suspense shell.
    if (
      isTabCachePaneMounted(canonical) &&
      isTabCachePaneContentReady(canonical)
    ) {
      return true;
    }
    if (tabPaneReadyPathsRef.current.has(canonical)) return true;
    for (const recorded of tabPaneReadyPathsRef.current) {
      if (resolveTabCachePath(recorded) === canonical) return true;
    }
    return false;
  }, []);
  const location = useLocation();
  const { openWindows } = useWindowTabs();
  const showDesktopChrome = useShowDesktopChrome();
  const {
    hasMenuAccess,
    permissions,
    loading: permissionsLoading,
    isFetching: permissionsIsFetching,
    fetchStatus: permissionsFetchStatus,
  } = useUserPermissions();

  const currentPath = useMemo(
    () => getOrgPathSegment(location.pathname, orgSlug),
    [location.pathname, orgSlug],
  );
  const resolvedCurrentPath = resolveTabCachePath(currentPath);

  const isEntryPage = isEntryTabPath(currentPath);
  const isCacheableEntryActive = isCacheableEntryTabPath(currentPath);

  const isCacheableTabPath = (path: string) =>
    isTabCachePath(path) && (!isEntryTabPath(path) || isCacheableEntryTabPath(path));

  /**
   * Keep cacheable entry screens (purchase-entry) mounted after first visit even when
   * the user navigates away via sidebar — otherwise lineItems state is lost and a
   * 5000-row draft reload starts from scratch.
   */
  const [pinnedCacheableEntryPaths, setPinnedCacheableEntryPaths] = useState<string[]>([]);
  useEffect(() => {
    if (!isCacheableEntryTabPath(currentPath)) return;
    setPinnedCacheableEntryPaths((prev) =>
      prev.includes(currentPath) ? prev : [...prev, currentPath],
    );
  }, [currentPath]);

  /**
   * Recently visited cacheable panes (Settings, Accounts, ledgers, masters, …) —
   * kept in `tabPaths` so TabCachedPages does not unmount when sidebar nav
   * replaces the window-tab path. Default-retain + exclusion list (see
   * recentTabPaneRetention.ts). Disabled when Electron single-tab mount is on.
   */
  const recentVisitedAtRef = useRef<Map<string, number>>(new Map());
  const prevResolvedPathRef = useRef<string | null>(null);
  const [recentRetainedPaths, setRecentRetainedPaths] = useState<string[]>([]);

  useLayoutEffect(() => {
    const prev = prevResolvedPathRef.current;
    prevResolvedPathRef.current = resolvedCurrentPath;

    if (shouldElectronMountOnlyActiveTab()) {
      recentVisitedAtRef.current.clear();
      setRecentRetainedPaths((cur) => (cur.length === 0 ? cur : []));
      return;
    }

    const next = bumpRecentTabPaneRetention(
      recentVisitedAtRef.current,
      prev,
      resolvedCurrentPath,
    );
    setRecentRetainedPaths((cur) => {
      if (cur.length === next.length && cur.every((p, i) => p === next[i])) return cur;
      return next;
    });
  }, [resolvedCurrentPath]);

  const tabPaths = useMemo(() => {
    const set = new Set<string>();
    if (Array.isArray(openWindows)) {
      openWindows.forEach((w) => {
        const resolved = resolveTabCachePath(w.path);
        if (isCacheableTabPath(resolved)) set.add(resolved);
      });
    }
    pinnedCacheableEntryPaths.forEach((p) => {
      const resolved = resolveTabCachePath(p);
      if (isCacheableTabPath(resolved)) set.add(resolved);
    });
    // Retention alone keeps panes mounted — TabCachedPages pathsToRender needs no changes.
    recentRetainedPaths.forEach((p) => {
      const resolved = resolveTabCachePath(p);
      if (isCacheableTabPath(resolved)) set.add(resolved);
    });
    if (isCacheableTabPath(resolvedCurrentPath)) set.add(resolvedCurrentPath);
    return [...set];
  }, [openWindows, resolvedCurrentPath, pinnedCacheableEntryPaths, recentRetainedPaths]);

  // Decide the route owner before starting background work so the active pane gets
  // network priority on a cold load.
  const wantsTabCache = isCacheableTabPath(resolvedCurrentPath) && tabPaths.length > 0;
  const tabPaneWasReady = isTabPaneReadyForPath(resolvedCurrentPath);
  const paneMounted = isTabCachePaneMounted(resolvedCurrentPath);
  // Only trust prior onReady / content-ready — wrapper mount or prefetch alone must
  // not skip the 4s Outlet rescue (blank white page until 6s TabCachedPages timeout).
  const effectiveTabPaneReady = tabPaneReady || tabPaneWasReady;
  // Keep the previous pane visible (dimmed) while a sibling cold-loads — desktop UX.
  const hasReadySiblingPane = tabPaths.some((p) => {
    const resolved = resolveTabCachePath(p);
    if (resolved === resolvedCurrentPath) return false;
    return isPaintedTabSibling({
      mounted: isTabCachePaneMounted(resolved),
      contentReady:
        isTabCachePaneContentReady(resolved) || tabPaneReadyPathsRef.current.has(resolved),
    });
  });
  const showTabCacheDuringColdNav =
    wantsTabCache &&
    !isCacheableEntryActive &&
    !forceOutletFallback &&
    hasReadySiblingPane;

  // Warm bill-entry chunks after login. Electron: defer prefetch so login paint is not blocked.
  useEffect(() => {
    if (!isOrgSynced || !user || (wantsTabCache && !effectiveTabPaneReady)) return;

    let cancelIdlePrefetch: (() => void) | undefined;

    const run = () => {
      if (shouldElectronMountOnlyActiveTab()) {
        prefetchTabPage("pos-sales");
        prefetchTabPage("pos-delivery-challan");
        prefetchTabPage("");
        if (tabPaths.includes("settings")) {
          prefetchTabPage("settings", { intent: true });
        }
        return;
      }
      prefetchPostLoginCriticalPages();
      cancelIdlePrefetch = prefetchPostLoginIdlePages();
    };

    if (!isElectronShell()) {
      run();
      return () => cancelIdlePrefetch?.();
    }

    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(run, { timeout: 4_000 });
      return () => {
        cancelIdleCallback(id);
        cancelIdlePrefetch?.();
      };
    }
    const t = window.setTimeout(run, 1_500);
    return () => {
      window.clearTimeout(t);
      cancelIdlePrefetch?.();
    };
  }, [isOrgSynced, user, tabPaths, wantsTabCache, effectiveTabPaneReady]);

  // Warm Sales + Purchase dashboard first page after login — data ready before user opens tab.
  useEffect(() => {
    const orgId = currentOrganization?.id;
    if (
      !isOrgSynced ||
      !user ||
      !orgId ||
      permissionsLoading ||
      (wantsTabCache && !effectiveTabPaneReady)
    ) return;

    const warm = () => {
      // Do not prefetch Main Dashboard KPIs when User Rights disables main_dashboard.
      if (permissions === null || hasMenuAccess("main_dashboard")) {
        prefetchMainDashboardQueries(queryClient, orgId);
      }
      prefetchPosDashboardQueries(queryClient, supabase, orgId);
      const salesOpts = invoiceDashboardPrefetchQueryOptions(supabase, orgId);
      void queryClient.prefetchQuery({
        ...salesOpts,
        staleTime: 30_000,
      });
      prefetchPurchaseDashboardQueries(queryClient, supabase, orgId);
    };

    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(warm, { timeout: 5_000 });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(warm, 2_000);
    return () => window.clearTimeout(t);
  }, [
    isOrgSynced,
    user,
    currentOrganization?.id,
    queryClient,
    permissionsLoading,
    permissions,
    hasMenuAccess,
    wantsTabCache,
    effectiveTabPaneReady,
  ]);

  /**
   * Single source of truth for who paints the workspace.
   *
   * Previously `renderViaTabCache` and `hideTabCacheContainer` were computed
   * independently, which made "tab cache hidden AND Outlet suppressed" — a blank
   * white page — a reachable state nobody designed for. Both now derive from one
   * value, so that state is unrepresentable.
   *
   * Equivalence with the two old booleans (reviewer table — nothing silently merged):
   *
   *  case                                              old renderViaTabCache / hideContainer   new owner
   *  1. non-cacheable entry route (POS, bill entry)    false / true   (wantsTabCache=false)    outlet
   *  2. path not in tab registry (e.g. Insights)       false / true   (wantsTabCache=false)    outlet
   *  3. cacheable entry active (purchase-entry)        true  / false                          tab-cache
   *  4. pane ready for current path                    true  / false                          tab-cache
   *  5. cold nav with a ready sibling (dimmed)         true  / false                          tab-cache
   *  6. cold nav, no ready sibling (Suspense shell)    false / true                           outlet
   *  7. forceOutletFallback after rescue timer         false / true                           outlet
   *  8. wantsTabCache but tabPaths empty               false / n-a (container not rendered)   outlet
   *  9. "both hidden"                                  reachable, blank page                  impossible
   *
   * Cases 1-8 map 1:1 to the previous behaviour; case 9 is the bug being removed.
   */
  const renderOwner: RenderOwner =
    wantsTabCache &&
    !forceOutletFallback &&
    (isCacheableEntryActive || effectiveTabPaneReady || showTabCacheDuringColdNav)
      ? "tab-cache"
      : "outlet";
  const renderViaTabCache = renderOwner === "tab-cache";
  const hideTabCacheContainer = renderOwner !== "tab-cache";
  /**
   * Which cached pane is visible. Non-cacheable entry routes use INACTIVE so dashboard
   * panes stay mounted (hidden). Cacheable entry must use currentPath — otherwise
   * tabPaneReady hides both Outlet and TabCachedPages → blank blue screen.
   */
  const tabCacheActivePath =
    !wantsTabCache || (isEntryPage && !isCacheableEntryActive)
      ? TAB_CACHE_INACTIVE
      : resolvedCurrentPath;

  /**
   * Bill-entry screens hold unsaved draft state and legitimately show a boot splash
   * for longer. The blank-frame watchdog and the stuck-pane rescue timer MUST share
   * this one exemption — if they ever diverge, a draft screen could be swapped out
   * from under the user by the fast watchdog.
   */
  const usesLongLoadBudget = usesLongLoadBudgetForNav(
    isEntryPage,
    isCacheableEntryActive,
    isNoSidebarEntrySegment(resolvedCurrentPath),
  );

  // Reset on navigation — restore before paint so going back from an entry screen
  // (e.g. POS) does not flash the <Outlet> copy for one frame before the cached pane shows.
  useLayoutEffect(() => {
    setForceOutletFallback(false);
    cacheableEntryRescuedPathRef.current = null;
    outletRescuedPathRef.current = null;
    if (
      isCacheableTabPath(resolvedCurrentPath) &&
      tabPaths.length > 0 &&
      isTabPaneReadyForPath(resolvedCurrentPath)
    ) {
      setTabPaneReady(true);
    } else {
      setTabPaneReady(false);
    }
  }, [resolvedCurrentPath, tabPaths.length, isTabPaneReadyForPath]);

  // Safety net: stuck Suspense skeleton → fall back to route <Outlet>.
  // Must not be reached on a normal cold open after sibling-readiness uses paint,
  // not chunk download. If this warning still appears, the fix is incomplete —
  // do not retune this timer.
  useEffect(() => {
    const workspaceCanLoadChunk = Boolean(user && !orgLoading && isOrgSynced);
    if (
      !shouldArmOutletFallbackTimer({
        wantsTabCache,
        effectiveTabPaneReady,
        forceOutletFallback,
        usesLongLoadBudget,
        workspaceCanLoadChunk,
      })
    ) {
      return;
    }
    // 4s of *workspace* time — not splash. OrgLayout early-returns while
    // orgLoading / !isOrgSynced, so a timer started then ate the fetch window
    // (ELLA NOOR 2026-08-30: 4.4s wall, ~2.5s of actual Index import).
    const timeoutMs = OUTLET_FALLBACK_MS;
    const timer = window.setTimeout(() => {
      // Read chunk flags BEFORE resetTabPageChunk — that delete makes
      // isTabPageChunkLoaded("") look false even when the module had resolved.
      const chunkLoadedBeforeReset = isTabPageChunkLoaded(resolvedCurrentPath);
      const chunkInFlightBeforeReset = isTabPageChunkInFlight(resolvedCurrentPath);
      console.warn("[OrgLayout] Tab pane not ready — falling back to Outlet for", currentPath, {
        chunkLoadedBeforeReset,
        chunkInFlightBeforeReset,
      });
      const chrome = classifySpinnerChrome(typeof document !== "undefined" ? document : null);
      recordPwaColdOpenSnapshot({
        path: currentPath,
        forceOutletFallback: true,
        effectiveTabPaneReady,
        dashboardChunkLoaded: chunkLoadedBeforeReset,
        dashboardChunkInFlight: chunkInFlightBeforeReset,
        orgLoading,
        permissionsIsFetching,
        permissionsFetchStatus,
        spinnerKind: chrome.kind,
        spinnerText: chrome.text,
      });
      // Clear poisoned tab-cache bookkeeping so a later switch can remount cleanly.
      // Org index Outlet is MobileOrgIndexRedirect's bare lazy(), not App.tsx
      // lazyWithRetry — same Vite URL, so the browser may still share a hung import().
      resetTabPageChunk(resolvedCurrentPath);
      setForceOutletFallback(true);
    }, timeoutMs);
    return () => window.clearTimeout(timer);
  }, [
    wantsTabCache,
    effectiveTabPaneReady,
    forceOutletFallback,
    usesLongLoadBudget,
    currentPath,
    resolvedCurrentPath,
    user,
    orgLoading,
    isOrgSynced,
    permissionsIsFetching,
    permissionsFetchStatus,
  ]);

  // Record the render-owner decision for every navigation (always on — field evidence).
  useEffect(() => {
    recordRenderOwnerDecision({
      path: currentPath,
      owner: renderOwner,
      wantsTabCache,
      effectiveTabPaneReady,
      showTabCacheDuringColdNav,
      forceOutletFallback,
      isCacheableEntryActive,
      activeChunkLoaded: isTabPageChunkLoaded(resolvedCurrentPath),
      paneMounted: isTabCachePaneMounted(resolvedCurrentPath),
      tabPaths,
    });
  }, [
    currentPath,
    resolvedCurrentPath,
    renderOwner,
    wantsTabCache,
    effectiveTabPaneReady,
    showTabCacheDuringColdNav,
    forceOutletFallback,
    isCacheableEntryActive,
    tabPaths,
  ]);

  // PWA cold-open probe — snapshot the stuck-frame fields requested in
  // docs/pwa-cold-open-blank-dashboard-2026-08.md §8. Evidence only.
  useEffect(() => {
    const chrome = classifySpinnerChrome(typeof document !== "undefined" ? document : null);
    recordPwaColdOpenSnapshot({
      path: currentPath,
      forceOutletFallback,
      effectiveTabPaneReady,
      dashboardChunkLoaded: isTabPageChunkLoaded(""),
      dashboardChunkInFlight: isTabPageChunkInFlight(""),
      orgLoading,
      permissionsIsFetching,
      permissionsFetchStatus,
      spinnerKind: chrome.kind,
      spinnerText: chrome.text,
    });
  }, [
    currentPath,
    forceOutletFallback,
    effectiveTabPaneReady,
    orgLoading,
    permissionsIsFetching,
    permissionsFetchStatus,
  ]);

  /**
   * Blank-frame watchdog — belt-and-braces, not the cold-open fix. If the workspace
   * has tab-cache panes but none look painted (empty dimmed outgoing, silent Suspense),
   * hand the route back to <Outlet>. A dimmed outgoing pane that still holds the
   * previous page counts as painted so a slow report over shop wifi is not swapped
   * at 1.2s. Skipped for long-budget (bill-entry) screens via `usesLongLoadBudget`.
   * A RESCUED render-owner after this ships is a defect to investigate.
   */
  useEffect(() => {
    if (usesLongLoadBudget || forceOutletFallback) return;
    const timer = window.setTimeout(() => {
      const el = workspaceRef.current;
      if (!el || hasPaintedWorkspaceContent(el)) return;
      const canRescue = renderOwner === "tab-cache";
      recordBlankFrame(currentPath, canRescue);
      if (canRescue) {
        resetTabPageChunk(resolvedCurrentPath);
        setForceOutletFallback(true);
      }
    }, BLANK_FRAME_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [currentPath, resolvedCurrentPath, renderOwner, usesLongLoadBudget, forceOutletFallback]);

  /**
   * Cross-layout cold open (POS outlet → purchase-entry tab-cache): load shell
   * counts as painted so the 1.2s watchdog and 4s Outlet rescue never run.
   * Remount the tab-cache chunk if content never signals ready.
   */
  useEffect(() => {
    if (
      !shouldRemountStuckCacheableEntry({
        isCacheableEntryActive,
        contentReady: isTabCachePaneContentReady(resolvedCurrentPath),
        renderViaTabCache,
        forceOutletFallback,
      })
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (isTabCachePaneContentReady(resolvedCurrentPath)) return;
      if (cacheableEntryRescuedPathRef.current === resolvedCurrentPath) return;
      cacheableEntryRescuedPathRef.current = resolvedCurrentPath;
      console.warn(
        "[OrgLayout] Cacheable entry stuck on load shell — remounting tab-cache chunk for",
        currentPath,
      );
      resetTabPageChunk(resolvedCurrentPath);
      setCacheableEntryRescueKey((k) => k + 1);
    }, CACHEABLE_ENTRY_STUCK_RESCUE_MS);
    return () => window.clearTimeout(timer);
  }, [
    isCacheableEntryActive,
    currentPath,
    resolvedCurrentPath,
    renderViaTabCache,
    forceOutletFallback,
    effectiveTabPaneReady,
  ]);

  /**
   * Long-budget Outlet entries (POS, sales invoice, returns, …): same 6s floor as
   * purchase-entry. Must never use the 1.2s / 4s timers — those interrupt a
   * slow-but-working bill load. Remount Outlet once if UI still has not committed.
   */
  useEffect(() => {
    if (!isOrgSynced || !user) return;
    if (isCacheableEntryActive) return;
    if (!isLongBudgetOutletEntryPath(resolvedCurrentPath)) return;
    if (!shouldArmLongBudgetStuckRescue({ usesLongLoadBudget })) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => {
      const elapsedMs = Date.now() - startedAt;
      const ready = workspaceHasCommittedEntryUi(workspaceRef.current);
      if (
        !shouldFireLongBudgetStuckRescue({
          contentReady: ready,
          alreadyRescuedThisPath: outletRescuedPathRef.current === resolvedCurrentPath,
          elapsedMs,
        })
      ) {
        return;
      }
      outletRescuedPathRef.current = resolvedCurrentPath;
      console.warn(
        "[OrgLayout] Long-budget outlet entry stuck — remounting Outlet for",
        currentPath,
      );
      resetTabPageChunk(resolvedCurrentPath);
      setOutletRescueKey((k) => k + 1);
    }, LONG_BUDGET_STUCK_RESCUE_MS);
    return () => window.clearTimeout(timer);
  }, [
    isOrgSynced,
    user,
    isCacheableEntryActive,
    resolvedCurrentPath,
    currentPath,
    usesLongLoadBudget,
  ]);

  /** SEMME flow: warm purchase-entry while the user is on POS (outlet, not tab-cache). */
  useEffect(() => {
    if (!isOrgSynced || !user) return;
    if (!(POS_CONTEXT_PURCHASE_PREFETCH_PATHS as readonly string[]).includes(resolvedCurrentPath)) {
      return;
    }
    const warm = () => prefetchTabPage(POS_CONTEXT_WARM_TAB_PATH, { intent: true });
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(warm, { timeout: 6_000 });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(warm, 2_000);
    return () => window.clearTimeout(t);
  }, [isOrgSynced, user, resolvedCurrentPath]);

  useEffect(() => {
    if (!isNavigationPerfEnabled()) return;
    recordNavigation(currentPath, { orgSlug, tabCount: tabPaths.length });
    recordRenderPath(
      currentPath,
      renderViaTabCache ? "tab-cache" : "outlet",
      { isEntryPage, tabPaths },
    );
    recordTabCacheSnapshot({
      activePath: currentPath,
      mountedTabPaths: tabPaths,
      openTabPaths: openWindows.map((w) => w.path),
    });
  }, [currentPath, renderViaTabCache, orgSlug, tabPaths, openWindows, isEntryPage]);

  // Check if this is a public route (no auth required)
  const isPublicInvoiceRoute = location.pathname.includes('/invoice/view/');
  const isPublicInstallRoute = /^\/[^/]+\/install\/?$/.test(location.pathname);
  const isPublicPortalRoute = /^\/[^/]+\/portal(\/|$)/.test(location.pathname);
  const isPublicStoreRoute = /^\/[^/]+\/store(\/|$)/.test(location.pathname);
  const isFieldSalesRoute = /^\/[^/]+\/field-sales\/?$/.test(location.pathname);
  const isPublicRoute = isPublicInvoiceRoute || isPublicInstallRoute || isPublicPortalRoute || isPublicStoreRoute || isFieldSalesRoute;

  // Per-page window/tab title (browser + Electron chrome). Skip public routes that
  // own their own title (e.g. PublicInvoiceView).
  useEffect(() => {
    if (isPublicRoute) return;
    document.title = formatDocumentTitle(
      resolvedCurrentPath || currentPath,
      currentOrganization?.name,
    );
  }, [
    isPublicRoute,
    resolvedCurrentPath,
    currentPath,
    currentOrganization?.name,
  ]);

  useEffect(() => {
    if (orgSlug && user && !orgLoading && organizations.length > 0) {
      // Find the organization by slug
      const targetOrg = organizations.find(org => org.slug === orgSlug);
      
      if (targetOrg) {
        if (currentOrganization?.id !== targetOrg.id) {
          setIsOrgSynced(false);
          switchOrganization(targetOrg.id);
        } else {
          setIsOrgSynced(true);
        }
        storeOrgSlug(orgSlug);
      }
    }
  }, [orgSlug, user, organizations, orgLoading, currentOrganization?.id, switchOrganization]);

  // Critical tenant isolation: never allow fallback redirect to another organization.
  // If URL org does not belong to the authenticated user, force sign out and keep user on this org login page.
  useEffect(() => {
    if (!orgSlug || !user || authLoading || orgLoading || organizations.length === 0) return;
    const belongsToUrlOrg = organizations.some((org) => org.slug === orgSlug);
    if (belongsToUrlOrg) {
      if (accessDeniedForSlug) setAccessDeniedForSlug(null);
      return;
    }
    if (accessDeniedForSlug === orgSlug) return;

    setAccessDeniedForSlug(orgSlug);
    toast.error("Access denied for this organization URL. Please login with an authorized account.");
    supabase.auth.signOut({ scope: "local" }).catch(() => {
      // Keep UX consistent even if local sign-out cleanup fails.
    });
  }, [orgSlug, user, authLoading, orgLoading, organizations, accessDeniedForSlug]);

  // Update sync state when currentOrganization matches URL
  useEffect(() => {
    if (currentOrganization?.slug === orgSlug) {
      setIsOrgSynced(true);
    }
  }, [currentOrganization, orgSlug]);

  // Remove HTML boot splash once auth is ready (login screen) or org list is loaded (signed in).
  useEffect(() => {
    if (authLoading) return;
    if (user && orgLoading) return;
    hideAppBootSplash();
  }, [authLoading, user, orgLoading]);

  // Installed PWA / Add to Home Screen should open this shop's login URL, not /auth.
  useEffect(() => {
    if (!orgSlug) return;
    applyOrgPwaManifest(orgSlug, currentOrganization?.name);
  }, [orgSlug, currentOrganization?.name]);

  // Re-sync shell height when landing on POS / bill entry (Electron + web PWA).
  useEffect(() => {
    if (!isOrgSynced) return;
    const needsViewport =
      isViewportFixedEntryPath(location.pathname) ||
      isEntryTabPath(currentPath) ||
      isFillHeightShellPath(location.pathname);
    if (!needsViewport) return;
    syncElectronViewportHeight();
    const t = window.setTimeout(syncElectronViewportHeight, 100);
    return () => window.clearTimeout(t);
  }, [currentPath, isOrgSynced, location.pathname]);

  // For public routes, allow access without authentication
  if (isPublicRoute) {
    // Store org slug for context even for public views (in both storages)
    if (orgSlug) {
      storeOrgSlug(orgSlug);
    }
    return <Outlet />;
  }

  // Show loading only while auth is being determined
  if (authLoading) {
    return <AppBootSplash message="Starting Ezzy ERP…" />;
  }

  // If not logged in, render org login page immediately (don't wait for orgLoading)
  if (!user) {
    return <OrgAuth />;
  }

  // Only wait for org loading when user IS authenticated
  if (orgLoading) {
    return <AppBootSplash message="Loading organization…" />;
  }

  // Check if user belongs to this organization
  const userBelongsToOrg = organizations.some(org => org.slug === orgSlug);
  
  if (!userBelongsToOrg && organizations.length > 0) {
    // Security: do NOT redirect to another org automatically.
    // Keep user on requested org URL login so cross-org access cannot occur.
    return <OrgAuth />;
  }

  // Never render a half-initialized tenant shell. Offer an explicit retry when the
  // authoritative organization request fails instead of exposing a blank workspace.
  if (!isOrgSynced && (orgFetchError || (hasResolvedOrganizations && organizations.length === 0))) {
    return (
      <div className="fixed inset-0 z-[99998] flex items-center justify-center bg-background p-6">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <AlertCircle className="h-9 w-9 text-destructive" />
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-foreground">Workspace could not be prepared</h1>
            <p className="text-sm text-muted-foreground">
              Check the connection and retry. Your saved work has not been changed.
            </p>
          </div>
          <Button onClick={refetchOrganizations} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!isOrgSynced) {
    return <AppBootSplash message="Preparing workspace…" />;
  }

  // Window tabs need a fixed viewport height chain so dashboard panes scroll inside <main>.
  // min-h-[100dvh] alone lets content grow past the viewport and breaks overflow-y on tab return.
  const hasVisibleTabCache =
    tabPaths.length > 0 &&
    !hideTabCacheContainer &&
    (effectiveTabPaneReady || showTabCacheDuringColdNav);
  const isFillHeightPage = isFillHeightShellPath(location.pathname);
  const isMainDashboard = isMainDashboardPath(location.pathname);
  const isViewportFixedEntry = isViewportFixedEntryPath(location.pathname);
  const constrainViewportHeight =
    isViewportFixedEntry || isEntryPage || hasVisibleTabCache || isFillHeightPage || isMainDashboard;

  const workspaceBody = (
    <div ref={workspaceRef} className="relative flex min-h-0 flex-1 flex-col overflow-hidden w-full">
      {tabPaths.length > 0 && (
        <div
          className={cn(
            "flex min-h-0 flex-col w-full",
            hideTabCacheContainer ? "hidden" : "flex-1",
          )}
        >
          <TabCachedPages
            paths={tabPaths}
            activePath={tabCacheActivePath}
            cacheableEntryRescueKey={cacheableEntryRescueKey}
            onActivePaneReady={(path) => {
              const canonical = resolveTabCachePath(path);
              tabPaneReadyPathsRef.current.add(canonical);
              if (resolveTabCachePath(currentPath) === canonical) {
                setTabPaneReady(true);
              }
            }}
            onTabEvicted={(path) => {
              const canonical = resolveTabCachePath(path);
              tabPaneReadyPathsRef.current.delete(canonical);
              if (resolveTabCachePath(currentPath) === canonical) {
                setTabPaneReady(false);
              }
            }}
          />
        </div>
      )}
      {!renderViaTabCache && (
        <div
          className={
            isEntryPage || isFillHeightPage || isViewportFixedEntry
              ? "flex min-h-0 flex-1 flex-col overflow-hidden w-full h-full"
              : showDesktopChrome
                ? "flex min-h-0 flex-1 flex-col overflow-hidden w-full"
                : "contents"
          }
        >
          <Outlet key={outletRescueKey} />
        </div>
      )}
      {/* Never leave a pure white workspace while the active tab chunk is still cold. */}
      {wantsTabCache &&
        !effectiveTabPaneReady &&
        !forceOutletFallback &&
        !hasReadySiblingPane &&
        !isCacheableEntryActive &&
        renderViaTabCache && (
          <div className="absolute inset-0 z-10 bg-background">
            <DashboardSkeleton />
          </div>
        )}
    </div>
  );

  return (
    <SharedAppShellContext.Provider value={showDesktopChrome}>
      <div
        className={
          constrainViewportHeight
            ? "ezzy-viewport-shell flex w-full flex-col overflow-hidden min-h-0"
            : "flex min-h-[100dvh] w-full flex-col"
        }
      >
        <GlobalShortcuts />
        {showDesktopChrome ? (
          <DesktopAppShell className="flex-1 min-h-0">
            {workspaceBody}
          </DesktopAppShell>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col w-full">{workspaceBody}</div>
        )}
      </div>
    </SharedAppShellContext.Provider>
  );
};
