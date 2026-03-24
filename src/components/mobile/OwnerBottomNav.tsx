import { Home, IndianRupee, ShoppingCart, Package, BarChart3 } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { cn } from "@/lib/utils";

interface NavTab {
  icon: React.ElementType;
  label: string;
  path: string;
  matchPaths: string[];
}

const tabs: NavTab[] = [
  { icon: Home, label: "Home", path: "/", matchPaths: ["/"] },
  { icon: IndianRupee, label: "Sales", path: "/owner-sales", matchPaths: ["/owner-sales"] },
  { icon: ShoppingCart, label: "Purchases", path: "/owner-purchases", matchPaths: ["/owner-purchases"] },
  { icon: Package, label: "Stock", path: "/owner-stock", matchPaths: ["/owner-stock"] },
  { icon: BarChart3, label: "Reports", path: "/owner-reports", matchPaths: ["/owner-reports"] },
];

export const OwnerBottomNav = () => {
  const location = useLocation();
  const { orgNavigate, getOrgPath } = useOrgNavigation();

  const isActive = (tab: NavTab) => {
    const current = location.pathname;
    if (tab.path === "/" && current === getOrgPath("/")) return true;
    return tab.matchPaths.some((p) => {
      const full = getOrgPath(p);
      return current === full || current.startsWith(full + "/");
    });
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[40] bg-background/95 backdrop-blur-md border-t border-border lg:hidden safe-area-pb">
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab);
          return (
            <button
              key={tab.path}
              onClick={() => orgNavigate(tab.path)}
              className="relative flex flex-col items-center justify-start flex-1 h-full pt-1.5 gap-0.5 touch-manipulation transition-all duration-150 active:scale-90"
            >
              {active && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 rounded-b-full bg-primary" />
              )}
              <div
                className={cn(
                  "flex items-center justify-center w-10 h-8 rounded-xl transition-all duration-150",
                  active && "bg-primary/10"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 transition-transform",
                    active ? "text-primary scale-110" : "text-muted-foreground"
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium transition-all",
                  active ? "text-primary" : "text-muted-foreground"
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
