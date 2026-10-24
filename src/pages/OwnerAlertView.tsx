import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, FileText, Receipt, Undo2, Users, X } from "lucide-react";
import { MobileInvoiceDetail } from "@/components/mobile/MobileInvoiceDetail";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { ownerAlertsDb } from "@/lib/ownerPush";
import { salesmanTotals, type SalesmanTotal } from "../../supabase/functions/_shared/ownerAlertSchedule";

/**
 * Screens opened by tapping an owner alert on the phone: just the bill, or a colour
 * report for the day, without the app's menus. Close goes to the app home, or back
 * to Notifications when the alert was opened from there.
 */

function useCloseAlertScreen(): () => void {
  const { orgNavigate } = useOrgNavigation();
  const location = useLocation();
  const fromNotifications = !!(location.state as { fromNotifications?: boolean } | null)?.fromNotifications;
  return () => orgNavigate(fromNotifications ? "/notifications" : "/");
}

/** Bill alert → that bill's details with Print / PDF, WhatsApp and Edit. */
export function OwnerAlertBill() {
  const { saleId } = useParams<{ saleId: string }>();
  const close = useCloseAlertScreen();
  return (
    <div className="min-h-[100dvh] bg-muted/30">
      <MobileInvoiceDetail
        saleId={saleId ?? null}
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      />
    </div>
  );
}

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

function istToday(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** IST day as UTC bounds; today ends now. */
function istDayRange(date: string): { from: string; to: string } {
  const start = Date.parse(`${date}T00:00:00Z`) - IST_OFFSET_MS;
  return {
    from: new Date(start).toISOString(),
    to: new Date(Math.min(Date.now(), start + DAY_MS - 1)).toISOString(),
  };
}

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

interface DayReport {
  totalBills: number;
  totalAmount: number;
  totalCash: number;
  totalUpi: number;
  totalCard: number;
  totalBalance: number;
  refundAmount: number;
  totalSaleReturnAdjust: number;
  salesmen: SalesmanTotal[];
}

async function fetchDayReport(orgId: string, date: string): Promise<DayReport> {
  const { from, to } = istDayRange(date);
  const [stats, bills] = await Promise.all([
    ownerAlertsDb.rpc("get_pos_dashboard_stats", {
      p_organization_id: orgId,
      p_date_from: from,
      p_date_to: to,
      p_filters: {},
    }),
    ownerAlertsDb
      .from("sales")
      .select("salesman, net_amount")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .eq("is_cancelled", false)
      .neq("payment_status", "hold")
      .gte("sale_date", from)
      .lte("sale_date", to)
      .limit(5000),
  ]);
  if (stats.error) throw stats.error;
  const t = (stats.data ?? {}) as Record<string, number>;
  const n = (k: string) => Number(t[k]) || 0;
  return {
    totalBills: n("totalBills"),
    totalAmount: n("totalAmount"),
    totalCash: n("totalCash"),
    totalUpi: n("totalUpi"),
    totalCard: n("totalCard"),
    totalBalance: n("totalBalance"),
    refundAmount: n("refundAmount"),
    totalSaleReturnAdjust: n("totalSaleReturnAdjust"),
    salesmen: bills.error ? [] : salesmanTotals((bills.data ?? []) as Array<{ salesman: string | null; net_amount: number }>),
  };
}

/** Cashier / day-end alert → colour summary of that day. */
export function OwnerAlertReport() {
  const [params, setParams] = useSearchParams();
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const location = useLocation();
  const close = useCloseAlertScreen();
  const orgId = currentOrganization?.id;
  const today = istToday();
  const raw = params.get("date") ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= today ? raw : today;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["owner-alert-report", orgId, date],
    queryFn: () => fetchDayReport(orgId!, date),
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const goTo = (d: string) => setParams(d === today ? {} : { date: d }, { replace: true, state: location.state });
  const label = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  const modes = data
    ? [
        { label: "Cash", value: data.totalCash, bg: "bg-emerald-500" },
        { label: "UPI", value: data.totalUpi, bg: "bg-violet-500" },
        { label: "Card", value: data.totalCard, bg: "bg-sky-500" },
        { label: "Due", value: Math.max(0, data.totalBalance), bg: "bg-rose-500" },
      ]
    : [];
  const tiles: Array<number | (typeof modes)[number]> = isLoading ? [0, 1, 2, 3] : modes;
  const modeSum = modes.reduce((s, m) => s + m.value, 0);
  const topSalesman = data?.salesmen[0]?.amount || 0;

  return (
    <div className="h-[100dvh] overflow-y-auto overscroll-contain bg-muted/30 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6 rounded-b-3xl shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium opacity-80">{currentOrganization?.name ?? ""}</p>
            <h1 className="text-lg font-bold">{date === today ? "Today's business report" : "Business report"}</h1>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center active:scale-90 touch-manipulation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <button
            type="button"
            aria-label="Previous day"
            onClick={() => goTo(shiftDate(date, -1))}
            className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center active:scale-90 touch-manipulation"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="flex-1 text-center text-sm font-semibold">{label}</p>
          <button
            type="button"
            aria-label="Next day"
            disabled={date >= today}
            onClick={() => goTo(shiftDate(date, 1))}
            className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center active:scale-90 touch-manipulation disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 text-center">
          <p className="text-xs opacity-80">Total sales</p>
          {isLoading ? (
            <Skeleton className="h-9 w-40 mx-auto mt-1 bg-white/30" />
          ) : (
            <p className="text-4xl font-extrabold tabular-nums">{inr(data?.totalAmount ?? 0)}</p>
          )}
          <p className="text-xs mt-1 opacity-90">
            {data ? `${data.totalBills} bill${data.totalBills === 1 ? "" : "s"}` : " "}
          </p>
        </div>
      </div>

      <div className="px-4 -mt-3 space-y-3">
        {isError && (
          <button
            type="button"
            onClick={() => void refetch()}
            className="w-full rounded-2xl bg-card border p-4 text-sm text-destructive"
          >
            Could not load the report. Tap to try again.
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          {tiles.map((m, i) =>
            typeof m === "number" ? (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ) : (
              <div key={m.label} className={`${m.bg} rounded-2xl p-3 text-white shadow-sm`}>
                <p className="text-[11px] font-medium opacity-90">{m.label}</p>
                <p className="text-xl font-bold tabular-nums mt-0.5">{inr(m.value)}</p>
              </div>
            ),
          )}
        </div>

        {data && modeSum > 0 && (
          <div className="rounded-2xl bg-card border p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Payment mix</p>
            <div className="flex h-3 rounded-full overflow-hidden bg-muted">
              {modes.map((m) =>
                m.value > 0 ? (
                  <div key={m.label} className={m.bg} style={{ width: `${(m.value / modeSum) * 100}%` }} />
                ) : null,
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {modes.map((m) => (
                <span key={m.label} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className={`w-2 h-2 rounded-full ${m.bg}`} />
                  {m.label} {Math.round((m.value / modeSum) * 100)}%
                </span>
              ))}
            </div>
          </div>
        )}

        {data && (data.totalSaleReturnAdjust > 0.5 || data.refundAmount > 0.5) && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3 flex items-center gap-3">
            <Undo2 className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="text-sm">
              {data.totalSaleReturnAdjust > 0.5 && <p>Returns adjusted {inr(data.totalSaleReturnAdjust)}</p>}
              {data.refundAmount > 0.5 && <p>Refunds paid {inr(data.refundAmount)}</p>}
            </div>
          </div>
        )}

        {data && data.salesmen.length > 0 && (
          <div className="rounded-2xl bg-card border p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Salesman sales
            </p>
            <div className="space-y-2.5">
              {data.salesmen.map((s) => (
                <div key={s.name}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium truncate pr-2">{s.name}</span>
                    <span className="tabular-nums font-semibold">{inr(s.amount)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500"
                        style={{ width: `${topSalesman > 0 ? Math.max(4, (s.amount / topSalesman) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-12 text-right">
                      {s.bills} bill{s.bills === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => orgNavigate("/daily-cashier-report")}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-card border py-3 text-sm font-medium active:scale-95 touch-manipulation"
          >
            <FileText className="h-4 w-4 text-violet-600" />
            Full report
          </button>
          <button
            type="button"
            onClick={() => orgNavigate("/pos-dashboard")}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-card border py-3 text-sm font-medium active:scale-95 touch-manipulation"
          >
            <Receipt className="h-4 w-4 text-emerald-600" />
            See bills
          </button>
        </div>
      </div>
    </div>
  );
}
