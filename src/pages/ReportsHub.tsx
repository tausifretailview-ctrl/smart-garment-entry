import { useMemo, useState } from "react";
import {
  Package,
  Grid3X3,
  Layers,
  Clock,
  BarChart3,
  Calendar,
  ShoppingBag,
  Users,
  FileText,
  Building2,
  RotateCcw,
  TrendingUp,
  Wallet,
  Receipt,
  BookOpen,
  Coins,
  ShieldCheck,
  FileSpreadsheet,
  Search,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ReportItem {
  icon: LucideIcon;
  label: string;
  path: string;
  desc: string;
  permission?: string;
  /** Alternate permission — show if either matches */
  permissionAlt?: string;
}

interface ReportCategory {
  id: string;
  title: string;
  accent: string;
  iconBg: string;
  reports: ReportItem[];
}

const REPORT_CATEGORIES: ReportCategory[] = [
  {
    id: "sales",
    title: "Sales Reports",
    accent: "text-green-600 dark:text-green-400",
    iconBg: "bg-green-50 dark:bg-green-950/50",
    reports: [
      {
        icon: BarChart3,
        label: "Sales Report",
        path: "/sales-invoice-dashboard",
        desc: "All sales invoices and totals",
        permission: "sales_invoice_dashboard",
      },
      {
        icon: ShoppingBag,
        label: "Item-wise Sales",
        path: "/item-wise-sales",
        desc: "Revenue and qty by product",
        permission: "item_wise_sales",
      },
      {
        icon: Users,
        label: "Customer Sales",
        path: "/sales-report",
        desc: "Sales grouped by customer",
        permission: "sales_report_customer",
      },
      {
        icon: Calendar,
        label: "Daily Cashier",
        path: "/daily-cashier-report",
        desc: "Cash and tender summary for the day",
        permission: "daily_cashier_report",
      },
      {
        icon: TrendingUp,
        label: "Sales Analytics",
        path: "/sales-analytics",
        desc: "Trends, segments, and KPIs",
        permission: "sales_analytics",
      },
    ],
  },
  {
    id: "purchase",
    title: "Purchase Reports",
    accent: "text-blue-600 dark:text-blue-400",
    iconBg: "bg-blue-50 dark:bg-blue-950/50",
    reports: [
      {
        icon: FileText,
        label: "Purchase Report",
        path: "/purchase-bills",
        desc: "All supplier purchase bills",
        permission: "purchase_dashboard",
      },
      {
        icon: Building2,
        label: "Purchase by Supplier",
        path: "/purchase-report",
        desc: "Qty and value supplier-wise",
        permission: "purchase_report_supplier",
      },
      {
        icon: RotateCcw,
        label: "Purchase Returns",
        path: "/purchase-returns",
        desc: "Return bills and credit notes",
        permission: "purchase_return_dashboard",
        permissionAlt: "purchase_return",
      },
    ],
  },
  {
    id: "stock",
    title: "Stock Reports",
    accent: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-50 dark:bg-amber-950/50",
    reports: [
      {
        icon: Package,
        label: "Stock Report",
        path: "/stock-report",
        desc: "Opening, movement, and on-hand qty",
        permission: "stock_report",
      },
      {
        icon: Layers,
        label: "Item-wise Stock",
        path: "/item-wise-stock",
        desc: "Aggregated stock by product",
        permission: "item_wise_stock",
      },
      {
        icon: Clock,
        label: "Stock Ageing",
        path: "/stock-ageing",
        desc: "How long stock has been held",
        permission: "stock_ageing",
      },
      {
        icon: Grid3X3,
        label: "Size-wise Stock",
        path: "/stock-report?tab=sizewise",
        desc: "Matrix by product and size",
        permission: "stock_report",
      },
    ],
  },
  {
    id: "financial",
    title: "Financial Reports",
    accent: "text-purple-600 dark:text-purple-400",
    iconBg: "bg-purple-50 dark:bg-purple-950/50",
    reports: [
      {
        icon: TrendingUp,
        label: "Net Profit Analysis",
        path: "/net-profit-analysis",
        desc: "Gross margin by supplier and product",
        permission: "net_profit_analysis",
      },
      {
        icon: BookOpen,
        label: "Daily Tally",
        path: "/daily-tally",
        desc: "Day book and cash position",
        permission: "daily_tally",
      },
      {
        icon: Wallet,
        label: "Payments",
        path: "/payments-dashboard",
        desc: "Customer and supplier payments",
        permission: "payments_dashboard",
      },
      {
        icon: Receipt,
        label: "Expense / Salary",
        path: "/expense-salary-report",
        desc: "Payroll and expense breakdown",
        permission: "accounting_reports_view",
      },
      {
        icon: FileSpreadsheet,
        label: "Accounting Reports",
        path: "/accounting-reports",
        desc: "P&L, balance sheet, and ledgers",
        permission: "accounting_reports_view",
      },
    ],
  },
  {
    id: "customer",
    title: "Customer Reports",
    accent: "text-teal-600 dark:text-teal-400",
    iconBg: "bg-teal-50 dark:bg-teal-950/50",
    reports: [
      {
        icon: Users,
        label: "Customer Ledger",
        path: "/customer-ledger-report",
        desc: "Outstanding and ledger balances",
        permission: "customer_ledger",
      },
      {
        icon: FileText,
        label: "Customer Statement",
        path: "/customer-account-statement",
        desc: "Printable account statement",
        permission: "customer_account_statement",
        permissionAlt: "customer_ledger",
      },
      {
        icon: Coins,
        label: "Advance Booking",
        path: "/advance-booking-dashboard",
        desc: "Bookings and advance collections",
        permission: "sales_invoice_dashboard",
      },
    ],
  },
  {
    id: "gst",
    title: "GST & Compliance",
    accent: "text-indigo-600 dark:text-indigo-400",
    iconBg: "bg-indigo-50 dark:bg-indigo-950/50",
    reports: [
      {
        icon: ShieldCheck,
        label: "GST Reports",
        path: "/gst-reports",
        desc: "GST summaries and returns",
        permission: "gst_reports",
      },
      {
        icon: FileText,
        label: "E-Invoice Report",
        path: "/einvoice-report",
        desc: "IRN and e-invoice status",
        permission: "einvoice_report",
      },
      {
        icon: FileSpreadsheet,
        label: "Tally Export",
        path: "/tally-export",
        desc: "Export vouchers for Tally",
        permission: "tally_export",
      },
    ],
  },
];

export default function ReportsHub() {
  const { orgNavigate } = useOrgNavigation();
  const { hasMenuAccess, permissions, loading: permissionsLoading } = useUserPermissions();
  const [search, setSearch] = useState("");

  const visibleCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    const canSee = (item: ReportItem) => {
      if (permissionsLoading) return false;
      if (permissions === null) return true;
      if (!item.permission && !item.permissionAlt) return true;
      if (item.permission && hasMenuAccess(item.permission)) return true;
      if (item.permissionAlt && hasMenuAccess(item.permissionAlt)) return true;
      return false;
    };
    return REPORT_CATEGORIES.map((category) => {
      const reports = category.reports.filter((report) => {
        if (!canSee(report)) return false;
        if (!q) return true;
        return (
          report.label.toLowerCase().includes(q) ||
          report.desc.toLowerCase().includes(q) ||
          category.title.toLowerCase().includes(q)
        );
      });
      return { ...category, reports };
    }).filter((category) => category.reports.length > 0);
  }, [search, permissions, permissionsLoading, hasMenuAccess]);

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-6">
      <BackToDashboard />

      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-blue-600 tracking-tight">
          Reports
        </h1>
        <p className="text-sm text-muted-foreground">
          Open any report — grouped for quick access. All existing report pages remain available.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reports…"
          className="pl-9 h-10 bg-card border-slate-200 dark:border-slate-700"
        />
      </div>

      {visibleCategories.length === 0 ? (
        <Card className="border border-dashed border-slate-200 dark:border-slate-700">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {permissionsLoading
              ? "Loading…"
              : search.trim()
                ? "No reports match your search."
                : "No reports available for your role. Contact your administrator."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {visibleCategories.map((category) => (
            <section key={category.id} aria-labelledby={`reports-${category.id}`}>
              <h2
                id={`reports-${category.id}`}
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3"
              >
                {category.title}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {category.reports.map((report) => {
                  const Icon = report.icon;
                  return (
                    <button
                      key={report.path}
                      type="button"
                      onClick={() => orgNavigate(report.path)}
                      className="text-left group"
                    >
                      <Card
                        className={cn(
                          "h-full border border-slate-200 dark:border-slate-700 shadow-sm",
                          "hover:shadow-md hover:border-primary/30 transition-all duration-150",
                          "border-l-[3px] border-l-primary/70",
                        )}
                      >
                        <CardContent className="p-4 flex items-start gap-3">
                          <div
                            className={cn(
                              "shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
                              category.iconBg,
                            )}
                          >
                            <Icon className={cn("h-5 w-5", category.accent)} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                                {report.label}
                              </p>
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-primary mt-0.5" />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 leading-snug">
                              {report.desc}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
