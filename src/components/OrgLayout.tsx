import { useEffect, useMemo, useState } from "react";
import { Outlet, useParams, useLocation } from "react-router-dom";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import OrgAuth from "@/pages/OrgAuth";
import { storeOrgSlug } from "@/lib/orgSlug";
import { hideAppBootSplash } from "@/lib/appBootSplash";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GlobalShortcuts } from "@/components/GlobalShortcuts";
import { useWindowTabs } from "@/contexts/WindowTabsContext";
import { TabCachedPages } from "@/components/TabCachedPages";
import { isEntryTabPath } from "@/lib/entryPageLayout";
import {
  isTabCachePath,
  prefetchPostLoginCriticalPages,
  prefetchPostLoginIdlePages,
  prefetchTabPage,
  prefetchTabPagesIdle,
} from "@/lib/tabPageRegistry";
import { shouldElectronMountOnlyActiveTab } from "@/lib/electronShell";
import {
  isNavigationPerfEnabled,
  recordNavigation,
  recordRenderPath,
  recordTabCacheSnapshot,
} from "@/lib/navigationPerfDiagnostics";

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
  const [isOrgSynced, setIsOrgSynced] = useState(false);
  const [syncTimeout, setSyncTimeout] = useState(false);
  const [accessDeniedForSlug, setAccessDeniedForSlug] = useState<string | null>(null);
  /** Tab-cache pane has mounted for the current path — keep Outlet as fallback until then. */
  const [tabPaneReady, setTabPaneReady] = useState(false);
  const location = useLocation();
  const { openWindows } = useWindowTabs();

  const currentPath = useMemo(
    () => getOrgPathSegment(location.pathname, orgSlug),
    [location.pathname, orgSlug],
  );

  const isEntryPage = isEntryTabPath(currentPath);

  const tabPaths = useMemo(() => {
    const set = new Set<string>();
    openWindows.forEach((w) => {
      if (isTabCachePath(w.path) && !isEntryTabPath(w.path)) set.add(w.path);
    });
    if (isTabCachePath(currentPath) && !isEntryPage) set.add(currentPath);
    return [...set];
  }, [openWindows, currentPath, isEntryPage]);

  useEffect(() => {
    return prefetchTabPagesIdle(tabPaths, isEntryPage ? "" : currentPath);
  }, [tabPaths, currentPath, isEntryPage]);

  // Warm bill-entry chunks after login. Electron: only POS + dashboard (+ open admin tabs).
  useEffect(() => {
    if (!isOrgSynced || !user) return;
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
  }, [isOrgSynced, user, tabPaths]);

  // Bill/POS entry uses <Outlet> + route FullScreenLayout (h-dvh). Tab cache broke footer layout on Windows.
  const wantsTabCache =
    !isEntryPage && isTabCachePath(currentPath) && tabPaths.length > 0;
  // Keep <Outlet> visible until the cached pane has mounted — avoids a blank screen
  // when the lazy chunk is still loading (reported after Phase 1/2 on purchase-bills).
  const renderViaTabCache = wantsTabCache && tabPaneReady;

  useEffect(() => {
    setTabPaneReady(false);
  }, [currentPath]);

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

  // Authenticated shell — remove HTML boot splash once past auth/org gates.
  useEffect(() => {
    if (authLoading || !user || orgLoading) return;
    hideAppBootSplash();
  }, [authLoading, user, orgLoading]);

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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If not logged in, render org login page immediately (don't wait for orgLoading)
  if (!user) {
    return <OrgAuth />;
  }

  // Only wait for org loading when user IS authenticated
  if (orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div
      className={
        isEntryPage
          ? "flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden"
          : "flex min-h-[100dvh] w-full flex-col"
      }
    >
      <GlobalShortcuts />
      <div className="flex min-h-0 flex-1 flex-col w-full">
        {/* Hidden while on bill entry — otherwise flex-1 splits viewport and footer floats mid-screen */}
        {tabPaths.length > 0 && !isEntryPage && (
          <div
            className={
              wantsTabCache && !tabPaneReady
                ? "hidden"
                : "flex min-h-0 flex-1 flex-col w-full"
            }
          >
            <TabCachedPages
              paths={tabPaths}
              activePath={wantsTabCache ? currentPath : ""}
              onActivePaneReady={(path) => {
                if (path === currentPath) setTabPaneReady(true);
              }}
            />
          </div>
        )}
        {!renderViaTabCache && (
          <div
            className={
              isEntryPage
                ? "flex min-h-0 flex-1 flex-col overflow-hidden w-full"
                : "contents"
            }
          >
            <Outlet />
          </div>
        )}
      </div>
    </div>
  );
};
