import { useMemo, useState } from "react";
import {
  Package,
  Grid3X3,
  Layers,
  Clock,
  BarChart3,
  Calendar,
  ShoppingBag,
  ShoppingCart,
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
  Scale,
  Search,
  ChevronRight,
  Star,
  ClipboardList,
  LineChart,
  History,
  Activity,
  Home,
  type LucideIcon,
} from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ReportTabId = "favourite" | "sales" | "purchase" | "inventory" | "accounts" | "gst" | "other";

interface ReportItem {
  icon: LucideIcon;
  label: string;
  path: string;
  desc: string;
  tab: ReportTabId;
  favourite?: boolean;
  permission?: string;
  permissionAlt?: string;
}

interface ReportTabConfig {
  id: ReportTabId;
  label: string;
  icon: LucideIcon;
  sectionTitle: string;
}

const REPORT_TABS: ReportTabConfig[] = [
  { id: "favourite", label: "Favourite", icon: Star, sectionTitle: "Favourite" },
  { id: "sales", label: "Sales", icon: ShoppingCart, sectionTitle: "Sales Reports" },
  { id: "purchase", label: "Purchase", icon: ShoppingBag, sectionTitle: "Purchase Reports" },
  { id: "inventory", label: "Inventory", icon: Package, sectionTitle: "Inventory Reports" },
  { id: "accounts", label: "Accounts", icon: BookOpen, sectionTitle: "Accounts Reports" },
  { id: "gst", label: "GST Returns", icon: ClipboardList, sectionTitle: "GST & Compliance" },
  { id: "other", label: "Other", icon: BarChart3, sectionTitle: "Other Reports" },
];

const ALL_REPORTS: ReportItem[] = [
  // —— Sales ——
  {
    icon: BarChart3,
    label: "Sales Report",
    path: "/sales-invoice-dashboard",
    desc: "All sales invoices and totals",
    tab: "sales",
    favourite: true,
    permission: "sales_invoice_dashboard",
  },
  {
    icon: ShoppingBag,
    label: "Item-wise Sales",
    path: "/item-wise-sales",
    desc: "Revenue and qty by product",
    tab: "sales",
    favourite: true,
    permission: "item_wise_sales",
  },
  {
    icon: Users,
    label: "Customer Sales",
    path: "/sales-report",
    desc: "Sales grouped by customer",
    tab: "sales",
    permission: "sales_report_customer",
  },
  {
    icon: Calendar,
    label: "Daily Cashier",
    path: "/daily-cashier-report",
    desc: "Cash and tender summary for the day",
    tab: "sales",
    favourite: true,
    permission: "daily_cashier_report",
  },
  {
    icon: TrendingUp,
    label: "Sales Analytics",
    path: "/sales-analytics",
    desc: "Trends, segments, and KPIs",
    tab: "sales",
    permission: "sales_analytics",
  },
  {
    icon: RotateCcw,
    label: "Sale Returns",
    path: "/sale-returns",
    desc: "Return bills and credit adjustments",
    tab: "sales",
    permission: "sale_return_dashboard",
    permissionAlt: "sale_return",
  },
  {
    icon: LineChart,
    label: "Daily Sale Analysis",
    path: "/daily-sale-analysis",
    desc: "Day-wise sales breakdown and trends",
    tab: "sales",
    permission: "sale_analysis",
  },
  {
    icon: Activity,
    label: "Hourly Sales Analysis",
    path: "/hourly-sales-analysis",
    desc: "Peak hours and time-of-day trends",
    tab: "sales",
    permission: "hourly_sales_analysis",
  },
  // —— Purchase ——
  {
    icon: FileText,
    label: "Purchase Report",
    path: "/purchase-bills",
    desc: "All supplier purchase bills",
    tab: "purchase",
    favourite: true,
    permission: "purchase_dashboard",
  },
  {
    icon: Building2,
    label: "Purchase by Supplier",
    path: "/purchase-report",
    desc: "Qty and value supplier-wise",
    tab: "purchase",
    permission: "purchase_report_supplier",
  },
  {
    icon: RotateCcw,
    label: "Purchase Returns",
    path: "/purchase-returns",
    desc: "Return bills and credit notes",
    tab: "purchase",
    permission: "purchase_return_dashboard",
    permissionAlt: "purchase_return",
  },
  {
    icon: Scale,
    label: "Supplier Balances",
    path: "/supplier-party-balances",
    desc: "Tally-style Cr/Dr payables list",
    tab: "purchase",
    permission: "accounts_dashboard",
    permissionAlt: "purchase_dashboard",
  },
  // —— Inventory ——
  {
    icon: Package,
    label: "Stock Report",
    path: "/stock-report",
    desc: "Opening, movement, and on-hand qty",
    tab: "inventory",
    favourite: true,
    permission: "stock_report",
  },
  {
    icon: Layers,
    label: "Item-wise Stock",
    path: "/item-wise-stock",
    desc: "Aggregated stock by product",
    tab: "inventory",
    favourite: true,
    permission: "item_wise_stock",
  },
  {
    icon: Clock,
    label: "Stock Ageing",
    path: "/stock-ageing",
    desc: "How long stock has been held",
    tab: "inventory",
    permission: "stock_ageing",
  },
  {
    icon: Grid3X3,
    label: "Size-wise Stock",
    path: "/stock-report?tab=sizewise",
    desc: "Matrix by product and size",
    tab: "inventory",
    permission: "stock_report",
  },
  {
    icon: BarChart3,
    label: "Stock Analysis",
    path: "/stock-analysis",
    desc: "Low stock alerts and movement",
    tab: "inventory",
    permission: "stock_analysis",
  },
  {
    icon: Search,
    label: "Product Tracking",
    path: "/product-tracking",
    desc: "Trace product movement history",
    tab: "inventory",
    permission: "product_tracking",
  },
  // —— Accounts ——
  {
    icon: TrendingUp,
    label: "Net Profit Analysis",
    path: "/net-profit-analysis",
    desc: "Gross margin by supplier and product",
    tab: "accounts",
    favourite: true,
    permission: "net_profit_analysis",
  },
  {
    icon: BookOpen,
    label: "Daily Tally",
    path: "/daily-tally",
    desc: "Day book and cash position",
    tab: "accounts",
    permission: "daily_tally",
  },
  {
    icon: Wallet,
    label: "Payments",
    path: "/payments-dashboard",
    desc: "Customer and supplier payments",
    tab: "accounts",
    permission: "payments_dashboard",
  },
  {
    icon: Receipt,
    label: "Expense / Salary",
    path: "/expense-salary-report",
    desc: "Payroll and expense breakdown",
    tab: "accounts",
    permission: "accounting_reports_view",
  },
  {
    icon: FileSpreadsheet,
    label: "Accounting Reports",
    path: "/accounting-reports",
    desc: "P&L, balance sheet, and ledgers",
    tab: "accounts",
    permission: "accounting_reports_view",
  },
  {
    icon: Users,
    label: "Customer Ledger",
    path: "/customer-ledger-report",
    desc: "Outstanding and ledger balances",
    tab: "accounts",
    permission: "customer_ledger",
  },
  {
    icon: Scale,
    label: "Customer Balances",
    path: "/customer-party-balances",
    desc: "Tally-style Dr/Cr party list",
    tab: "accounts",
    favourite: true,
    permission: "customer_ledger",
  },
  {
    icon: FileText,
    label: "Customer Statement",
    path: "/customer-account-statement",
    desc: "Printable account statement",
    tab: "accounts",
    permission: "customer_account_statement",
    permissionAlt: "customer_ledger",
  },
  {
    icon: Coins,
    label: "Advance Booking",
    path: "/advance-booking-dashboard",
    desc: "Bookings and advance collections",
    tab: "accounts",
    permission: "sales_invoice_dashboard",
  },
  {
    icon: Activity,
    label: "Customer Balance Activity",
    path: "/customer-balance-activity",
    desc: "Balance changes and activity log",
    tab: "accounts",
    permission: "customer_balance_activity",
    permissionAlt: "customer_ledger",
  },
  {
    icon: ShieldCheck,
    label: "Customer Audit Report",
    path: "/customer-audit-report",
    desc: "Verified customer outstanding",
    tab: "accounts",
    permission: "customer_audit_report",
    permissionAlt: "customer_ledger",
  },
  // —— GST ——
  {
    icon: ShieldCheck,
    label: "GST Reports",
    path: "/gst-reports",
    desc: "GST summaries and returns",
    tab: "gst",
    permission: "gst_reports",
  },
  {
    icon: FileText,
    label: "GST Register",
    path: "/gst-register",
    desc: "Sale and purchase GST register",
    tab: "gst",
    permission: "gst_register",
  },
  {
    icon: FileText,
    label: "E-Invoice Report",
    path: "/einvoice-report",
    desc: "IRN and e-invoice status",
    tab: "gst",
    permission: "einvoice_report",
  },
  {
    icon: FileSpreadsheet,
    label: "Tally Export",
    path: "/tally-export",
    desc: "Export vouchers for Tally",
    tab: "gst",
    permission: "tally_export",
  },
  // —— Other ——
  {
    icon: History,
    label: "Price History",
    path: "/price-history",
    desc: "MRP and rate change history",
    tab: "other",
    permission: "price_history",
  },
  {
    icon: FileText,
    label: "Statement (Audit)",
    path: "/customer-account-statement-audit",
    desc: "Audit register for comparison",
    tab: "other",
    permission: "customer_account_statement",
    permissionAlt: "customer_ledger",
  },
];

function ReportCard({
  report,
  onOpen,
}: {
  report: ReportItem;
  onOpen: (path: string) => void;
}) {
  const Icon = report.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(report.path)}
      className="group w-full text-left"
    >
      <div
        className={cn(
          "flex h-full min-h-[4.5rem] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition-all",
          "hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-md",
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800 group-hover:text-blue-700">
            {report.label}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
            {report.desc}
          </p>
        </div>
        {report.favourite ? (
          <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-blue-500" />
        )}
      </div>
    </button>
  );
}

export default function ReportsHub() {
  const { orgNavigate } = useOrgNavigation();
  const { hasMenuAccess, permissions, loading: permissionsLoading } = useUserPermissions();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<ReportTabId>("favourite");

  const canSee = (item: ReportItem) => {
    if (permissionsLoading) return false;
    if (permissions === null) return true;
    if (!item.permission && !item.permissionAlt) return true;
    if (item.permission && hasMenuAccess(item.permission)) return true;
    if (item.permissionAlt && hasMenuAccess(item.permissionAlt)) return true;
    return false;
  };

  const visibleReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ALL_REPORTS.filter((report) => {
      if (!canSee(report)) return false;
      if (activeTab === "favourite" && !report.favourite) return false;
      if (activeTab !== "favourite" && report.tab !== activeTab) return false;
      if (!q) return true;
      return (
        report.label.toLowerCase().includes(q) ||
        report.desc.toLowerCase().includes(q)
      );
    });
  }, [search, permissions, permissionsLoading, hasMenuAccess, activeTab]);

  const tabsWithReports = useMemo(() => {
    return REPORT_TABS.filter((tab) => {
      if (tab.id === "favourite") {
        return ALL_REPORTS.some((r) => r.favourite && canSee(r));
      }
      return ALL_REPORTS.some((r) => r.tab === tab.id && canSee(r));
    });
  }, [permissions, permissionsLoading, hasMenuAccess]);

  const activeTabConfig = REPORT_TABS.find((t) => t.id === activeTab) ?? REPORT_TABS[0];

  return (
    <div className="reports-hub-workspace flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-100 px-2 py-2 sm:px-3">
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 px-3 text-sm"
              onClick={() => orgNavigate("/")}
            >
              <Home className="mr-1 h-4 w-4" />
              Dashboard
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-none tracking-tight text-blue-700">Reports</h1>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                Section-wise reports — open any report from the tab below
              </p>
            </div>
          </div>
          <div className="relative w-full min-w-[200px] max-w-md sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="SEARCH REPORTS..."
              className="h-10 border-slate-200 bg-white pl-10 text-sm uppercase placeholder:normal-case"
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {/* Vasy-style blue tab strip */}
          <div
            className="shrink-0 overflow-x-auto rounded-t-lg bg-blue-600 tab-scroll-stable"
            role="tablist"
            aria-label="Report sections"
          >
            <div className="flex min-w-max">
              {tabsWithReports.map((tab, index) => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex min-w-[5.5rem] flex-col items-center justify-center gap-1 px-3 py-2.5 text-center transition-colors sm:min-w-[6.5rem] sm:px-4",
                      index > 0 && "border-l border-dashed border-white/35",
                      isActive
                        ? "bg-white text-blue-700"
                        : "text-white/95 hover:bg-blue-500/80",
                    )}
                  >
                    <TabIcon className={cn("h-5 w-5", isActive ? "text-blue-600" : "text-white")} />
                    <span className="text-[11px] font-semibold leading-none sm:text-xs">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4">
            <h2 className="mb-3 shrink-0 text-center text-sm font-bold uppercase tracking-wide text-blue-700">
              {activeTabConfig.sectionTitle}
            </h2>

            {permissionsLoading ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading…</div>
            ) : visibleReports.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-muted-foreground">
                {search.trim()
                  ? "No reports match your search in this section."
                  : "No reports available for your role in this section."}
              </div>
            ) : (
              <div className="reports-hub-grid min-h-0 flex-1 overflow-y-auto overflow-x-hidden tab-scroll-stable pb-1">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleReports.map((report) => (
                    <ReportCard key={report.path} report={report} onOpen={orgNavigate} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
