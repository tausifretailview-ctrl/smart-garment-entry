import { IndianRupee, ShoppingCart, Package, BarChart3, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const screenConfig: Record<string, { icon: React.ElementType; title: string; color: string; bg: string }> = {
  sales: { icon: IndianRupee, title: "Sales", color: "text-success", bg: "bg-success/10" },
  purchases: { icon: ShoppingCart, title: "Purchases", color: "text-warning", bg: "bg-warning/10" },
  stock: { icon: Package, title: "Stock", color: "text-primary", bg: "bg-primary/10" },
  reports: { icon: BarChart3, title: "Reports", color: "text-info", bg: "bg-info/10" },
};

export const OwnerPlaceholderScreen = ({ screen }: { screen: string }) => {
  const cfg = screenConfig[screen] || screenConfig.sales;
  const Icon = cfg.icon;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 pb-24">
      <div className={cn("w-20 h-20 rounded-2xl flex items-center justify-center mb-5", cfg.bg)}>
        <Icon className={cn("h-10 w-10", cfg.color)} />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-2">{cfg.title}</h2>
      <p className="text-sm text-muted-foreground text-center max-w-[260px] mb-6">
        Detailed {cfg.title.toLowerCase()} analytics and management coming soon.
      </p>
      <div className="flex items-center gap-2 bg-muted/50 rounded-full px-4 py-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Coming Soon</span>
      </div>
    </div>
  );
};
