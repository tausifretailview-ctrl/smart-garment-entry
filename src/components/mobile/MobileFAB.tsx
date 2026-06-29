import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Plus, X, IndianRupee, ShoppingBag, Package, Wallet, BarChart3 } from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { cn } from "@/lib/utils";
import {
  MOBILE_ACCOUNTS_PATH,
  MOBILE_REPORTS_PATH,
  MOBILE_SALES_PATH,
} from "@/lib/mobileShell";

interface FABAction {
  icon: React.ElementType;
  label: string;
  path: string;
  color: string;
}

const fabActions: FABAction[] = [
  { icon: IndianRupee, label: "Sales", path: MOBILE_SALES_PATH, color: "bg-emerald-500" },
  { icon: ShoppingBag, label: "Purchase", path: "/owner-purchases", color: "bg-blue-500" },
  { icon: Package, label: "Stock", path: "/owner-stock", color: "bg-amber-500" },
  { icon: Wallet, label: "Accounts", path: MOBILE_ACCOUNTS_PATH, color: "bg-indigo-500" },
  { icon: BarChart3, label: "Reports", path: MOBILE_REPORTS_PATH, color: "bg-violet-500" },
];

export const MobileFAB = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { orgNavigate, getOrgPath } = useOrgNavigation();
  const location = useLocation();

  const hiddenRoutes = ["/pos-sales", "/pos", "/purchase-entry", "/sale-return-entry"];
  const shouldHide = hiddenRoutes.some(
    (route) =>
      location.pathname === getOrgPath(route) ||
      location.pathname.includes("/pos-sales") ||
      location.pathname.includes("/pos"),
  );

  if (shouldHide) return null;

  const handleAction = (action: FABAction) => {
    setIsOpen(false);
    orgNavigate(action.path);
  };

  return (
    <div className="fixed bottom-20 right-4 z-[45] lg:hidden pointer-events-auto">
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[44]"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div
        className={cn(
          "flex flex-col-reverse gap-2.5 mb-3 transition-all duration-200",
          isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none",
        )}
      >
        {fabActions.map((action, index) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              onClick={() => handleAction(action)}
              className="flex items-center gap-3 transition-all duration-150 active:scale-95 touch-manipulation"
              style={{
                transitionDelay: isOpen ? `${index * 40}ms` : "0ms",
                transform: isOpen ? "translateX(0)" : "translateX(20px)",
              }}
            >
              <span className="bg-background/95 backdrop-blur-sm text-foreground text-sm font-medium px-3 py-1.5 rounded-lg shadow-lg border border-border whitespace-nowrap">
                {action.label}
              </span>
              <div
                className={cn(
                  "w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-white",
                  action.color,
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "w-14 h-14 rounded-full shadow-lg flex items-center justify-center",
          "bg-primary text-primary-foreground",
          "transition-all duration-200 active:scale-95 touch-manipulation",
          isOpen && "rotate-45",
        )}
        aria-label="Open report shortcuts"
      >
        {isOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </button>
    </div>
  );
};
