import { useState, useEffect, useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  fetchOrgLedgerCustomersReference,
} from "@/hooks/useOrgLedgerReferenceData";
import {
  fetchSalesmanCustomerListCore,
  SALESMAN_CUSTOMER_LIST_QUERY_KEY,
} from "@/utils/salesmanCustomerList";
import { STALE_FREQUENT } from "@/lib/queryStaleTimes";
import { Home, Users, ListOrdered, LogOut, Download, AlertCircle, Package, BookOpen, Plus, X, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useInstallPrompt, triggerPwaInstall, isIOSDevice } from "@/hooks/useInstallPrompt";
import { useFieldSalesAccess } from "@/hooks/useFieldSalesAccess";
import { useFieldSalesManifest } from "@/hooks/useFieldSalesManifest";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SizeStockDialog } from "@/components/SizeStockDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FIELD_SALES_SAFE_BOTTOM, FIELD_SALES_SAFE_TOP, useFieldSalesShell } from "@/hooks/useFieldSalesShell";
import { refreshOrgSettingsCache, useSettings } from "@/hooks/useSettings";
import { useSalesmanLocationTracker } from "@/hooks/useSalesmanLocationTracker";
import { formatHhmm, resolveTrackingWindow, DEFAULT_TRACKING_END, DEFAULT_TRACKING_START } from "@/lib/salesmanTracking";

const LOADING_TIMEOUT = 8000; // 8 seconds max wait
const INSTALL_BANNER_DISMISSED_KEY = "ezzy-field-sales-install-banner-dismissed";

function readBannerDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_BANNER_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function manualInstallSteps(): string {
  if (isIOSDevice()) {
    return "To install Field Sales: tap the Share button in Safari, then 'Add to Home Screen'.";
  }
  return "To install Field Sales: open the browser menu (⋮) and tap 'Add to Home screen' or 'Install app'. If you use 'Desktop site', turn it off first.";
}

const SalesmanLayout = () => {
  const { getOrgPath } = useOrgNavigation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const { signOut, user } = useAuth();
  const { isInstalled } = useInstallPrompt();
  const { hasAccess, employeeName, isLoading } = useFieldSalesAccess();
  const { isOnline, pendingActions, isSyncing } = useOfflineSync();
  const [sizeStockOpen, setSizeStockOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  useFieldSalesShell();
  // Live location during the shop's work hours (Settings > Sale > Salesman live location).
  const { data: settingsData } = useSettings();
  const saleSettings = (settingsData as { sale_settings?: Record<string, unknown> } | null)?.sale_settings;
  const trackingWindow = useMemo(() => resolveTrackingWindow(saleSettings), [saleSettings]);
  const trackingHours = (saleSettings?.salesman_tracking ?? {}) as { start?: string; end?: string };
  const liveLocation = useSalesmanLocationTracker({
    organizationId: currentOrganization?.id,
    userId: user?.id,
    isSalesman: hasAccess,
    window: trackingWindow,
  });
  const trackingFrom = formatHhmm(trackingHours.start || DEFAULT_TRACKING_START);
  const trackingTo = formatHhmm(trackingHours.end || DEFAULT_TRACKING_END);
  const locationStatusText =
    liveLocation.status === "on"
      ? "Location on (work hours)"
      : liveLocation.status === "starting"
        ? "Location: finding you…"
        : liveLocation.status === "outside-hours"
          ? `Location from ${trackingFrom} to ${trackingTo}`
          : liveLocation.status === "denied"
            ? "Location blocked: allow it in phone settings"
            : liveLocation.status === "unavailable"
              ? "Location not available on this phone"
              : null;
  // The app stays open for days on a salesman's phone: read the shop's settings again when it
  // comes back to the front (and every 10 minutes while in front), so a switch turned on in
  // Settings (live location, etc.) reaches the phone without a restart.
  useEffect(() => {
    const orgId = currentOrganization?.id;
    if (!orgId) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void refreshOrgSettingsCache(queryClient, orgId);
    };
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 10 * 60_000);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [currentOrganization?.id, queryClient]);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  // Dashboard "Install App" opens /salesman?install=1 — always show the banner then.
  const installRequested = new URLSearchParams(location.search).get("install") === "1";
  const [bannerDismissed, setBannerDismissed] = useState(() => readBannerDismissed());
  const showInstallBanner = !isInstalled && (installRequested || !bannerDismissed);

  // Safety timeout to prevent infinite loading on slow mobile data
  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => {
      console.warn("Field Sales: Loading timed out after", LOADING_TIMEOUT, "ms");
      setLoadingTimedOut(true);
    }, LOADING_TIMEOUT);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Warm customer list caches while salesman uses Home / Orders (faster Customers tab open).
  useEffect(() => {
    const orgId = currentOrganization?.id;
    if (!orgId || !hasAccess) return;

    const warm = () => {
      void fetchOrgLedgerCustomersReference(orgId, queryClient);
      void queryClient.prefetchQuery({
        queryKey: [SALESMAN_CUSTOMER_LIST_QUERY_KEY, orgId],
        queryFn: () => fetchSalesmanCustomerListCore(orgId, queryClient),
        staleTime: STALE_FREQUENT,
      });
    };

    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(warm, { timeout: 2500 });
      return () => cancelIdleCallback(id);
    }
    const timer = window.setTimeout(warm, 400);
    return () => window.clearTimeout(timer);
  }, [currentOrganization?.id, hasAccess, queryClient]);

  // Install = this shop's Field Sales app (opens /{org}/salesman), never the owner app.
  useFieldSalesManifest(currentOrganization?.slug, currentOrganization?.name);

  // Theme for Field Sales PWA
  useEffect(() => {
    // Update theme-color meta tag to orange
    const themeColor = document.querySelector('meta[name="theme-color"]');
    const originalThemeColor = themeColor?.getAttribute('content');
    if (themeColor) {
      themeColor.setAttribute('content', '#F97316');
    }

    return () => {
      // Restore original values when leaving Field Sales
      if (themeColor && originalThemeColor) {
        themeColor.setAttribute('content', originalThemeColor);
      }
    };
  }, []);

  const navItems = [
    { icon: Home, label: "Home", path: "/salesman", primary: false },
    { icon: Users, label: "Customers", path: "/salesman/customers", primary: false },
    { icon: Plus, label: "New Order", path: "/salesman/order/new", primary: true },
    { icon: ListOrdered, label: "Orders", path: "/salesman/orders", primary: false },
    { icon: BookOpen, label: "Outstanding", path: "/salesman/outstanding", primary: false },
  ];

  // Order booking is a full-screen flow with its own header and Save bar.
  // An order's own page is the same: back arrow on top, Print / Share at the bottom.
  // The catalogue is the same: back arrow on top, PDF / WhatsApp at the bottom.
  const immersive =
    location.pathname.startsWith(getOrgPath("/salesman/order/")) ||
    location.pathname.startsWith(getOrgPath("/salesman/catalogue"));
  const isHome = location.pathname === getOrgPath("/salesman");
  const initials = (employeeName || "FS")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

  const isActive = (path: string) => {
    const fullPath = getOrgPath(path);
    // Home is active only on the home screen, not on every /salesman/... page.
    if (path === "/salesman") return location.pathname === fullPath;
    // A customer's account belongs to Customers, an order's page to Orders.
    if (path === "/salesman/customers") return location.pathname.startsWith(getOrgPath("/salesman/customer"));
    if (path === "/salesman/orders") return location.pathname.startsWith(getOrgPath("/salesman/order"));
    return location.pathname === fullPath || location.pathname.startsWith(fullPath + "/");
  };

  const handleInstall = async () => {
    if (isInstalled) {
      toast.info("Field Sales app is already installed!");
      return;
    }

    // Uses the deferred Chrome prompt when there is one; otherwise explain the
    // browser-menu route (Chrome often withholds the prompt, e.g. in Desktop site mode).
    const outcome = await triggerPwaInstall();
    if (outcome === "accepted") {
      toast.success("Field Sales app installed successfully!");
      dismissInstallBanner();
    } else if (outcome === "unavailable") {
      toast.info(manualInstallSteps(), { duration: 9000 });
    }
  };

  const dismissInstallBanner = () => {
    setBannerDismissed(true);
    try {
      localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    if (installRequested) {
      const params = new URLSearchParams(location.search);
      params.delete("install");
      const search = params.toString();
      navigate(`${location.pathname}${search ? `?${search}` : ""}`, { replace: true });
    }
  };

  // Show loading state with orange spinner (with timeout fallback)
  if (isLoading && !loadingTimedOut) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Checking access...</p>
          {!isOnline && (
            <p className="mt-2 text-xs text-amber-500">You appear to be offline...</p>
          )}
        </div>
      </div>
    );
  }

  // If loading timed out, show retry option instead of infinite spinner
  if (isLoading && loadingTimedOut) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-orange-500/20">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-orange-500" />
            </div>
            <CardTitle className="text-lg">Slow Connection</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Unable to verify access. Please check your internet connection and try again.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => window.location.reload()}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                Retry
              </Button>
              <Button variant="outline" onClick={() => signOut()}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show access denied if user doesn't have field sales access
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-orange-500/20">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-orange-500" />
            </div>
            <CardTitle className="text-xl">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              You don't have access to the Field Sales app. Please contact your administrator to enable Field Sales access for your employee account.
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => signOut()} className="border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
              <Button variant="ghost" onClick={() => window.history.back()}>
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-slate-50 text-slate-900" data-testid="field-sales-app">
      {/* Offline / sync strip */}
      {(!isOnline || pendingActions > 0) && (
        <div
          className={cn(
            "flex shrink-0 items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold text-white",
            !isOnline ? "bg-amber-500" : isSyncing ? "bg-blue-500" : "bg-orange-500",
          )}
          style={immersive ? { paddingTop: `calc(${FIELD_SALES_SAFE_TOP} + 6px)` } : undefined}
        >
          {!isOnline ? (
            <>
              <div className="h-2 w-2 animate-pulse rounded-full bg-white" />
              <span>Offline{pendingActions > 0 ? ` · ${pendingActions} waiting to sync` : ""}</span>
            </>
          ) : isSyncing ? (
            <>
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span>Syncing {pendingActions} order{pendingActions !== 1 ? "s" : ""}…</span>
            </>
          ) : (
            <>
              <div className="h-2 w-2 rounded-full bg-white" />
              <span>{pendingActions} waiting to sync</span>
            </>
          )}
        </div>
      )}

      {/* App bar (hidden on full-screen flows, which have their own) */}
      {!immersive && (
        <header
          className="shrink-0 bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-sm"
          style={{ paddingTop: FIELD_SALES_SAFE_TOP }}
        >
          <div className="flex h-14 items-center gap-2.5 px-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold uppercase"
              aria-hidden
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-tight">{employeeName || "Field Sales"}</p>
              <p className="truncate text-[11px] leading-tight text-white/80">
                Field Sales{currentOrganization?.name ? ` · ${currentOrganization.name}` : ""}
              </p>
              {locationStatusText ? (
                <p
                  className={cn(
                    "mt-0.5 flex items-center gap-1 text-[10px] font-semibold leading-tight",
                    liveLocation.status === "denied" || liveLocation.status === "unavailable" ? "text-yellow-200" : "text-white",
                  )}
                  data-testid="field-sales-location-status"
                >
                  <MapPin className="h-3 w-3" />
                  {locationStatusText}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setSizeStockOpen(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:bg-white/20"
              aria-label="Size stock"
            >
              <Package className="h-5 w-5" />
            </button>
            {!isInstalled && (
              <button
                type="button"
                onClick={handleInstall}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:bg-white/20"
                aria-label="Install app"
              >
                <Download className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmLogout(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:bg-white/20"
              aria-label="Logout"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>
      )}

      {showInstallBanner && isHome && (
        <div className="flex shrink-0 items-center gap-2 border-b border-orange-100 bg-orange-50 px-3 py-2 text-[13px] text-orange-900">
          <Download className="h-4 w-4 shrink-0 text-orange-500" />
          <span className="min-w-0 flex-1 leading-tight">Install this app on your phone for one-tap access.</span>
          <button
            type="button"
            onClick={handleInstall}
            className="h-8 shrink-0 rounded-full bg-orange-500 px-3.5 text-xs font-semibold text-white active:bg-orange-600"
          >
            Install
          </button>
          <button
            type="button"
            onClick={dismissInstallBanner}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-orange-700 active:bg-orange-100"
            aria-label="Dismiss install banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <SizeStockDialog open={sizeStockOpen} onOpenChange={setSizeStockOpen} />

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <Outlet />
      </main>

      {/* Bottom navigation with the New Order button raised in the centre */}
      {!immersive && (
        <nav
          className="shrink-0 border-t border-slate-200 bg-white"
          style={{ paddingBottom: FIELD_SALES_SAFE_BOTTOM }}
          aria-label="Field Sales"
        >
          <div className="grid h-16 grid-cols-5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              if (item.primary) {
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => navigate(getOrgPath(item.path))}
                    className="flex min-w-0 flex-col items-center justify-end pb-1.5"
                    data-testid="fs-nav-new-order"
                  >
                    <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/40 ring-4 ring-slate-50 active:scale-95">
                      <Plus className="h-7 w-7" strokeWidth={2.5} />
                    </span>
                    <span className="mt-0.5 w-full truncate text-center text-[11px] font-semibold leading-tight text-orange-600">
                      {item.label}
                    </span>
                  </button>
                );
              }
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigate(getOrgPath(item.path))}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-w-0 flex-col items-center justify-center gap-0.5",
                    active ? "text-orange-600" : "text-slate-500",
                  )}
                >
                  <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", active && "bg-orange-100")}>
                    <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.4 : 2} />
                  </span>
                  <span className={cn("w-full truncate text-center text-[11px] leading-tight tracking-tight", active ? "font-semibold" : "font-medium")}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <AlertDialog open={liveLocation.status === "needs-consent"}>
        <AlertDialogContent className="max-w-[340px] rounded-2xl" data-testid="field-sales-location-consent">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-orange-500" /> Location during work hours
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <span className="block">
                {currentOrganization?.name || "Your shop"} sees which area you are in between{" "}
                <b>{trackingFrom}</b> and{" "}
                <b>{trackingTo}</b>, also when the phone is locked.
              </span>
              <span className="block">
                Nothing is shared outside these hours. While it is on, the phone shows a "sharing location"
                notification. Locations are kept for 7 days.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={liveLocation.decline}>Not today</AlertDialogCancel>
            <AlertDialogAction className="bg-orange-500 hover:bg-orange-600" onClick={liveLocation.accept}>
              Allow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent className="max-w-[320px] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Log out of Field Sales?</AlertDialogTitle>
            <AlertDialogDescription>You will need your salesman login to open the app again.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction className="bg-orange-500 hover:bg-orange-600" onClick={() => void signOut()}>
              Log out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SalesmanLayout;
