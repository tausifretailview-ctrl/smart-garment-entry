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
  mobilePosPathWithScan,
} from "@/lib/mobileShell";

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
    const cell =
      "flex flex-col items-start justify-end gap-1.5 px-2.5 pt-2 pb-3 min-h-[56px] touch-manipulation transition-colors";

    const renderTab = (tab: NavTab) => {
      const Icon = tab.premiumIcon;
      const active = isActive(tab);
      return (
        <button
          key={tab.path}
          type="button"
          onClick={() => orgNavigate(tab.path)}
          className={cn(
            cell,
            "border-t-[3px] bg-[var(--ez-shell)] active:bg-[#1c1f25]",
            active ? "border-[var(--ez-accent)]" : "border-transparent",
          )}
        >
          <Icon
            className={cn("h-[17px] w-[17px]", active ? "text-white" : "text-[var(--ez-shell-muted)]")}
            strokeWidth={2}
          />
          <span
            className={cn(
              "ez-btn-label text-[9.5px] tracking-[0.08em]",
              active ? "text-white" : "text-[var(--ez-shell-muted)]",
            )}
          >
            {tab.premiumLabel}
          </span>
        </button>
      );
    };

    return (
      <nav className="ez ez-shell fixed bottom-0 left-0 right-0 z-[40] border-t-2 border-[var(--ez-ink)] lg:hidden safe-area-pb">
        <div className="grid grid-cols-5 max-w-lg mx-auto">
          {leftTabs.map(renderTab)}

          <button
            type="button"
            onClick={onScanTap}
            aria-label="Scan barcode for POS or stock"
            className={cn(
              cell,
              "border-t-[3px] border-[var(--ez-accent)] bg-[var(--ez-accent)] active:bg-[var(--ez-accent-600)]",
            )}
          >
            <ScanBarcode className="h-[17px] w-[17px] text-white" strokeWidth={2} />
            <span className="ez-btn-label text-[9.5px] tracking-[0.08em] text-white">Scan</span>
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
