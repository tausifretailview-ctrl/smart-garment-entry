import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, IndianRupee, ShoppingBag, Truck, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useWindowTabs } from "@/contexts/WindowTabsContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import {
  fetchLowStockAlerts,
  fetchSlowMovingStock,
  lowStockAlertsQueryKey,
  slowMovingStockQueryKey,
} from "@/hooks/useBusinessInsights";
import { cn } from "@/lib/utils";
import { isViewportFixedEntryPath } from "@/lib/entryPageLayout";
import { normalizeActivityPath, queueActivityNavigation } from "@/lib/activityCenterNavigation";
import {
  ALERT_POPUP_KINDS,
  SUPPLIER_DUE_AFTER_DAYS,
  formatInrShort,
  isAlertPopupDue,
  loadAlertPopupLog,
  loadAlertPopupPrefs,
  onAlertPopupPrefsChange,
  recordAlertPopupShown,
  saveAlertPopupPrefs,
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

/** Wait after login before the first check so it never competes with the first screen. */
const FIRST_CHECK_DELAY_MS = 20_000;
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const SHOW_FOR_MS = 10_000;
/** Reuse cached data from the bell / dashboards when it is this fresh. */
const REUSE_FRESH_MS = 5 * 60 * 1000;

interface AlertPopup {
  kind: AlertPopupKind;
  title: string;
  body: string;
  lines?: TodaySoldLine[];
  path?: string;
  navState?: Record<string, unknown>;
}

const KIND_ICON: Record<AlertPopupKind, { icon: typeof AlertTriangle; tone: string }> = {
  low_stock: { icon: AlertTriangle, tone: "bg-amber-50 text-amber-600" },
  customer_dues: { icon: IndianRupee, tone: "bg-red-50 text-red-600" },
  supplier_dues: { icon: Truck, tone: "bg-blue-50 text-blue-600" },
  dead_stock: { icon: Archive, tone: "bg-slate-100 text-slate-600" },
  today_sold: { icon: ShoppingBag, tone: "bg-emerald-50 text-emerald-600" },
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

async function buildAlert(
  kind: AlertPopupKind,
  orgId: string,
  queryClient: QueryClient,
  canOpenItemWiseSales: boolean,
): Promise<AlertPopup | null> {
  switch (kind) {
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

/**
 * Small one-at-a-time alert card (bottom right on desktop, top on phones).
 * Checks a little after login and every 30 minutes; each kind shows at most
 * once a day (today's sales every few hours). Never shows on POS / bill entry.
 */
export function AlertPopupHost() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const { hasMenuAccess, loading: permLoading } = useUserPermissions();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { openWindow } = useWindowTabs();
  const { orgNavigate } = useOrgNavigation();

  const orgId = currentOrganization?.id;
  const userId = user?.id;

  const allowed: Record<AlertPopupKind, boolean> = {
    low_stock: hasMenuAccess("stock_report") || hasMenuAccess("product_dashboard"),
    customer_dues: hasMenuAccess("sales_invoice_dashboard") || hasMenuAccess("payments_dashboard"),
    supplier_dues: hasMenuAccess("purchase_dashboard") || hasMenuAccess("supplier_party_balances"),
    dead_stock: hasMenuAccess("business_insights"),
    today_sold:
      hasMenuAccess("pos_dashboard") ||
      hasMenuAccess("sales_invoice_dashboard") ||
      hasMenuAccess("item_wise_sales"),
  };
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;
  const canItemWiseRef = useRef(false);
  canItemWiseRef.current = hasMenuAccess("item_wise_sales");

  const [queue, setQueue] = useState<AlertPopup[]>([]);
  const queuedKinds = useRef<Set<AlertPopupKind>>(new Set());
  const [paused, setPaused] = useState(false);

  // New org / user: drop anything queued for the previous one.
  useEffect(() => {
    setQueue([]);
    queuedKinds.current = new Set();
  }, [orgId, userId]);

  // A switch turned off in the bell panel also drops that kind from the queue.
  useEffect(() => {
    if (!orgId || !userId) return;
    return onAlertPopupPrefsChange(() => {
      const prefs = loadAlertPopupPrefs(orgId, userId);
      setQueue((q) => {
        const kept = q.filter((p) => prefs[p.kind]);
        for (const p of q) if (!prefs[p.kind]) queuedKinds.current.delete(p.kind);
        return kept.length === q.length ? q : kept;
      });
    });
  }, [orgId, userId]);

  useEffect(() => {
    if (!orgId || !userId || permLoading) return;
    let cancelled = false;
    let running = false;

    const check = async () => {
      if (running || cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      running = true;
      try {
        const now = Date.now();
        const prefs = loadAlertPopupPrefs(orgId, userId);
        const log = loadAlertPopupLog(orgId, userId);
        // One kind at a time, so a check never fires a burst of requests.
        for (const kind of ALERT_POPUP_KINDS) {
          if (cancelled) return;
          if (!allowedRef.current[kind] || !prefs[kind]) continue;
          if (queuedKinds.current.has(kind) || !isAlertPopupDue(kind, log, now)) continue;
          let popup: AlertPopup | null;
          try {
            popup = await buildAlert(kind, orgId, queryClient, canItemWiseRef.current);
          } catch {
            continue; // try again on the next check
          }
          if (cancelled) return;
          if (popup) {
            queuedKinds.current.add(kind);
            const next = popup;
            setQueue((q) => [...q, next]);
          } else if (kind !== "today_sold") {
            // Nothing to report today; don't query again until tomorrow.
            recordAlertPopupShown(orgId, userId, kind, now);
          }
        }
      } finally {
        running = false;
      }
    };

    const first = window.setTimeout(() => void check(), FIRST_CHECK_DELAY_MS);
    const interval = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [orgId, userId, permLoading, queryClient]);

  const blocked = isViewportFixedEntryPath(location.pathname);
  const current = !blocked ? queue[0] : undefined;

  const dismiss = useCallback(() => {
    setPaused(false);
    setQueue((q) => {
      const [head, ...rest] = q;
      if (head) queuedKinds.current.delete(head.kind);
      return rest;
    });
  }, []);

  // Count it as shown once it is actually on screen.
  useEffect(() => {
    if (!current || !orgId || !userId) return;
    recordAlertPopupShown(orgId, userId, current.kind);
  }, [current, orgId, userId]);

  useEffect(() => {
    if (!current || paused) return;
    const timer = window.setTimeout(dismiss, SHOW_FOR_MS);
    return () => window.clearTimeout(timer);
  }, [current, paused, dismiss]);

  const open = useCallback(() => {
    if (!current?.path) return;
    const navState = { ...(current.navState ?? {}), activityNavTs: Date.now() };
    if (orgId) queueActivityNavigation(orgId, current.path, navState);
    const tabPath = normalizeActivityPath(current.path);
    if (tabPath) openWindow(tabPath);
    orgNavigate(current.path, { state: navState });
    dismiss();
  }, [current, orgId, openWindow, orgNavigate, dismiss]);

  const turnOff = useCallback(() => {
    if (!current || !orgId || !userId) return;
    const prefs = loadAlertPopupPrefs(orgId, userId);
    setPaused(false);
    // The prefs-change listener above removes it (and any queued copy) from the queue.
    saveAlertPopupPrefs(orgId, userId, { ...prefs, [current.kind]: false });
  }, [current, orgId, userId]);

  const iconMeta = useMemo(() => (current ? KIND_ICON[current.kind] : null), [current]);

  if (!current || !iconMeta) return null;
  const Icon = iconMeta.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      className={cn(
        "fixed z-[80] inset-x-2 top-[calc(env(safe-area-inset-top)+0.5rem)]",
        "sm:inset-x-auto sm:top-auto sm:right-24 sm:bottom-12 sm:w-[340px]",
        "rounded-xl border border-border bg-popover text-popover-foreground shadow-lg",
        "p-3 animate-in fade-in slide-in-from-bottom-2 duration-200",
      )}
    >
      <div className="flex gap-2.5">
        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", iconMeta.tone)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold leading-snug pr-5">{current.title}</p>
          <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-2">{current.body}</p>
          {current.lines && current.lines.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {current.lines.map((line) => (
                <li key={line.variantId} className="flex items-baseline gap-2 text-[12px]">
                  <span className="flex-1 min-w-0 truncate">{line.name}</span>
                  <span className="text-muted-foreground shrink-0">sold {line.qty}</span>
                  <span
                    className={cn(
                      "shrink-0 font-semibold tabular-nums",
                      line.stock !== null && line.stock <= 0 ? "text-red-600" : "text-foreground",
                    )}
                  >
                    {line.stock === null ? "—" : `${line.stock} left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-3 mt-2">
            {current.path && (
              <button
                type="button"
                onClick={open}
                className="text-[12px] font-bold text-primary hover:underline"
              >
                Open →
              </button>
            )}
            <button
              type="button"
              onClick={turnOff}
              className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
            >
              Don&apos;t show this
            </button>
            {queue.length > 1 && (
              <span className="ml-auto text-[10px] text-muted-foreground">+{queue.length - 1} more</span>
            )}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close alert"
        className="absolute top-2 right-2 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
