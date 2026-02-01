import { ShoppingCart, CreditCard, Package, BarChart3 } from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { cn } from "@/lib/utils";

interface QuickAction {
  icon: React.ElementType;
  label: string;
  path: string;
  gradient: string;
}

const quickActions: QuickAction[] = [
  { 
    icon: ShoppingCart, 
    label: "POS Billing", 
    path: "/pos-sales",
    gradient: "from-green-500 to-emerald-600"
  },
  { 
    icon: CreditCard, 
    label: "Payments", 
    path: "/payments-dashboard",
    gradient: "from-blue-500 to-indigo-600"
  },
  { 
    icon: Package, 
    label: "Stock", 
    path: "/stock-report",
    gradient: "from-amber-500 to-orange-600"
  },
  { 
    icon: BarChart3, 
    label: "Reports", 
    path: "/daily-cashier-report",
    gradient: "from-purple-500 to-violet-600"
  },
];

export const MobileQuickActions = () => {
  const { orgNavigate } = useOrgNavigation();

  return (
    <div className="grid grid-cols-4 gap-2 lg:hidden">
      {quickActions.map((action) => {
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
  );
};
