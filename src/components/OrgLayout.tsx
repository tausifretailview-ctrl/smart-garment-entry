import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Outlet, useParams, useLocation } from "react-router-dom";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { AppBootSplash } from "@/components/AppBootSplash";
import OrgAuth from "@/pages/OrgAuth";
import { hideAppBootSplash } from "@/lib/appBootSplash";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GlobalShortcuts } from "@/components/GlobalShortcuts";
import { useWindowTabs } from "@/contexts/WindowTabsContext";
import { TabCachedPages } from "@/components/TabCachedPages";
import { isCacheableEntryTabPath, isEntryTabPath, isFillHeightShellPath } from "@/lib/entryPageLayout";
import {
  isTabCachePath,
  prefetchPostLoginCriticalPages,
  prefetchPostLoginIdlePages,
  prefetchTabPage,
  prefetchTabPagesIdle,
  resolveTabCachePath,
} from "@/lib/tabPageRegistry";
import { isElectronShell, shouldElectronMountOnlyActiveTab } from "@/lib/electronShell";
import { syncElectronViewportHeight } from "@/lib/electronViewportSync";
import {
  isNavigationPerfEnabled,
  recordNavigation,
  recordRenderPath,
  recordTabCacheSnapshot,
} from "@/lib/navigationPerfDiagnostics";
import { cn } from "@/lib/utils";
import { invoiceDashboardPrefetchQueryOptions } from "@/utils/invoiceDashboardData";
import { isTabCachePaneMounted } from "@/lib/tabCacheMountRegistry";
import { prefetchPurchaseDashboardQueries } from "@/utils/purchaseDashboardPrefetch";
import { prefetchMainDashboardQueries } from "@/utils/mainDashboardPrefetch";
import { prefetchPosDashboardQueries } from "@/utils/posDashboardPrefetch";
import { DesktopAppShell } from "@/components/DesktopAppShell";
import { SharedAppShellContext } from "@/contexts/SharedAppShellContext";
import { useShowDesktopChrome } from "@/hooks/useDesktopViewPreference";

/** Sentinel — no cached pane is active while a bill-entry screen uses <Outlet>. */
const TAB_CACHE_INACTIVE = "__none__";

function getOrgPathSegment(pathname: string, orgSlug?: string): string {
  if (orgSlug && pathname.startsWith(`/${orgSlug}`)) {
    return pathname.slice(orgSlug.length + 2) || "";
  }
  return pathname.replace(/^\//, "");
}

export const OrgLayout = () => {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, loading: authLoading } = useAuth();
  const { currentOrganization, organizations, loading: orgLoading, switchOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [isOrgSynced, setIsOrgSynced] = useState(false);
  const [syncTimeout, setSyncTimeout] = useState(false);
  const [accessDeniedForSlug, setAccessDeniedForSlug] = useState<string | null>(null);
  /** Tab-cache pane has mounted for the current path — keep Outlet as fallback until then. */
  const [tabPaneReady, setTabPaneReady] = useState(false);
  /** If tab cache never becomes ready, fall back to <Outlet> so the screen is not blank. */
  const [forceOutletFallback, setForceOutletFallback] = useState(false);
  /** Paths whose lazy chunk already mounted — skip Outlet flash when switching back. */
  const tabPaneReadyPathsRef = useRef<Set<string>>(new Set());

  const isTabPaneReadyForPath = useCallback((path: string): boolean => {
    // Registry reflects actual mount state (cleared on idle eviction). Ref alone goes stale.
    if (isTabCachePaneMounted(path)) return true;
    if (tabPaneReadyPathsRef.current.has(path)) return true;
    for (const recorded of tabPaneReadyPathsRef.current) {
      if (resolveTabCachePath(recorded) === path) return true;
    }
    return false;
  }, []);
  const location = useLocation();
  const { openWindows } = useWindowTabs();
  const showDesktopChrome = useShowDesktopChrome();

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
    if (isCacheableTabPath(resolvedCurrentPath)) set.add(resolvedCurrentPath);
    return [...set];
  }, [openWindows, resolvedCurrentPath, pinnedCacheableEntryPaths]);

  useEffect(() => {
    const prefetchActive = isEntryPage && !isCacheableEntryActive ? "" : currentPath;
    return prefetchTabPagesIdle(tabPaths, prefetchActive);
  }, [tabPaths, currentPath, isEntryPage, isCacheableEntryActive]);

  // Warm bill-entry chunks after login. Electron: defer prefetch so login paint is not blocked.
  useEffect(() => {
    if (!isOrgSynced || !user) return;

    const run = () => {
      if (shouldElectronMountOnlyActiveTab()) {
        prefetchTabPage("pos-sales");
        prefetchTabPage("");
        if (tabPaths.includes("settings")) {
          prefetchTabPage("settings");
        }
        return;
      }
      prefetchPostLoginCriticalPages();
      prefetchPostLoginIdlePages();
    };

    if (!isElectronShell()) {
      run();
      return;
    }

    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(run, { timeout: 4_000 });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(run, 1_500);
    return () => window.clearTimeout(t);
  }, [isOrgSynced, user, tabPaths]);

  // Warm Sales + Purchase dashboard first page after login — data ready before user opens tab.
  useEffect(() => {
    const orgId = currentOrganization?.id;
    if (!isOrgSynced || !user || !orgId) return;

    const warm = () => {
      prefetchMainDashboardQueries(queryClient, orgId);
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
  }, [isOrgSynced, user, currentOrganization?.id, queryClient]);

  // purchase-entry is tab-cached so in-app tab switch keeps the form mounted (other entry routes use Outlet).
  const wantsTabCache =
    isCacheableTabPath(resolvedCurrentPath) && tabPaths.length > 0;
  const tabPaneWasReady = isTabPaneReadyForPath(resolvedCurrentPath);
  const paneMounted = isTabCachePaneMounted(resolvedCurrentPath);
  const effectiveTabPaneReady = tabPaneReady || (tabPaneWasReady && paneMounted);
  // Cacheable entry (purchase-entry): always render via tab cache when window tabs are open.
  // Dashboards: keep <Outlet> visible until the cached pane has mounted (chunk still loading).
  const renderViaTabCache =
    wantsTabCache && (isCacheableEntryActive || effectiveTabPaneReady) && !forceOutletFallback;
  /**
   * Which cached pane is visible. Non-cacheable entry routes use INACTIVE so dashboard
   * panes stay mounted (hidden). Cacheable entry must use currentPath — otherwise
   * tabPaneReady hides both Outlet and TabCachedPages → blank blue screen.
   */
  const tabCacheActivePath =
    !wantsTabCache || (isEntryPage && !isCacheableEntryActive)
      ? TAB_CACHE_INACTIVE
      : resolvedCurrentPath;
  /** Hide tab-cache container while Outlet shows the first-load fallback (dashboards only). */
  const hideTabCacheContainer =
    (isEntryPage && !isCacheableEntryActive) ||
    (wantsTabCache && !effectiveTabPaneReady && !isCacheableEntryActive) ||
    !isCacheableTabPath(resolvedCurrentPath) ||
    // Once we fell back to <Outlet>, keep the cached pane hidden even if it
    // later signals ready — otherwise both render and the page appears duplicated.
    forceOutletFallback;

  // Reset on navigation — restore immediately when this path was already mounted in tab cache.
  useEffect(() => {
    setForceOutletFallback(false);
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

  // Safety net: if the cached pane never signals ready (slow network / chunk failure), keep Outlet visible.
  useEffect(() => {
    if (!wantsTabCache || effectiveTabPaneReady) return;
    const timeoutMs = isElectronShell() ? 12_000 : 18_000;
    const timer = window.setTimeout(() => {
      console.warn("[OrgLayout] Tab pane not ready — falling back to Outlet for", currentPath);
      setForceOutletFallback(true);
    }, timeoutMs);
    return () => window.clearTimeout(timer);
  }, [wantsTabCache, effectiveTabPaneReady, currentPath]);

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

  // Safety timeout: if org sync takes too long (8s), force render to prevent infinite spinner
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isOrgSynced) {
        console.warn("OrgLayout: Sync timeout reached, forcing render");
        setSyncTimeout(true);
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [isOrgSynced]);

  // Check if this is a public route (no auth required)
  const isPublicInvoiceRoute = location.pathname.includes('/invoice/view/');
  const isPublicInstallRoute = /^\/[^/]+\/install\/?$/.test(location.pathname);
  const isPublicPortalRoute = /^\/[^/]+\/portal(\/|$)/.test(location.pathname);
  const isFieldSalesRoute = /^\/[^/]+\/field-sales\/?$/.test(location.pathname);
  const isPublicRoute = isPublicInvoiceRoute || isPublicInstallRoute || isPublicPortalRoute || isFieldSalesRoute;

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

  // Electron: re-sync shell height when landing on POS / bill entry after login.
  useEffect(() => {
    if (!isElectronShell() || !isOrgSynced) return;
    const needsViewport =
      isEntryTabPath(currentPath) || isFillHeightShellPath(location.pathname);
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

  // Wait for organization to be synced before rendering children (with timeout fallback)
  if (!isOrgSynced && !syncTimeout) {
    return <AppBootSplash message="Preparing workspace…" />;
  }

  // Window tabs need a fixed viewport height chain so dashboard panes scroll inside <main>.
  // min-h-[100dvh] alone lets content grow past the viewport and breaks overflow-y on tab return.
  const hasVisibleTabCache = tabPaths.length > 0 && !hideTabCacheContainer && effectiveTabPaneReady;
  const isFillHeightPage = isFillHeightShellPath(location.pathname);
  const constrainViewportHeight = isEntryPage || hasVisibleTabCache || isFillHeightPage;

  const workspaceBody = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden w-full">
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
            onActivePaneReady={(path) => {
              const canonical = resolveTabCachePath(path);
              tabPaneReadyPathsRef.current.add(canonical);
              if (resolveTabCachePath(currentPath) === canonical) {
                setTabPaneReady(true);
                setForceOutletFallback(false);
              }
            }}
            onTabEvicted={(path) => {
              const canonical = resolveTabCachePath(path);
              tabPaneReadyPathsRef.current.delete(canonical);
              if (resolveTabCachePath(currentPath) === canonical) {
                setTabPaneReady(false);
                setForceOutletFallback(true);
              }
            }}
          />
        </div>
      )}
      {!renderViaTabCache && (
        <div
          className={
            isEntryPage || isFillHeightPage
              ? "flex min-h-0 flex-1 flex-col overflow-hidden w-full"
              : showDesktopChrome
                ? "flex min-h-0 flex-1 flex-col overflow-hidden w-full"
                : "contents"
          }
        >
          <Outlet />
        </div>
      )}
    </div>
  );

  return (
    <SharedAppShellContext.Provider value={showDesktopChrome}>
      <div
        className={
          constrainViewportHeight
            ? "ezzy-viewport-shell flex w-full flex-col overflow-hidden"
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
