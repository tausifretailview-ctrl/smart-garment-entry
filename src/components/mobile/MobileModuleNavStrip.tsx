import {
  Users,
  Building2,
  Package,
  BarChart3,
  Settings,
  Calculator,
  ShoppingBag,
  Wallet,
  FileText,
  LayoutGrid,
} from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { cn } from "@/lib/utils";

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  color?: string;
}

const items: NavItem[] = [
  { icon: Users, label: "Customers", path: "/customers", color: "text-purple-500" },
  { icon: Building2, label: "Suppliers", path: "/suppliers", color: "text-orange-500" },
  { icon: Package, label: "Products", path: "/products", color: "text-amber-500" },
  { icon: ShoppingBag, label: "Purchase", path: "/purchase-entry", color: "text-blue-500" },
  { icon: Wallet, label: "Payments", path: "/payments-dashboard", color: "text-indigo-500" },
  { icon: Calculator, label: "Cashier", path: "/daily-cashier-report", color: "text-violet-500" },
  { icon: BarChart3, label: "Reports", path: "/owner-reports", color: "text-emerald-500" },
  { icon: FileText, label: "Bills", path: "/purchase-bills", color: "text-sky-500" },
  { icon: Settings, label: "Settings", path: "/settings", color: "text-slate-500" },
  { icon: LayoutGrid, label: "More", path: "/mobile-more", color: "text-primary" },
];

/** Horizontal shortcut strip — replaces desktop sidebar on mobile dashboards. */
export function MobileModuleNavStrip({ className }: { className?: string }) {
  const { orgNavigate } = useOrgNavigation();

  return (
    <div className={cn("px-4 pb-2 lg:hidden", className)}>
      <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => orgNavigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center shrink-0 w-[4.25rem] gap-1",
                "rounded-xl border border-border/60 bg-card px-1 py-2",
                "active:scale-95 touch-manipulation shadow-sm",
              )}
            >
              <Icon className={cn("h-5 w-5", item.color ?? "text-foreground")} />
              <span className="text-[9px] font-medium text-muted-foreground text-center leading-tight">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
