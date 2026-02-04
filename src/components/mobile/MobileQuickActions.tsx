import { ShoppingCart, ShoppingBag, Package, Calculator, Users, Building2, CreditCard, BarChart3 } from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { cn } from "@/lib/utils";

interface QuickAction {
  icon: React.ElementType;
  label: string;
  path: string;
  gradient?: string;
  color?: string;
}

const primaryActions: QuickAction[] = [
  { 
    icon: ShoppingCart, 
    label: "POS", 
    path: "/pos-sales",
    gradient: "from-green-500 to-emerald-600"
  },
  { 
    icon: ShoppingBag, 
    label: "Purchase", 
    path: "/purchase-entry",
    gradient: "from-blue-500 to-indigo-600"
  },
  { 
    icon: Package, 
    label: "Stock", 
    path: "/stock-report",
    gradient: "from-amber-500 to-orange-600"
  },
  { 
    icon: Calculator, 
    label: "Cashier", 
    path: "/daily-cashier-report",
    gradient: "from-purple-500 to-violet-600"
  },
];

const secondaryActions: QuickAction[] = [
  { icon: Users, label: "Customers", path: "/customers", color: "text-purple-500" },
  { icon: Building2, label: "Suppliers", path: "/suppliers", color: "text-orange-500" },
  { icon: CreditCard, label: "Payments", path: "/payments-dashboard", color: "text-blue-500" },
  { icon: BarChart3, label: "Reports", path: "/mobile-reports", color: "text-green-500" },
];

export const MobileQuickActions = () => {
  const { orgNavigate } = useOrgNavigation();

  return (
    <div className="space-y-3 lg:hidden">
      {/* Primary Actions - Gradient Cards */}
      <div className="grid grid-cols-4 gap-2">
        {primaryActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.path}
              onClick={() => orgNavigate(action.path)}
              className={cn(
                "flex flex-col items-center justify-center p-3 rounded-xl",
                "bg-gradient-to-br shadow-sm",
                action.gradient,
                "text-white transition-all duration-150",
                "active:scale-95 touch-manipulation"
              )}
            >
              <Icon className="h-6 w-6 mb-1" />
              <span className="text-[10px] font-medium text-center leading-tight">
                {action.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Secondary Actions - Outlined Cards */}
      <div className="grid grid-cols-4 gap-2">
        {secondaryActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.path}
              onClick={() => orgNavigate(action.path)}
              className={cn(
                "flex flex-col items-center justify-center p-3 rounded-xl",
                "bg-card border border-border shadow-sm",
                "transition-all duration-150",
                "active:scale-95 active:bg-muted/50 touch-manipulation"
              )}
            >
              <Icon className={cn("h-5 w-5 mb-1", action.color)} />
              <span className="text-[10px] font-medium text-muted-foreground text-center leading-tight">
                {action.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
