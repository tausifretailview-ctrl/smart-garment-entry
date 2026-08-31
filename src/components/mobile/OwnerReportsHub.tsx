import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/mobile/PullToRefreshIndicator";
import { invalidateOwnerReportQueries } from "@/lib/mobileHubRefresh";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useDesktopViewActions } from "@/hooks/useDesktopViewPreference";
import {
  TrendingUp, TrendingDown, PieChart, Package, Users, UserCheck, Building2,
  Receipt, Tag, Ruler, CreditCard, ChevronRight, Grid3X3, Calculator, Monitor,
  BarChart3, Wallet, Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OwnerReportDetail } from "./OwnerReportDetail";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ReportType =
  | "size-wise-stock" | "customer-balance" | "supplier-balance"
  | "daily-sales" | "daily-purchase" | "profit-loss" | "stock-summary"
  | "customer-outstanding" | "supplier-outstanding" | "gst"
  | "brand-sales" | "size-sales" | "payment-collection"
  | "daily-cashier" | "item-wise-sales" | "customer-wise-sales" | "salesman-wise-sales" | "top-selling-products" | "item-wise-stock" | "net-profit" | "stock-report";

interface ReportCard {
  id: ReportType;
  icon: React.ElementType;
  label: string;
  description: string;
  color: string;
}

const REPORTS: ReportCard[] = [
  { id: "daily-cashier", icon: Calculator, label: "Cashier Report", description: "Bills with cash, UPI, card & net", color: "text-purple-600 bg-purple-50 dark:bg-purple-950/40" },
  { id: "item-wise-sales", icon: BarChart3, label: "Item-wise Sale", description: "Qty, rate and amount by product", color: "text-teal-600 bg-teal-50 dark:bg-teal-950/40" },
  { id: "customer-wise-sales", icon: Users, label: "Customer-wise Sale", description: "Bills and amount by customer", color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40" },
  { id: "salesman-wise-sales", icon: UserCheck, label: "Salesman-wise Sale", description: "Bills and amount by salesman", color: "text-fuchsia-600 bg-fuchsia-50 dark:bg-fuchsia-950/40" },
  { id: "top-selling-products", icon: Trophy, label: "Top Selling Products", description: "Top 50 by revenue or quantity", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40" },
  { id: "item-wise-stock", icon: Wallet, label: "Item-wise Stock", description: "Closing qty and stock value", color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40" },
  { id: "net-profit", icon: PieChart, label: "Net Profit", description: "Product profit, COGS and margin", color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40" },
  { id: "stock-report", icon: Package, label: "Stock Report", description: "Live stock, size, color and rate", color: "text-violet-600 bg-violet-50 dark:bg-violet-950/40" },
  { id: "size-wise-stock", icon: Grid3X3, label: "Size-wise Stock", description: "Search products & qty by size", color: "text-violet-600 bg-violet-50 dark:bg-violet-950/40" },
  { id: "customer-balance", icon: Users, label: "Customer Balance", description: "Search customers with O/S & advance", color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40" },
  { id: "supplier-balance", icon: Building2, label: "Supplier Balance", description: "Search suppliers with payables", color: "text-red-600 bg-red-50 dark:bg-red-950/40" },
  { id: "daily-sales", icon: TrendingUp, label: "Daily Sales Report", description: "All sale bills & totals for a period", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" },
  { id: "daily-purchase", icon: TrendingDown, label: "Daily Purchase Report", description: "All purchase bills & totals for a period", color: "text-orange-600 bg-orange-50 dark:bg-orange-950/40" },
  { id: "profit-loss", icon: PieChart, label: "Profit & Loss Report", description: "Sale vs purchase cost & gross profit", color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40" },
  { id: "stock-summary", icon: Package, label: "Stock Summary Report", description: "All products with stock & value", color: "text-violet-600 bg-violet-50 dark:bg-violet-950/40" },
  { id: "gst", icon: Receipt, label: "GST Report", description: "Tax summary grouped by GST rate", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40" },
  { id: "brand-sales", icon: Tag, label: "Brand-wise Sales", description: "Sales breakdown by brand", color: "text-teal-600 bg-teal-50 dark:bg-teal-950/40" },
  { id: "size-sales", icon: Ruler, label: "Size-wise Sales", description: "Which sizes sell the most", color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40" },
  { id: "payment-collection", icon: CreditCard, label: "Payment Collection", description: "Payments received by mode", color: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/40" },
];

const REPORT_IDS = new Set(REPORTS.map((r) => r.id));

type QuickLink =
  | { label: string; icon: React.ElementType; color: string; report: ReportType }
  | { label: string; icon: React.ElementType; color: string; desktopPath: string; desktopLabel: string };

/** One-tap shortcuts — mobile-native reports first; desktop-only shows a prompt. */
const QUICK_LINKS: QuickLink[] = [
  { label: "Size Stock", icon: Grid3X3, color: "text-violet-600 bg-violet-50 dark:bg-violet-950/40", report: "size-wise-stock" },
  { label: "Today's Sales", icon: TrendingUp, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40", report: "daily-sales" },
  { label: "Customer Balance", icon: Users, color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40", report: "customer-balance" },
  { label: "Supplier Balance", icon: Building2, color: "text-orange-600 bg-orange-50 dark:bg-orange-950/40", report: "supplier-balance" },
  { label: "Stock Report", icon: Package, color: "text-violet-600 bg-violet-50 dark:bg-violet-950/40", report: "stock-report" },
  { label: "Item Stock", icon: Wallet, color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40", report: "item-wise-stock" },
  { label: "Item-wise Sale", icon: BarChart3, color: "text-teal-600 bg-teal-50 dark:bg-teal-950/40", report: "item-wise-sales" },
  { label: "Net Profit", icon: PieChart, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40", report: "net-profit" },
  {
    label: "Daily Cashier",
    icon: Calculator,
    color: "text-purple-600 bg-purple-50 dark:bg-purple-950/40",
    report: "daily-cashier",
  },
  { label: "Payment Collection", icon: CreditCard, color: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/40", report: "payment-collection" },
];

export const OwnerReportsHub = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeReport, setActiveReport] = useState<ReportType | null>(null);
  const [desktopPrompt, setDesktopPrompt] = useState<{ path: string; label: string } | null>(null);
  const queryClient = useQueryClient();
  const { orgNavigate } = useOrgNavigation();
  const { enableDesktopView } = useDesktopViewActions();
  const { scrollRef, isRefreshing, pullHandlers } = usePullToRefresh(
    useCallback(() => invalidateOwnerReportQueries(queryClient), [queryClient])
  );

  useEffect(() => {
    const fromQuery = searchParams.get("report");
    if (fromQuery && REPORT_IDS.has(fromQuery as ReportType)) {
      setActiveReport(fromQuery as ReportType);
    }
  }, [searchParams]);

  const openReport = (id: ReportType) => {
    setActiveReport(id);
    setSearchParams({ report: id }, { replace: true });
  };

  const closeReport = () => {
    setActiveReport(null);
    setSearchParams({}, { replace: true });
  };

  const handleQuickLink = (link: QuickLink) => {
    if ("report" in link) {
      openReport(link.report);
      return;
    }
    setDesktopPrompt({ path: link.desktopPath, label: link.desktopLabel });
  };

  const openDesktopReport = () => {
    if (!desktopPrompt) return;
    enableDesktopView();
    orgNavigate(desktopPrompt.path);
    setDesktopPrompt(null);
  };

  if (activeReport) {
    return <OwnerReportDetail reportType={activeReport} onBack={closeReport} />;
  }

  return (
    <div
      ref={scrollRef}
      className="h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain bg-muted/30 pb-24"
      {...pullHandlers}
    >
      <PullToRefreshIndicator visible={isRefreshing} />
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-2 py-3 safe-area-pt">
        <h1 className="text-lg font-bold text-foreground">📊 Reports</h1>
        <p className="text-xs text-muted-foreground">Tap a report to view details</p>
      </div>

      {/* Quick links — horizontal like Home module strip */}
      <div className="pt-3 pb-1">
        <p className="px-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Quick access
        </p>
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-2 py-1">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            const isDesktopOnly = "desktopPath" in link;
            return (
              <button
                key={link.label}
                type="button"
                onClick={() => handleQuickLink(link)}
                className="flex flex-col items-center justify-center shrink-0 w-[4.5rem] gap-1 rounded-xl border border-border/60 bg-card px-1 py-2 active:scale-95 touch-manipulation shadow-sm"
              >
                <div className={cn("flex items-center justify-center w-8 h-8 rounded-lg", link.color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-[9px] font-medium text-foreground text-center leading-tight">
                  {link.label}
                </span>
                {isDesktopOnly ? (
                  <span className="text-[8px] text-muted-foreground">Desktop</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* All reports */}
      <div className="px-2 pt-3 pb-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2.5">
          All reports
        </p>
      </div>

      {/* Report Cards */}
      <div className="px-2 pb-4 space-y-2">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.id}
              onClick={() => openReport(r.id)}
              className="w-full flex items-center gap-3 p-3.5 bg-card rounded-xl border border-border/50 shadow-sm active:scale-[0.98] transition-all touch-manipulation text-left"
            >
              <div className={cn("flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0", r.color)}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{r.label}</p>
                <p className="text-[11px] text-muted-foreground truncate">{r.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
          );
        })}
      </div>

      <AlertDialog open={!!desktopPrompt} onOpenChange={(open) => !open && setDesktopPrompt(null)}>
        <AlertDialogContent className="max-w-[min(100vw-2rem,24rem)] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <Monitor className="h-4 w-4 text-primary" />
              {desktopPrompt?.label}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              This report is optimized for desktop. Switch to desktop view to open it on this device, or use a larger screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel className="touch-manipulation">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={openDesktopReport} className="touch-manipulation">
              View on desktop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
