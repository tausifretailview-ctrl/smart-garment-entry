import { useState } from "react";
import { Home, ShoppingCart, Receipt, Wallet, MoreHorizontal, FileText, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { cn } from "@/lib/utils";

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  matchPaths?: string[];
  hasPopup?: boolean;
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
    matchPaths: ["/mobile-sales", "/sales-invoice-dashboard", "/sale-return-entry", "/sales-invoice"],
    hasPopup: true,
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
    matchPaths: ["/mobile-accounts", "/accounts", "/payments-dashboard", "/customer-ledger-report", "/customer-audit-report"]
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
  const [showSalesPopup, setShowSalesPopup] = useState(false);

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

  const handleNavClick = (item: NavItem) => {
    if (item.hasPopup) {
      setShowSalesPopup(prev => !prev);
    } else {
      setShowSalesPopup(false);
      orgNavigate(item.path);
    }
  };

  return (
    <>
      {/* Backdrop overlay */}
      {showSalesPopup && (
        <div 
          className="fixed inset-0 z-[39] bg-black/40 backdrop-blur-[2px]"
          onClick={() => setShowSalesPopup(false)}
        />
      )}

      {/* Sales popup menu */}
      {showSalesPopup && (
        <div className="fixed bottom-[4.5rem] left-1/2 -translate-x-1/2 z-[41] w-[280px] animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60">
              <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">New Sale</span>
              <button 
                onClick={() => setShowSalesPopup(false)}
                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted active:scale-90 transition-all"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-2 space-y-1">
              <button
                onClick={() => {
                  setShowSalesPopup(false);
                  orgNavigate("/sales-invoice");
                }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted/60 active:bg-muted active:scale-[0.98] transition-all touch-manipulation"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-foreground">Sale Invoice</p>
                  <p className="text-[11px] text-muted-foreground">Create standard invoice</p>
                </div>
              </button>
              <button
                onClick={() => {
                  setShowSalesPopup(false);
                  orgNavigate("/pos-sales");
                }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted/60 active:bg-muted active:scale-[0.98] transition-all touch-manipulation"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <ShoppingCart className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-foreground">POS Sale</p>
                  <p className="text-[11px] text-muted-foreground">Quick billing screen</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom navigation bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-[40] bg-background/95 backdrop-blur-md border-t border-border lg:hidden safe-area-pb">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            
            return (
              <button
                key={item.path}
                onClick={() => handleNavClick(item)}
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
    </>
  );
};
