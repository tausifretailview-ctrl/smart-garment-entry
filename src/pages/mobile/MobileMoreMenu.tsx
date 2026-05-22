import { 
  Users, 
  Building2, 
  ShoppingBag, 
  RotateCcw, 
  Undo2,
  BarChart3, 
  FileText, 
  Receipt, 
  TrendingUp,
  Settings, 
  User, 
  HelpCircle, 
  LogOut,
  Package,
  Wallet,
  FileSpreadsheet
} from "lucide-react";
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/mobile/PullToRefreshIndicator";
import { invalidateActiveHubQueries } from "@/lib/mobileHubRefresh";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface MenuItem {
  icon: React.ElementType;
  label: string;
  path?: string;
  action?: () => void;
  color?: string;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

export default function MobileMoreMenu() {
  const { orgNavigate } = useOrgNavigation();
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const { scrollRef, isRefreshing, pullHandlers } = usePullToRefresh(
    useCallback(() => invalidateActiveHubQueries(queryClient), [queryClient])
  );

  const handleSignOut = async () => {
    await signOut();
  };

  const menuSections: MenuSection[] = [
    {
      title: "Transactions",
      items: [
        { icon: Users, label: "Customers", path: "/customers", color: "text-purple-500" },
        { icon: Building2, label: "Suppliers", path: "/suppliers", color: "text-orange-500" },
        { icon: ShoppingBag, label: "Purchase Entry", path: "/purchase-entry", color: "text-amber-500" },
        { icon: FileText, label: "Purchase Bills", path: "/purchase-bills", color: "text-blue-500" },
        { icon: RotateCcw, label: "Purchase Return", path: "/purchase-return-entry", color: "text-rose-500" },
        { icon: Undo2, label: "Sale Return", path: "/sale-return-entry", color: "text-red-500" },
        { icon: Wallet, label: "Payments", path: "/payments-dashboard", color: "text-blue-500" },
      ],
    },
    {
      title: "Inventory",
      items: [
        { icon: Package, label: "Products", path: "/products", color: "text-amber-500" },
        { icon: BarChart3, label: "Stock Report", path: "/stock-report", color: "text-green-500" },
        { icon: FileText, label: "Stock Adjustment", path: "/stock-adjustment", color: "text-blue-500" },
        { icon: FileSpreadsheet, label: "Barcode Printing", path: "/barcode-printing", color: "text-purple-500" },
      ],
    },
    {
      title: "Reports",
      items: [
        { icon: BarChart3, label: "All Reports", path: "/owner-reports", color: "text-green-500" },
        { icon: TrendingUp, label: "Daily Cashier", path: "/daily-cashier-report", color: "text-purple-500" },
        { icon: Package, label: "Stock Report", path: "/stock-report", color: "text-amber-500" },
        { icon: Receipt, label: "GST Reports", path: "/gst-reports", color: "text-indigo-500" },
      ],
    },
    {
      title: "Settings",
      items: [
        { icon: Settings, label: "App Settings", path: "/settings", color: "text-slate-500" },
        { icon: User, label: "Profile", path: "/profile", color: "text-blue-500" },
        { icon: HelpCircle, label: "Help & Support", path: "/settings", color: "text-teal-500" },
        { icon: LogOut, label: "Sign Out", action: handleSignOut, color: "text-red-500" },
      ],
    },
  ];

  const handleItemClick = (item: MenuItem) => {
    if (item.action) {
      item.action();
    } else if (item.path) {
      orgNavigate(item.path);
    }
  };

  return (
    <div
      ref={scrollRef}
      className="min-h-screen bg-background pb-24"
      {...pullHandlers}
    >
      <PullToRefreshIndicator visible={isRefreshing} />
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 py-4">
        <h1 className="text-xl font-semibold text-foreground">More Options</h1>
      </div>

      {/* Menu Sections — icon grid */}
      <div className="px-4 py-4 space-y-6">
        {menuSections.map((section) => (
          <div key={section.title}>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 px-1">
              {section.title}
            </h2>
            <div className="grid grid-cols-4 gap-2.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl",
                      "bg-card border border-border/60 shadow-sm",
                      "active:scale-95 active:bg-muted/50 touch-manipulation",
                    )}
                  >
                    <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                      <Icon className={cn("h-5 w-5", item.color || "text-foreground")} />
                    </div>
                    <span className="text-[10px] font-medium text-foreground text-center leading-tight">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* App Version */}
      <div className="px-4 py-6 text-center">
        <p className="text-xs text-muted-foreground">Ezzy ERP v2.0</p>
        <p className="text-xs text-muted-foreground mt-1">Made with ❤️ in India</p>
      </div>
    </div>
  );
}
