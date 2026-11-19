import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  CalendarClock,
  CreditCard,
  History,
  IndianRupee,
  Loader2,
  Package,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Tag,
  Wallet,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ANALYSIS_PERIODS,
  analyzeCustomer,
  type AnalysisPeriod,
  type ShareRow,
} from "@/lib/customerAnalysis";
import { fetchCustomerAnalysisData } from "@/lib/data/customerAnalysisData";
import { customerBalanceBreakdown, formatAccountInr } from "@/utils/customerAccountStateView";

export interface CustomerAnalysisBalance {
  grossOutstanding: number;
  unusedAdvance: number;
  pendingCn: number;
  netPosition: number;
  isLoading?: boolean;
}

export interface CustomerAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  customerId: string | null;
  customerName: string;
  customerPhone?: string | null;
  /** The ledger balance the screen already shows (not recomputed here). */
  balance?: CustomerAnalysisBalance | null;
  /** Opens the full transaction history. */
  onOpenHistory?: () => void;
}

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const qtyFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const dateFmt = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return format(new Date(y, (m || 1) - 1, day || 1), "dd MMM yyyy");
};

function Kpi({
  icon,
  label,
  value,
  sub,
  tone = "slate",
  testId,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "slate" | "blue" | "violet" | "emerald" | "amber" | "rose";
  testId?: string;
}) {
  const tones: Record<string, string> = {
    slate: "from-slate-50 to-white text-slate-600 ring-slate-200",
    blue: "from-blue-50 to-white text-blue-600 ring-blue-100",
    violet: "from-violet-50 to-white text-violet-600 ring-violet-100",
    emerald: "from-emerald-50 to-white text-emerald-600 ring-emerald-100",
    amber: "from-amber-50 to-white text-amber-600 ring-amber-100",
    rose: "from-rose-50 to-white text-rose-600 ring-rose-100",
  };
  return (
    <div className={cn("rounded-xl bg-gradient-to-b p-3 ring-1 shadow-sm", tones[tone])} data-testid={testId}>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-xl font-extrabold tabular-nums text-slate-900 truncate">{value}</div>
      {sub ? <div className="text-[11px] text-slate-500 truncate">{sub}</div> : null}
    </div>
  );
}

function Card({ title, icon, children, className, right }: { title: string; icon: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={cn("rounded-xl border bg-white p-3 shadow-sm min-w-0", className)}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-slate-500">{icon}</span>
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </section>
  );
}

function ShareBars({ rows, color, empty = "No data", showAmount = true }: { rows: ShareRow[]; color: string; empty?: string; showAmount?: boolean }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground py-2">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.sharePct), 1);
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.name} className="text-xs">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-slate-700 truncate">{r.name}</span>
            <span className="ml-auto tabular-nums text-slate-500 whitespace-nowrap">
              {qtyFmt(r.qty)} pcs{showAmount ? ` · ${inr(r.amount)}` : ""} · <b className="text-slate-700">{r.sharePct}%</b>
            </span>
          </div>
          <div className="mt-0.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className={cn("h-full rounded-full", color)} style={{ width: `${(r.sharePct / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Chips({ rows, tone }: { rows: ShareRow[]; tone: string }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">No data</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map((r, i) => (
        <span
          key={r.name}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1",
            i === 0 ? tone : "bg-slate-50 text-slate-600 ring-slate-200",
          )}
          title={`${qtyFmt(r.qty)} pieces · ${inr(r.amount)}`}
        >
          {r.name}
          <span className="tabular-nums opacity-70">{r.sharePct}%</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Customer analysis from the Sale Bill: what the customer buys, at what price, how they pay
 * and how often they come, for a chosen period. Read-only.
 */
export function CustomerAnalysisDialog({
  open,
  onOpenChange,
  organizationId,
  customerId,
  customerName,
  customerPhone,
  balance,
  onOpenHistory,
}: CustomerAnalysisDialogProps) {
  const [period, setPeriod] = useState<AnalysisPeriod>("all");
  const [productSort, setProductSort] = useState<"amount" | "qty">("amount");

  const query = useQuery({
    queryKey: ["customer-analysis", organizationId, customerId],
    queryFn: () => fetchCustomerAnalysisData(organizationId, customerId as string),
    enabled: open && !!organizationId && !!customerId,
    staleTime: 60_000,
  });

  const analysis = useMemo(
    () =>
      query.data
        ? analyzeCustomer({ ...query.data, now: new Date(), period, topLimit: 50 })
        : null,
    [query.data, period],
  );

  const topProducts = useMemo(() => {
    if (!analysis) return [];
    const rows = [...analysis.topProducts];
    if (productSort === "qty") rows.sort((a, b) => b.qty - a.qty || b.amount - a.amount);
    return rows.slice(0, 15);
  }, [analysis, productSort]);

  const b = balance
    ? customerBalanceBreakdown({
        outstanding: balance.grossOutstanding,
        unusedAdvance: balance.unusedAdvance,
        unclaimedSaleReturn: balance.pendingCn,
        netPosition: balance.netPosition,
      })
    : null;

  const s = analysis?.summary;
  const hasData = !!s && s.bills > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl w-[96vw] h-[92vh] max-h-[92vh] p-0 gap-0 overflow-hidden flex flex-col bg-slate-50"
        data-testid="customer-analysis-dialog"
      >
        <div className="shrink-0 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 px-5 py-4 text-white">
          <DialogHeader className="space-y-0 flex-row items-center gap-3 pr-8">
            <div className="h-11 w-11 shrink-0 rounded-xl bg-white/15 ring-1 ring-white/25 flex items-center justify-center">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-xl font-extrabold tracking-tight truncate">{customerName || "Customer"}</DialogTitle>
              <DialogDescription className="text-white/80 text-xs truncate">
                Purchase analysis{customerPhone ? ` · ${customerPhone}` : ""}
                {s?.firstDate ? ` · customer since ${dateFmt(s.firstDate)}` : ""}
              </DialogDescription>
            </div>
            <Select value={period} onValueChange={(v) => setPeriod(v as AnalysisPeriod)}>
              <SelectTrigger
                className="h-9 w-[150px] bg-white/15 border-white/30 text-white text-xs font-semibold"
                aria-label="Analysis period"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANALYSIS_PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value} className="text-xs">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {onOpenHistory && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-9 gap-1.5 bg-white text-indigo-700 hover:bg-white/90"
                onClick={onOpenHistory}
              >
                <History className="h-4 w-4" />
                All transactions
              </Button>
            )}
          </DialogHeader>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {query.isLoading || (query.isFetching && !query.data) ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Reading this customer's bills…
            </div>
          ) : query.isError ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              Could not load the customer's bills.
              <Button size="sm" variant="outline" onClick={() => void query.refetch()} className="gap-1.5">
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
            </div>
          ) : !hasData || !analysis || !s ? (
            <div className="flex h-64 flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground" data-testid="customer-analysis-empty">
              <ShoppingBag className="h-8 w-8 text-slate-300" />
              No bills for this customer {period === "all" ? "yet" : "in this period"}.
            </div>
          ) : (
            <>
              {analysis.insights.length > 0 && (
                <div className="rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-blue-50 p-3" data-testid="customer-analysis-insights">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-violet-700">
                    <Sparkles className="h-4 w-4" />
                    Insights
                  </div>
                  <ul className="grid gap-1 sm:grid-cols-2 text-[13px] text-slate-700">
                    {analysis.insights.map((t) => (
                      <li key={t} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-testid="customer-analysis-kpis">
                <Kpi icon={<IndianRupee className="h-3.5 w-3.5" />} label="Total spent" value={inr(s.totalSpent)} sub={`Biggest bill ${inr(s.biggestBill)}`} tone="violet" testId="kpi-total-spent" />
                <Kpi icon={<Receipt className="h-3.5 w-3.5" />} label="Bills" value={s.bills} sub={`Avg bill ${inr(s.avgBill)}`} tone="blue" testId="kpi-bills" />
                <Kpi icon={<Package className="h-3.5 w-3.5" />} label="Pieces bought" value={qtyFmt(s.itemsQty)} sub={`Avg ${inr(s.avgItemPrice)} per piece`} tone="emerald" />
                <Kpi
                  icon={<CalendarClock className="h-3.5 w-3.5" />}
                  label="Last visit"
                  value={s.daysSinceLast === 0 ? "Today" : `${s.daysSinceLast} days ago`}
                  sub={`${dateFmt(s.lastDate)}${s.avgGapDays ? ` · visits every ~${s.avgGapDays} days` : ""}`}
                  tone="amber"
                />
                <Kpi
                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                  label="Returns"
                  value={inr(s.returnsAmount)}
                  sub={`${s.returnsCount} return${s.returnsCount === 1 ? "" : "s"} · ${s.returnRatePct}% of spend`}
                  tone="rose"
                />
                <Kpi
                  icon={<Tag className="h-3.5 w-3.5" />}
                  label="Avg discount"
                  value={`${analysis.pricing.avgDiscountPct}%`}
                  sub={`${analysis.pricing.discountedQtyPct}% of pieces below MRP`}
                />
                <Kpi
                  icon={<Wallet className="h-3.5 w-3.5" />}
                  label="Bill payment"
                  value={`${analysis.payments.paid}/${s.bills} paid`}
                  sub={`${analysis.payments.partial} part paid · ${analysis.payments.pending} unpaid`}
                />
                <Kpi
                  icon={<CreditCard className="h-3.5 w-3.5" />}
                  label="Account balance"
                  value={
                    !b || balance?.isLoading
                      ? "…"
                      : `${formatAccountInr(Math.abs(b.net))} ${b.net > 0 ? "due" : b.net < 0 ? "credit" : "settled"}`
                  }
                  sub={b ? `Bills due ${formatAccountInr(b.billsDue)} · advance ${formatAccountInr(b.unusedAdvance)}` : "Today, all periods"}
                  tone={b && b.net > 0 ? "rose" : "emerald"}
                />
              </div>

              <div className="grid gap-3 lg:grid-cols-5">
                <Card title="Monthly spend" icon={<BarChart3 className="h-4 w-4" />} className="lg:col-span-3">
                  <div className="h-44" data-testid="customer-analysis-monthly">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analysis.monthly} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#64748b" }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v: number) => (v >= 1000 ? `${Number((v / 1000).toFixed(v >= 10000 ? 0 : 1))}k` : String(Math.round(v)))}
                        />
                        <ChartTooltip
                          cursor={{ fill: "rgba(99,102,241,0.08)" }}
                          formatter={(v: number, _n, item) => [`${inr(v)} · ${(item?.payload as { bills?: number })?.bills ?? 0} bills`, "Spend"]}
                        />
                        <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex items-end gap-1" aria-label="Visits by weekday">
                    {analysis.weekdays.map((d) => {
                      const max = Math.max(...analysis.weekdays.map((w) => w.bills), 1);
                      return (
                        <div key={d.day} className="flex-1 text-center" title={`${d.bills} bills on ${d.day}`}>
                          <div className="mx-auto h-8 w-full max-w-[36px] rounded bg-slate-100 flex items-end overflow-hidden">
                            <div className="w-full bg-blue-400" style={{ height: `${(d.bills / max) * 100}%` }} />
                          </div>
                          <div className="mt-0.5 text-[10px] font-semibold text-slate-500">{d.day}</div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                <Card title="Payment record" icon={<Wallet className="h-4 w-4" />} className="lg:col-span-2">
                  <ul className="space-y-1.5" data-testid="customer-analysis-payments">
                    {analysis.payments.methods.map((m) => (
                      <li key={m.key} className="text-xs">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-slate-700">{m.label}</span>
                          <span className="ml-auto tabular-nums text-slate-500">
                            {m.bills} bill{m.bills === 1 ? "" : "s"} · {inr(m.amount)} · <b className="text-slate-700">{m.sharePct}%</b>
                          </span>
                        </div>
                        <div className="mt-0.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${m.sharePct}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[11px]">
                    <div className="rounded-lg bg-emerald-50 py-1.5 text-emerald-700">
                      <div className="text-base font-extrabold tabular-nums">{analysis.payments.paid}</div>
                      Paid
                    </div>
                    <div className="rounded-lg bg-amber-50 py-1.5 text-amber-700">
                      <div className="text-base font-extrabold tabular-nums">{analysis.payments.partial}</div>
                      Part paid
                    </div>
                    <div className="rounded-lg bg-rose-50 py-1.5 text-rose-700">
                      <div className="text-base font-extrabold tabular-nums">{analysis.payments.pending}</div>
                      Unpaid
                    </div>
                  </div>
                </Card>
              </div>

              <Card
                title="Products bought most"
                icon={<ShoppingBag className="h-4 w-4" />}
                right={
                  <div className="inline-flex rounded-md border p-0.5 bg-slate-50" role="group" aria-label="Sort products">
                    {(["amount", "qty"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setProductSort(k)}
                        aria-pressed={productSort === k}
                        className={cn(
                          "rounded px-2 py-0.5 text-[11px] font-semibold",
                          productSort === k ? "bg-indigo-600 text-white" : "text-slate-500 hover:text-slate-800",
                        )}
                      >
                        By {k === "amount" ? "spend" : "pieces"}
                      </button>
                    ))}
                  </div>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" data-testid="customer-analysis-products">
                    <thead>
                      <tr className="border-b text-left text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="py-1.5 pr-2 font-bold">#</th>
                        <th className="py-1.5 pr-2 font-bold">Product</th>
                        <th className="py-1.5 pr-2 font-bold">Sizes</th>
                        <th className="py-1.5 pr-2 font-bold text-right">Bills</th>
                        <th className="py-1.5 pr-2 font-bold text-right">Pieces</th>
                        <th className="py-1.5 pr-2 font-bold text-right">Spend</th>
                        <th className="py-1.5 pr-2 font-bold text-right">Avg price</th>
                        <th className="py-1.5 pr-2 font-bold text-right">Last price</th>
                        <th className="py-1.5 pr-2 font-bold text-right">MRP</th>
                        <th className="py-1.5 pr-2 font-bold text-right">Disc</th>
                        <th className="py-1.5 font-bold text-right">Last bought</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((p, i) => (
                        <tr key={p.key} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="py-1.5 pr-2 text-slate-400 tabular-nums">{i + 1}</td>
                          <td className="py-1.5 pr-2 font-semibold text-slate-800 max-w-[260px] truncate" title={p.name}>{p.name}</td>
                          <td className="py-1.5 pr-2 text-slate-500">{p.sizes.join(", ") || "—"}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{p.bills}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">{qtyFmt(p.qty)}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums font-bold text-indigo-700">{inr(p.amount)}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{inr(p.avgPrice)}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{inr(p.lastPrice)}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{p.mrp > 0 ? inr(p.mrp) : "—"}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{p.avgDiscountPct > 0 ? `${p.avgDiscountPct}%` : "—"}</td>
                          <td className="py-1.5 text-right whitespace-nowrap text-slate-500">{dateFmt(p.lastDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="grid gap-3 lg:grid-cols-3">
                <Card title="Category & brand" icon={<Tag className="h-4 w-4" />}>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Category</p>
                  <ShareBars rows={analysis.categories} color="bg-indigo-500" />
                  <p className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Brand</p>
                  <ShareBars rows={analysis.brands} color="bg-violet-500" />
                </Card>

                <Card title="Size & colour" icon={<Package className="h-4 w-4" />}>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Sizes</p>
                  <Chips rows={analysis.sizes} tone="bg-blue-600 text-white ring-blue-600" />
                  <p className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Colours</p>
                  <Chips rows={analysis.colors} tone="bg-emerald-600 text-white ring-emerald-600" />
                </Card>

                <Card title="Price behaviour" icon={<IndianRupee className="h-4 w-4" />}>
                  <div className="mb-2 grid grid-cols-3 gap-1.5 text-center text-[11px] text-slate-500">
                    <div className="rounded-lg bg-slate-50 py-1.5">
                      <div className="text-sm font-extrabold text-slate-800 tabular-nums">{inr(analysis.pricing.median)}</div>
                      Typical piece
                    </div>
                    <div className="rounded-lg bg-slate-50 py-1.5">
                      <div className="text-sm font-extrabold text-slate-800 tabular-nums">
                        {inr(analysis.pricing.p25)}–{inr(analysis.pricing.p75)}
                      </div>
                      Usual range
                    </div>
                    <div className="rounded-lg bg-slate-50 py-1.5">
                      <div className="text-sm font-extrabold text-slate-800 tabular-nums">{inr(analysis.pricing.maxItemPrice)}</div>
                      Costliest piece
                    </div>
                  </div>
                  <ShareBars
                    rows={analysis.priceBands.map((p) => ({ name: p.label, qty: p.qty, amount: 0, sharePct: p.sharePct }))}
                    color="bg-amber-500"
                    showAmount={false}
                  />
                </Card>
              </div>
              <p className="text-[11px] text-muted-foreground">
                From saved bills (cancelled bills and delivery challans left out). Prices are what the customer paid per piece
                after discount. Account balance is today's ledger figure.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CustomerAnalysisDialog;
