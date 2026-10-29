import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, ArrowRight, BellOff, IndianRupee, Landmark, ShoppingBag, Truck, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useWindowTabs } from "@/contexts/WindowTabsContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
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
import { TodaySalesWindow } from "./TodaySalesWindow";

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

const KIND_STYLE: Record<
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

function stockPill(stock: number | null): string {
  if (stock === null) return "bg-slate-100 text-slate-500";
  if (stock <= 0) return "bg-red-100 text-red-700";
  if (stock <= DEFAULT_ACTIVITY_LOW_STOCK_THRESHOLD) return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-700";
}

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

  const [salesWindowOpen, setSalesWindowOpen] = useState(false);

  const goTo = useCallback(
    (path: string, extraState?: Record<string, unknown>) => {
      const navState = { ...(extraState ?? {}), activityNavTs: Date.now() };
      if (orgId) queueActivityNavigation(orgId, path, navState);
      const tabPath = normalizeActivityPath(path);
      if (tabPath) openWindow(tabPath);
      orgNavigate(path, { state: navState });
    },
    [orgId, openWindow, orgNavigate],
  );

  const open = useCallback(() => {
    if (!current) return;
    if (current.kind === "today_sold") {
      setSalesWindowOpen(true);
      dismiss();
      return;
    }
    if (!current.path) return;
    goTo(current.path, current.navState);
    dismiss();
  }, [current, goTo, dismiss]);

  const openItemWiseSales = useCallback(() => {
    setSalesWindowOpen(false);
    goTo("/item-wise-sales");
  }, [goTo]);

  const turnOff = useCallback(() => {
    if (!current || !orgId || !userId) return;
    const prefs = loadAlertPopupPrefs(orgId, userId);
    setPaused(false);
    // The prefs-change listener above removes it (and any queued copy) from the queue.
    saveAlertPopupPrefs(orgId, userId, { ...prefs, [current.kind]: false });
  }, [current, orgId, userId]);

  const style = useMemo(() => (current ? KIND_STYLE[current.kind] : null), [current]);

  const salesWindow = (
    <TodaySalesWindow
      open={salesWindowOpen}
      onOpenChange={setSalesWindowOpen}
      orgId={orgId}
      onOpenItemWiseSales={hasMenuAccess("item_wise_sales") ? openItemWiseSales : undefined}
    />
  );

  if (!current || !style) return salesWindow;
  const Icon = style.icon;
  const canOpen = current.kind === "today_sold" || !!current.path;
  const maxLineQty = Math.max(1, ...(current.lines ?? []).map((l) => l.qty));

  return (
    <>
      {salesWindow}
      <div
        role="status"
        aria-live="polite"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        className={cn(
          "fixed z-[80] inset-x-2 top-[calc(env(safe-area-inset-top)+0.5rem)]",
          "sm:inset-x-auto sm:top-auto sm:right-24 sm:bottom-12 sm:w-[360px]",
          "overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-black/5",
          "animate-in fade-in slide-in-from-bottom-3 duration-300",
        )}
      >
        {/* Coloured header */}
        <div className={cn("relative bg-gradient-to-r px-3.5 py-3 text-white", style.header)}>
          <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/10" />
          <div className="relative flex items-start gap-2.5 pr-7">
            <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0 shadow-inner">
              <Icon className="h-[18px] w-[18px]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/80">{style.label}</p>
              <p className="text-[14px] font-bold leading-snug">{current.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close alert"
            className="absolute top-2.5 right-2.5 h-7 w-7 rounded-lg flex items-center justify-center text-white/90 bg-white/15 hover:bg-white/30"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {/* Auto-close countdown; restarts with the timer after a hover. */}
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/20">
            {!paused && (
              <div key={current.kind} className="h-full origin-left bg-white/80 animate-alert-countdown" />
            )}
          </div>
        </div>

        <div className="px-3.5 pt-2.5 pb-3">
          <p className="text-[12px] text-muted-foreground line-clamp-2">{current.body}</p>
          {current.lines && current.lines.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {current.lines.map((line, i) => (
                <li key={line.variantId} className="flex items-center gap-2 text-[12px]">
                  <span
                    className={cn(
                      "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                      i === 0 ? "bg-amber-400 text-white" : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{line.name}</div>
                    <div className="mt-0.5 h-1 rounded-full bg-emerald-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                        style={{ width: `${(line.qty / maxLineQty) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 tabular-nums">
                    sold {line.qty}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                      stockPill(line.stock),
                    )}
                  >
                    {line.stock === null ? "—" : `${Math.max(0, line.stock)} left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2 mt-3">
            {canOpen && (
              <button
                type="button"
                onClick={open}
                className={cn(
                  "inline-flex items-center gap-1 h-8 px-3.5 rounded-lg text-[12px] font-bold text-white shadow-sm bg-gradient-to-r",
                  style.button,
                )}
              >
                {current.kind === "today_sold" ? "Open details" : "Open"}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={turnOff}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <BellOff className="h-3.5 w-3.5" />
              Don&apos;t show this
            </button>
            {queue.length > 1 && (
              <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                <span className={cn("h-1.5 w-1.5 rounded-full", style.accent)} />+{queue.length - 1} more
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
