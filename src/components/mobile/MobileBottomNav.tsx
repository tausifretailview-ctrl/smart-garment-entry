import { Home, Receipt, Wallet, MoreHorizontal } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { cn } from "@/lib/utils";
import { MOBILE_DEFAULT_LANDING_PATH, MOBILE_SALES_PATH } from "@/lib/mobileShell";

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  matchPaths?: string[];
}

/** Mobile nav — view sales list only; no POS / new-invoice creation. */
const navItems: NavItem[] = [
  {
    icon: Home,
    label: "Home",
    path: MOBILE_DEFAULT_LANDING_PATH,
    matchPaths: ["/", MOBILE_DEFAULT_LANDING_PATH],
  },
  {
    icon: Receipt,
    label: "Sales",
    path: MOBILE_SALES_PATH,
    matchPaths: [MOBILE_SALES_PATH, "/owner-sales"],
  },
  {
    icon: Wallet,
    label: "Accounts",
    path: "/mobile-accounts",
    matchPaths: ["/mobile-accounts", "/accounts", "/payments-dashboard", "/customer-ledger-report", "/customer-audit-report"],
  },
  {
    icon: MoreHorizontal,
    label: "More",
    path: "/mobile-more",
    matchPaths: [
      "/mobile-more",
      "/settings",
      "/customers",
      "/suppliers",
      "/products",
      "/barcode-printing",
      "/stock-adjustment",
      "/mobile-reports",
      "/stock-report",
      "/purchase-bills",
      "/purchase-entry",
      "/owner-purchases",
      "/owner-stock",
    ],
  },
];

export const MobileBottomNav = () => {
  const location = useLocation();
  const { orgNavigate, getOrgPath } = useOrgNavigation();

  const isActive = (item: NavItem) => {
    const currentPath = location.pathname;
    const orgPath = getOrgPath(item.path);

    if (item.path === "/" && currentPath === orgPath) return true;

    if (item.matchPaths) {
      return item.matchPaths.some((path) => {
        const fullPath = getOrgPath(path);
        return currentPath === fullPath || currentPath.startsWith(fullPath + "/");
      });
    }

    return currentPath.startsWith(orgPath);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[40] bg-background/95 backdrop-blur-md border-t border-border lg:hidden safe-area-pb">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);

          return (
            <button
              key={item.path}
              type="button"
              onClick={() => orgNavigate(item.path)}
              className="relative flex flex-col items-center justify-start flex-1 h-full pt-1 gap-0.5 touch-manipulation transition-all duration-150 active:scale-90"
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
                  "text-[10px] font-medium transition-all",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
