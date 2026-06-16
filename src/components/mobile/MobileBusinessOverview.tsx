import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  ShoppingBag,
  Package,
  Wallet,
  ChevronRight,
} from "lucide-react";

export type BusinessOverviewPeriod = "today" | "month";

export type BusinessOverviewStats = {
  total_sales: number;
  invoice_count: number;
  sold_qty: number;
  total_purchase: number;
  purchase_count: number;
  total_stock_qty: number;
  total_stock_value: number;
  total_receivables: number;
  pending_count: number;
};

function formatCompactInr(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "₹0";
  const abs = Math.abs(value);
  if (abs >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

type CardDef = {
  key: string;
  title: string;
  icon: typeof TrendingUp;
  color: string;
  bg: string;
  primary: string;
  secondary: string;
  nav: string;
};

interface MobileBusinessOverviewProps {
  period: BusinessOverviewPeriod;
  onPeriodChange: (period: BusinessOverviewPeriod) => void;
  stats: BusinessOverviewStats | null | undefined;
  salesTotalOverride?: number | null;
  salesCountOverride?: number | null;
  isLoading: boolean;
  onNavigate: (path: string) => void;
}

export function MobileBusinessOverview({
  period,
  onPeriodChange,
  stats,
  salesTotalOverride,
  salesCountOverride,
  isLoading,
  onNavigate,
}: MobileBusinessOverviewProps) {
  const saleAmount = salesTotalOverride ?? stats?.total_sales ?? 0;
  const saleBills = salesCountOverride ?? stats?.invoice_count ?? 0;
  const saleQty = stats?.sold_qty ?? 0;

  const cards: CardDef[] = [
    {
      key: "sales",
      title: "Sales",
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "bg-emerald-50 dark:bg-emerald-950/40",
      primary: formatCompactInr(saleAmount),
      secondary: `${saleBills.toLocaleString("en-IN")} bills · ${saleQty.toLocaleString("en-IN")} qty`,
      nav: "/mobile-sales",
    },
    {
      key: "purchase",
      title: "Purchase",
      icon: ShoppingBag,
      color: "text-orange-600",
      bg: "bg-orange-50 dark:bg-orange-950/40",
      primary: formatCompactInr(stats?.total_purchase),
      secondary: `${(stats?.purchase_count ?? 0).toLocaleString("en-IN")} bills`,
      nav: "/purchase-bills",
    },
    {
      key: "stock",
      title: "Stock",
      icon: Package,
      color: "text-blue-600",
      bg: "bg-blue-50 dark:bg-blue-950/40",
      primary: formatCompactInr(stats?.total_stock_value),
      secondary: `${(stats?.total_stock_qty ?? 0).toLocaleString("en-IN")} pcs`,
      nav: "/stock-report",
    },
    {
      key: "payments",
      title: "Payments",
      icon: Wallet,
      color: "text-rose-600",
      bg: "bg-rose-50 dark:bg-rose-950/40",
      primary: formatCompactInr(stats?.total_receivables),
      secondary: `${(stats?.pending_count ?? 0).toLocaleString("en-IN")} pending`,
      nav: "/mobile-accounts",
    },
  ];

  return (
    <section className="px-4 mt-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Business Overview
        </h2>
        <div className="flex rounded-lg border border-border/60 bg-muted/40 p-0.5">
          {(["today", "month"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPeriodChange(p)}
              className={cn(
                "px-3 py-1 text-[11px] font-medium rounded-md transition-colors touch-manipulation",
                period === p
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              {p === "today" ? "Today" : "This Month"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => onNavigate(card.nav)}
              className="min-h-[7.25rem] bg-white dark:bg-card rounded-2xl p-3.5 border border-border/40 shadow-sm text-left touch-manipulation active:scale-[0.98] transition-transform flex flex-col"
            >
              <div className="flex items-start justify-between gap-1 mb-2">
                <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", card.bg)}>
                  <Icon className={cn("h-4 w-4", card.color)} />
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              </div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                {card.title}
              </p>
              {isLoading ? (
                <Skeleton className="h-6 w-full mt-1" />
              ) : (
                <p className="text-base font-bold tabular-nums text-foreground mt-0.5 leading-tight break-all">
                  {card.primary}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground mt-auto pt-1 line-clamp-2">
                {isLoading ? "…" : card.secondary}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
