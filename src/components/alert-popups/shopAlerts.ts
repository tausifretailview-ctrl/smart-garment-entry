import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, IndianRupee, Landmark, ShoppingBag, Truck } from "lucide-react";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { fetchOrgSettingsRow, orgSettingsQueryKey } from "@/hooks/useSettings";
import { nextReminder, reminderText, resolveGstFilings, todayIst } from "@/utils/gstFiling";
import { resolveGstFilingPrefs } from "@/utils/gstReadiness";
import {
  fetchLowStockAlerts,
  fetchSlowMovingStock,
  lowStockAlertsQueryKey,
  slowMovingStockQueryKey,
} from "@/hooks/useBusinessInsights";
import {
  ALERT_POPUP_KINDS,
  SUPPLIER_DUE_AFTER_DAYS,
  formatInrShort,
  type AlertPopupKind,
  type TodaySoldLine,
} from "@/lib/alertPopups";
import {
  ACTIVITY_CENTER_PAYMENTS_KEY,
  DEFAULT_ACTIVITY_LOW_STOCK_THRESHOLD,
  fetchActivityPaymentSummary,
} from "@/utils/activityCenterData";
import {
  ALERT_POPUP_SUPPLIER_DUES_KEY,
  ALERT_POPUP_TODAY_SOLD_KEY,
  fetchSupplierDueSummary,
  fetchTodaySoldWithStock,
} from "@/utils/alertPopupData";
import {
  DASHBOARD_SLOW_MOVING_IDLE_DAYS,
  INSIGHTS_DEAD_SLOW_MOVING_STATE,
} from "@/utils/dashboardStockHealth";

/**
 * Shop alerts (GST due, low stock, dues, dead stock, today's sales): built here for
 * both the optional pop-up card and the list on the Notifications page.
 */

/** Reuse cached data from the bell / dashboards when it is this fresh. */
const REUSE_FRESH_MS = 5 * 60 * 1000;

export interface AlertPopup {
  kind: AlertPopupKind;
  title: string;
  body: string;
  lines?: TodaySoldLine[];
  path?: string;
  navState?: Record<string, unknown>;
}

export const KIND_STYLE: Record<
  AlertPopupKind,
  { icon: typeof AlertTriangle; label: string; header: string; accent: string; button: string }
> = {
  gst_due: {
    icon: Landmark,
    label: "GST return",
    header: "from-indigo-500 via-blue-600 to-blue-700",
    accent: "bg-blue-600",
    button: "from-indigo-500 to-blue-700 hover:from-indigo-600 hover:to-blue-800",
  },
  low_stock: {
    icon: AlertTriangle,
    label: "Stock alert",
    header: "from-amber-500 via-orange-500 to-orange-600",
    accent: "bg-orange-500",
    button: "from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700",
  },
  customer_dues: {
    icon: IndianRupee,
    label: "Payments",
    header: "from-rose-500 via-red-500 to-red-600",
    accent: "bg-red-500",
    button: "from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700",
  },
  supplier_dues: {
    icon: Truck,
    label: "Suppliers",
    header: "from-blue-600 via-indigo-600 to-violet-600",
    accent: "bg-indigo-500",
    button: "from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700",
  },
  dead_stock: {
    icon: Archive,
    label: "Stock health",
    header: "from-slate-600 via-slate-700 to-slate-800",
    accent: "bg-slate-500",
    button: "from-slate-600 to-slate-800 hover:from-slate-700 hover:to-slate-900",
  },
  today_sold: {
    icon: ShoppingBag,
    label: "Today's sales",
    header: "from-emerald-500 via-teal-500 to-cyan-600",
    accent: "bg-emerald-500",
    button: "from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700",
  },
};

export function stockPill(stock: number | null): string {
  if (stock === null) return "bg-slate-100 text-slate-500";
  if (stock <= 0) return "bg-red-100 text-red-700";
  if (stock <= DEFAULT_ACTIVITY_LOW_STOCK_THRESHOLD) return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-700";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export async function buildAlert(
  kind: AlertPopupKind,
  orgId: string,
  queryClient: QueryClient,
  canOpenItemWiseSales: boolean,
): Promise<AlertPopup | null> {
  switch (kind) {
    case "gst_due": {
      // Only once the shop has chosen its filing scheme (GST Readiness); see nextReminder.
      const settings = (await queryClient.fetchQuery({
        queryKey: orgSettingsQueryKey(orgId),
        queryFn: () => fetchOrgSettingsRow(orgId),
        staleTime: REUSE_FRESH_MS,
      })) as { gst_number?: string | null; report_settings?: unknown } | null;
      const rem = nextReminder({
        scheme: resolveGstFilingPrefs(settings).scheme,
        shopStateCode: String(settings?.gst_number || "").trim().slice(0, 2),
        filings: resolveGstFilings(settings),
        todayYmd: todayIst(),
      });
      if (!rem) return null;
      const text = reminderText(rem);
      return { kind, title: text.title, body: text.body, path: "/gst-filing" };
    }
    case "low_stock": {
      const rows = await queryClient.fetchQuery({
        queryKey: lowStockAlertsQueryKey(orgId, DEFAULT_ACTIVITY_LOW_STOCK_THRESHOLD),
        queryFn: () => fetchLowStockAlerts(orgId, DEFAULT_ACTIVITY_LOW_STOCK_THRESHOLD),
        staleTime: REUSE_FRESH_MS,
      });
      if (rows.length === 0) return null;
      const names = rows.slice(0, 3).map((r) => r.product_name);
      const more = rows.length - names.length;
      return {
        kind,
        title: `${plural(rows.length, "item")} running low`,
        body: more > 0 ? `${names.join(", ")} +${more} more` : names.join(", "),
        path: "/stock-report",
        navState: { stockStatusFilter: "low" },
      };
    }
    case "customer_dues": {
      const p = await queryClient.fetchQuery({
        queryKey: [ACTIVITY_CENTER_PAYMENTS_KEY, orgId],
        queryFn: () => fetchActivityPaymentSummary(orgId),
        staleTime: REUSE_FRESH_MS,
      });
      if (p.pendingAmount <= 0.5) return null;
      const overdue =
        p.overdueCount > 0
          ? `, ${formatInrShort(p.overdueAmount)} overdue 30+ days`
          : "";
      return {
        kind,
        title: "Customer payments due",
        body: `${formatInrShort(p.pendingAmount)} pending on ${plural(p.invoiceCount, "invoice")}${overdue}`,
        path: "/sales-invoice-dashboard",
        navState: { paymentStatusFilter: ["pending", "partial"] },
      };
    }
    case "supplier_dues": {
      const s = await queryClient.fetchQuery({
        queryKey: [ALERT_POPUP_SUPPLIER_DUES_KEY, orgId],
        queryFn: () => fetchSupplierDueSummary(orgId),
        staleTime: REUSE_FRESH_MS,
      });
      if (s.billCount === 0) return null;
      return {
        kind,
        title: "Supplier payments due",
        body: `${formatInrShort(s.dueAmount)} unpaid on ${plural(s.billCount, "bill")} older than ${SUPPLIER_DUE_AFTER_DAYS} days (${plural(s.supplierCount, "supplier")})`,
        path: "/purchase-bills",
      };
    }
    case "dead_stock": {
      const rows = await queryClient.fetchQuery({
        queryKey: slowMovingStockQueryKey(orgId, DASHBOARD_SLOW_MOVING_IDLE_DAYS),
        queryFn: () => fetchSlowMovingStock(orgId, DASHBOARD_SLOW_MOVING_IDLE_DAYS),
        staleTime: REUSE_FRESH_MS,
      });
      if (rows.length === 0) return null;
      const value = rows.reduce((sum, r) => sum + Number(r.stock_value || 0), 0);
      return {
        kind,
        title: "Dead stock",
        body: `${plural(rows.length, "item")} not sold in ${DASHBOARD_SLOW_MOVING_IDLE_DAYS}+ days, worth ${formatInrShort(value)} at purchase price`,
        path: "/insights",
        navState: { ...INSIGHTS_DEAD_SLOW_MOVING_STATE },
      };
    }
    case "today_sold": {
      const t = await queryClient.fetchQuery({
        queryKey: [ALERT_POPUP_TODAY_SOLD_KEY, orgId],
        queryFn: () => fetchTodaySoldWithStock(orgId),
        staleTime: 60_000,
      });
      if (t.lines.length === 0) return null;
      return {
        kind,
        title: `Today: ${plural(t.totalQty, "item")} sold in ${plural(t.billCount, "bill")}`,
        body: "Top sellers and stock left",
        lines: t.lines,
        path: canOpenItemWiseSales ? "/item-wise-sales" : undefined,
      };
    }
    default:
      return null;
  }
}

/** Which alerts this user may see, from their menu rights. */
export function useShopAlertAccess() {
  const { hasMenuAccess, loading } = useUserPermissions();
  const allowed: Record<AlertPopupKind, boolean> = {
    gst_due: hasMenuAccess("gst_reports"),
    low_stock: hasMenuAccess("stock_report") || hasMenuAccess("product_dashboard"),
    customer_dues: hasMenuAccess("sales_invoice_dashboard") || hasMenuAccess("payments_dashboard"),
    supplier_dues: hasMenuAccess("purchase_dashboard") || hasMenuAccess("supplier_party_balances"),
    dead_stock: hasMenuAccess("business_insights"),
    today_sold:
      hasMenuAccess("pos_dashboard") ||
      hasMenuAccess("sales_invoice_dashboard") ||
      hasMenuAccess("item_wise_sales"),
  };
  return { allowed, canItemWiseSales: hasMenuAccess("item_wise_sales"), loading };
}

/** Every current shop alert for the Notifications page (one kind at a time, cached 5 min). */
export function useShopAlerts(orgId: string | undefined) {
  const queryClient = useQueryClient();
  const { allowed, canItemWiseSales, loading } = useShopAlertAccess();
  const kinds = ALERT_POPUP_KINDS.filter((k) => allowed[k]);
  return useQuery({
    queryKey: ["shop-alerts-list", orgId, kinds.join(","), canItemWiseSales],
    enabled: !!orgId && !loading,
    staleTime: REUSE_FRESH_MS,
    queryFn: async () => {
      const out: AlertPopup[] = [];
      for (const kind of kinds) {
        try {
          const alert = await buildAlert(kind, orgId as string, queryClient, canItemWiseSales);
          if (alert) out.push(alert);
        } catch {
          /* one failing alert should not hide the others */
        }
      }
      return out;
    },
  });
}
