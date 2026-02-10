import { Home, ShoppingCart, BarChart3, Wallet, MoreHorizontal } from "lucide-react";
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
    icon: ShoppingCart, 
    label: "POS", 
    path: "/pos-sales",
    matchPaths: ["/pos-sales", "/pos", "/pos-dashboard", "/sales-invoice"]
  },
  { 
    icon: BarChart3, 
    label: "Reports", 
    path: "/mobile-reports",
    matchPaths: ["/mobile-reports", "/stock-report", "/sales-invoice-dashboard", "/daily-cashier-report", "/item-wise-sales", "/item-wise-stock", "/stock-analysis", "/purchase-bills", "/net-profit-analysis", "/gst-reports"]
  },
  { 
    icon: Wallet, 
    label: "Accounts", 
    path: "/accounts",
    matchPaths: ["/accounts", "/payments-dashboard"]
  },
  { 
    icon: MoreHorizontal, 
    label: "More", 
    path: "/mobile-more",
    matchPaths: ["/mobile-more", "/settings", "/customers", "/suppliers", "/employees", "/products", "/barcode-printing", "/stock-adjustment"]
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border lg:hidden safe-area-pb">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          
          return (
            <button
              key={item.path}
              onClick={() => orgNavigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-150",
                "active:scale-95 touch-manipulation",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className={cn(
                "flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-150",
                active && "bg-primary/10"
              )}>
                <Icon className={cn(
                  "h-5 w-5 transition-transform",
                  active && "scale-110"
                )} />
              </div>
              <span className={cn(
                "text-[10px] mt-0.5 font-medium transition-all",
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
