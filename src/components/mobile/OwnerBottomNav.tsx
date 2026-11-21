import { Home, House, IndianRupee, BarChart3, MoreHorizontal, LayoutGrid, ScanBarcode } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useMobileScan } from "@/contexts/MobileScanContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useMobileUiTheme } from "@/hooks/useMobileUiTheme";
import { cn } from "@/lib/utils";
import {
  MOBILE_ACCOUNTS_PATH,
  MOBILE_DEFAULT_LANDING_PATH,
  MOBILE_OWNER_SALES_PATH,
  MOBILE_POS_PATH,
  MOBILE_REPORTS_PATH,
  MOBILE_SALES_PATH,
  isMobileEntryScreenPath,
  mobilePosPathWithScan,
} from "@/lib/mobileShell";
import { usePhoneShell } from "@/hooks/useFieldSalesShell";

interface NavTab {
  icon: React.ElementType;
  premiumIcon: React.ElementType;
  label: string;
  premiumLabel: string;
  path: string;
  matchPaths: string[];
}

const MENU_PATHS = [
  "/mobile-more",
  MOBILE_ACCOUNTS_PATH,
  "/owner-purchases",
  "/owner-stock",
  "/settings",
  "/backup",
  "/daily-cashier-report",
  "/gst-reports",
  "/customer-ledger-report",
  "/customer-audit-report",
  "/payments-dashboard",
  "/purchase-bills",
  "/stock-report",
  "/mobile-purchase-entry",
];

/** Shared tab model — classic and premium themes render the same tabs/behaviour. */
const sideTabs: NavTab[] = [
  {
    icon: Home,
    premiumIcon: House,
    label: "Home",
    premiumLabel: "Home",
    path: MOBILE_DEFAULT_LANDING_PATH,
    matchPaths: ["/", MOBILE_DEFAULT_LANDING_PATH],
  },
  {
    icon: IndianRupee,
    premiumIcon: IndianRupee,
    label: "Sales",
    premiumLabel: "Sales",
    path: MOBILE_SALES_PATH,
    matchPaths: [MOBILE_SALES_PATH, MOBILE_OWNER_SALES_PATH, MOBILE_POS_PATH],
  },
  {
    icon: BarChart3,
    premiumIcon: BarChart3,
    label: "Reports",
    premiumLabel: "Reports",
    path: MOBILE_REPORTS_PATH,
    matchPaths: [MOBILE_REPORTS_PATH],
  },
  {
    icon: MoreHorizontal,
    premiumIcon: LayoutGrid,
    label: "More",
    premiumLabel: "Menu",
    path: "/mobile-more",
    matchPaths: MENU_PATHS,
  },
];

export const OwnerBottomNav = () => {
  const theme = useMobileUiTheme();
  const location = useLocation();
  // The bottom bar is on screen exactly when the phone app shell is: phone text size (the web
  // root is 18-19px, sized for desktop) and status-bar spacing in the Android app.
  usePhoneShell(true, "owner-mobile-app");
  const { orgNavigate, getOrgPath } = useOrgNavigation();
  const { openScan, hasBillingScanHandler } = useMobileScan();
  const { hasMenuAccess, permissions } = useUserPermissions();
  const canAccessMainDashboard =
    permissions === null || hasMenuAccess("main_dashboard");
  const visibleTabs = canAccessMainDashboard
    ? sideTabs
    : sideTabs.filter((t) => t.label !== "Home");

  const isActive = (tab: NavTab) => {
    const current = location.pathname;
    if (current === getOrgPath("/")) return tab.matchPaths.includes("/");
    return tab.matchPaths.some((p) => {
      // "/" is only the org root (handled above); as a prefix it would match every screen.
      if (p === "/") return false;
      const full = getOrgPath(p);
      return current === full || current.startsWith(full + "/");
    });
  };

  const onScanTap = () => {
    const onPos =
      location.pathname === getOrgPath(MOBILE_POS_PATH) ||
      location.pathname.startsWith(getOrgPath(MOBILE_POS_PATH) + "/");
    if (onPos || hasBillingScanHandler) {
      openScan();
      return;
    }
    // Context-aware: from other hubs, open mobile POS billing + camera (not a second scanner).
    orgNavigate(mobilePosPathWithScan());
  };

  const mid = Math.ceil(visibleTabs.length / 2);
  const leftTabs = visibleTabs.slice(0, mid);
  const rightTabs = visibleTabs.slice(mid);

  if (theme === "premium") {
    // Bill entry screens are full-screen: their own back arrow on top, Pay / Save at the bottom.
    if (isMobileEntryScreenPath(location.pathname)) return null;

    const renderTab = (tab: NavTab) => {
      const Icon = tab.premiumIcon;
      const active = isActive(tab);
      return (
        <button
          key={tab.path}
          type="button"
          onClick={() => orgNavigate(tab.path)}
          aria-current={active ? "page" : undefined}
          className={cn(
            "ez-press flex min-w-0 flex-col items-center justify-center gap-0.5",
            active ? "text-[var(--ez-accent)]" : "text-[var(--ez-muted)]",
          )}
        >
          <span
            className={cn(
              "flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200",
              active && "bg-[var(--ez-tint-2)]",
            )}
          >
            <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.4 : 2} />
          </span>
          <span
            className={cn(
              "w-full truncate text-center text-[11px] leading-tight tracking-tight",
              active ? "font-semibold" : "font-medium",
            )}
          >
            {tab.premiumLabel}
          </span>
        </button>
      );
    };

    return (
      <nav
        className="ez fixed bottom-0 left-0 right-0 z-[40] border-t border-[var(--ez-rule)] !bg-white shadow-[0_-6px_20px_-12px_rgba(15,23,42,0.25)] lg:hidden safe-area-pb"
        aria-label="Main"
      >
        <div className="mx-auto grid h-[4.25rem] max-w-lg grid-cols-5">
          {leftTabs.map(renderTab)}

          <button
            type="button"
            onClick={onScanTap}
            aria-label="Scan barcode for POS or stock"
            className="flex min-w-0 flex-col items-center justify-end pb-1.5"
          >
            <span className="ez-press -mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-600/40 ring-4 ring-[var(--ez-ground)]">
              <ScanBarcode className="h-7 w-7" strokeWidth={2.2} />
            </span>
            <span className="mt-0.5 w-full truncate text-center text-[11px] font-semibold leading-tight text-[var(--ez-accent)]">
              Scan
            </span>
          </button>

          {rightTabs.map(renderTab)}
        </div>
      </nav>
    );
  }

  const renderClassicTab = (tab: NavTab) => {
    const Icon = tab.icon;
    const active = isActive(tab);
    return (
      <button
        key={tab.path}
        type="button"
        onClick={() => orgNavigate(tab.path)}
        className="relative flex flex-col items-center justify-end flex-1 min-w-0 pb-1.5 gap-0.5 touch-manipulation transition-all duration-150 active:scale-90"
      >
        {active && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 rounded-b-full bg-primary" />
        )}
        <div
          className={cn(
            "flex items-center justify-center w-10 h-8 rounded-xl transition-all duration-150",
            active && "bg-primary/10",
          )}
        >
          <Icon
            className={cn(
              "h-5 w-5 transition-transform",
              active ? "text-primary scale-110" : "text-muted-foreground",
            )}
          />
        </div>
        <span
          className={cn(
            "text-[10px] font-medium transition-all truncate max-w-full px-0.5",
            active ? "text-primary" : "text-muted-foreground",
          )}
        >
          {tab.label}
        </span>
      </button>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[40] bg-background/95 backdrop-blur-md border-t border-border lg:hidden safe-area-pb">
      <div className="flex items-end justify-around h-[4.25rem] px-1 max-w-lg mx-auto">
        {leftTabs.map(renderClassicTab)}

        <button
          type="button"
          onClick={onScanTap}
          className="relative flex flex-col items-center justify-end flex-1 min-w-0 -mt-5 touch-manipulation active:scale-95"
          aria-label="Scan barcode for POS or stock"
        >
          <div className="w-[3.25rem] h-[3.25rem] rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center ring-4 ring-background">
            <ScanBarcode className="h-7 w-7" />
          </div>
          <span className="text-[10px] font-semibold text-primary mt-1">Scan</span>
        </button>

        {rightTabs.map(renderClassicTab)}
      </div>
    </nav>
  );
};
