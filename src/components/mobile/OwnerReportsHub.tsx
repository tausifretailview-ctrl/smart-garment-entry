import { useState } from "react";
import {
  TrendingUp, TrendingDown, PieChart, Package, Users, Building2,
  Receipt, Tag, Ruler, CreditCard, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OwnerReportDetail } from "./OwnerReportDetail";

export type ReportType =
  | "daily-sales" | "daily-purchase" | "profit-loss" | "stock-summary"
  | "customer-outstanding" | "supplier-outstanding" | "gst"
  | "brand-sales" | "size-sales" | "payment-collection";

interface ReportCard {
  id: ReportType;
  icon: React.ElementType;
  label: string;
  description: string;
  color: string;
}

const REPORTS: ReportCard[] = [
  { id: "daily-sales", icon: TrendingUp, label: "Daily Sales Report", description: "All sale bills & totals for a period", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" },
  { id: "daily-purchase", icon: TrendingDown, label: "Daily Purchase Report", description: "All purchase bills & totals for a period", color: "text-orange-600 bg-orange-50 dark:bg-orange-950/40" },
  { id: "profit-loss", icon: PieChart, label: "Profit & Loss Report", description: "Sale vs purchase cost & gross profit", color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40" },
  { id: "stock-summary", icon: Package, label: "Stock Summary Report", description: "All products with stock & value", color: "text-violet-600 bg-violet-50 dark:bg-violet-950/40" },
  { id: "customer-outstanding", icon: Users, label: "Customer Outstanding", description: "Customers with pending amounts", color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40" },
  { id: "supplier-outstanding", icon: Building2, label: "Supplier Outstanding", description: "Suppliers with pending payments", color: "text-red-600 bg-red-50 dark:bg-red-950/40" },
  { id: "gst", icon: Receipt, label: "GST Report", description: "Tax summary grouped by GST rate", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40" },
  { id: "brand-sales", icon: Tag, label: "Brand-wise Sales", description: "Sales breakdown by brand", color: "text-teal-600 bg-teal-50 dark:bg-teal-950/40" },
  { id: "size-sales", icon: Ruler, label: "Size-wise Sales", description: "Which sizes sell the most", color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40" },
  { id: "payment-collection", icon: CreditCard, label: "Payment Collection", description: "Payments received by mode", color: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/40" },
];

export const OwnerReportsHub = () => {
  const [activeReport, setActiveReport] = useState<ReportType | null>(null);

  if (activeReport) {
    return <OwnerReportDetail reportType={activeReport} onBack={() => setActiveReport(null)} />;
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 py-3">
        <h1 className="text-lg font-bold text-foreground">📊 Reports</h1>
        <p className="text-xs text-muted-foreground">Tap a report to view details</p>
      </div>

      {/* Report Cards */}
      <div className="p-4 space-y-2.5">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.id}
              onClick={() => setActiveReport(r.id)}
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
    </div>
  );
};
