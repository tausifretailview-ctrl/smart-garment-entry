import { Home, IndianRupee, BarChart3, MoreHorizontal, ScanBarcode } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useMobileScan } from "@/contexts/MobileScanContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { cn } from "@/lib/utils";
import {
  MOBILE_ACCOUNTS_PATH,
  MOBILE_DEFAULT_LANDING_PATH,
  MOBILE_OWNER_SALES_PATH,
  MOBILE_REPORTS_PATH,
  MOBILE_SALES_PATH,
} from "@/lib/mobileShell";

interface NavTab {
  icon: React.ElementType;
  label: string;
  path: string;
  matchPaths: string[];
}

/** Bottom nav — reporting hubs only (no data entry). */
const sideTabs: NavTab[] = [
  {
    icon: Home,
    label: "Home",
    path: MOBILE_DEFAULT_LANDING_PATH,
    matchPaths: ["/", MOBILE_DEFAULT_LANDING_PATH],
  },
  {
    icon: IndianRupee,
    label: "Sales",
    path: MOBILE_SALES_PATH,
    matchPaths: [MOBILE_SALES_PATH, MOBILE_OWNER_SALES_PATH],
  },
  {
    icon: BarChart3,
    label: "Reports",
    path: MOBILE_REPORTS_PATH,
    matchPaths: [MOBILE_REPORTS_PATH],
  },
  {
    icon: MoreHorizontal,
    label: "More",
    path: "/mobile-more",
    matchPaths: [
      "/mobile-more",
      MOBILE_ACCOUNTS_PATH,
      "/owner-purchases",
      "/owner-stock",
      "/settings",
      "/daily-cashier-report",
      "/gst-reports",
      "/customer-ledger-report",
      "/customer-audit-report",
      "/payments-dashboard",
      "/purchase-bills",
      "/stock-report",
    ],
  },
];

export const OwnerBottomNav = () => {
  const location = useLocation();
  const { orgNavigate, getOrgPath } = useOrgNavigation();
  const { openScan } = useMobileScan();
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

  const mid = Math.ceil(visibleTabs.length / 2);
  const leftTabs = visibleTabs.slice(0, mid);
  const rightTabs = visibleTabs.slice(mid);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[40] bg-background/95 backdrop-blur-md border-t border-border lg:hidden safe-area-pb">
      <div className="flex items-end justify-around h-[4.25rem] px-1 max-w-lg mx-auto">
        {leftTabs.map((tab) => {
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
        })}

        <button
          type="button"
          onClick={openScan}
          className="relative flex flex-col items-center justify-end flex-1 min-w-0 -mt-5 touch-manipulation active:scale-95"
          aria-label="Scan barcode and check stock"
        >
          <div className="w-[3.25rem] h-[3.25rem] rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center ring-4 ring-background">
            <ScanBarcode className="h-7 w-7" />
          </div>
          <span className="text-[10px] font-semibold text-primary mt-1">Scan</span>
        </button>

        {rightTabs.map((tab) => {
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
        })}
      </div>
    </nav>
  );
};
