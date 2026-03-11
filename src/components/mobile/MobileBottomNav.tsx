import { Home, ShoppingCart, Receipt, Wallet, MoreHorizontal } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { cn } from "@/lib/utils";

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  matchPaths?: string[];
}

const navItems: NavItem[] = [
  { 
    icon: Home, 
    label: "Home", 
    path: "/",
    matchPaths: ["/"]
  },
  { 
    icon: Receipt, 
    label: "Sales", 
    path: "/mobile-sales",
    matchPaths: ["/mobile-sales", "/sales-invoice-dashboard", "/sale-return-entry"]
  },
  { 
    icon: ShoppingCart, 
    label: "POS", 
    path: "/pos-sales",
    matchPaths: ["/pos-sales", "/pos", "/pos-dashboard"]
  },
  { 
    icon: Wallet, 
    label: "Accounts", 
    path: "/mobile-accounts",
    matchPaths: ["/mobile-accounts", "/accounts", "/payments-dashboard", "/customer-ledger-report"]
  },
  { 
    icon: MoreHorizontal, 
    label: "More", 
    path: "/mobile-more",
    matchPaths: ["/mobile-more", "/settings", "/customers", "/suppliers", "/products", "/barcode-printing", "/stock-adjustment", "/mobile-reports", "/stock-report", "/purchase-bills", "/purchase-entry"]
  },
];

export const MobileBottomNav = () => {
  const location = useLocation();
  const { orgNavigate, getOrgPath } = useOrgNavigation();

  // Hide bottom nav on POS sales screen - it has its own payment bottom bar
  const posSalesPath = getOrgPath("/pos-sales");
  if (location.pathname === posSalesPath || location.pathname.startsWith(posSalesPath + "/")) {
    return null;
  }

  const isActive = (item: NavItem) => {
    const currentPath = location.pathname;
    const orgPath = getOrgPath(item.path);
    
    // Exact match for dashboard
    if (item.path === "/" && currentPath === orgPath) return true;
    
    // Check all match paths
    if (item.matchPaths) {
      return item.matchPaths.some(path => {
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
              onClick={() => orgNavigate(item.path)}
              className="relative flex flex-col items-center justify-start flex-1 h-full pt-1 gap-0.5 touch-manipulation transition-all duration-150 active:scale-90"
            >
              {active && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 rounded-b-full bg-primary" />
              )}
              <div className={cn(
                "flex items-center justify-center w-10 h-8 rounded-xl transition-all duration-150",
                active && "bg-primary/10"
              )}>
                <Icon className={cn(
                  "h-5 w-5 transition-transform",
                  active ? "text-primary scale-110" : "text-muted-foreground"
                )} />
              </div>
              <span className={cn(
                "text-[10px] font-medium transition-all",
                active ? "text-primary" : "text-muted-foreground"
              )}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
