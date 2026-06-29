import { ShoppingBag, Package, Calculator, BarChart3, ScanBarcode, IndianRupee, Wallet } from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useMobileScan } from "@/contexts/MobileScanContext";
import { cn } from "@/lib/utils";
import {
  MOBILE_ACCOUNTS_PATH,
  MOBILE_REPORTS_PATH,
  MOBILE_SALES_PATH,
} from "@/lib/mobileShell";

interface QuickAction {
  icon: React.ElementType;
  label: string;
  path: string;
  gradient?: string;
  color?: string;
}

const primaryActions: QuickAction[] = [
  { icon: ScanBarcode, label: "Scan", path: "/owner-stock", gradient: "from-primary to-blue-600" },
  { icon: IndianRupee, label: "Sales", path: MOBILE_SALES_PATH, gradient: "from-emerald-500 to-teal-600" },
  { icon: ShoppingBag, label: "Purchase", path: "/owner-purchases", gradient: "from-blue-500 to-indigo-600" },
  { icon: Package, label: "Stock", path: "/owner-stock", gradient: "from-amber-500 to-orange-600" },
];

const secondaryActions: QuickAction[] = [
  { icon: Wallet, label: "Accounts", path: MOBILE_ACCOUNTS_PATH, color: "text-indigo-500" },
  { icon: Calculator, label: "Cashier", path: "/daily-cashier-report", color: "text-purple-500" },
  { icon: BarChart3, label: "Reports", path: MOBILE_REPORTS_PATH, color: "text-green-500" },
];

export const MobileQuickActions = () => {
  const { orgNavigate } = useOrgNavigation();
  const { openScan } = useMobileScan();

  const handleAction = (action: QuickAction) => {
    if (action.label === "Scan") {
      openScan();
      return;
    }
    orgNavigate(action.path);
  };

  return (
    <div className="space-y-3 lg:hidden">
      <div className="grid grid-cols-4 gap-2">
        {primaryActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.path}
              onClick={() => handleAction(action)}
              className={cn(
                "flex flex-col items-center justify-center p-3 rounded-xl",
                "bg-gradient-to-br shadow-sm",
                action.gradient,
                "text-white transition-all duration-150",
                "active:scale-95 touch-manipulation",
              )}
            >
              <Icon className="h-6 w-6 mb-1" />
              <span className="text-[10px] font-medium text-center leading-tight">{action.label}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {secondaryActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.path}
              onClick={() => handleAction(action)}
              className={cn(
                "flex flex-col items-center justify-center p-3 rounded-xl",
                "bg-card border border-border shadow-sm",
                "transition-all duration-150",
                "active:scale-95 active:bg-muted/50 touch-manipulation",
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
