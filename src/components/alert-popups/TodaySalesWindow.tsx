import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Banknote,
  CreditCard,
  IndianRupee,
  Loader2,
  Package,
  PackageX,
  Receipt,
  RefreshCw,
  Search,
  ShoppingBag,
  Smartphone,
  Wallet,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatInrShort } from "@/lib/alertPopups";
import { DEFAULT_ACTIVITY_LOW_STOCK_THRESHOLD } from "@/utils/activityCenterData";
import { ALERT_POPUP_TODAY_DETAIL_KEY, fetchTodaySalesDetail } from "@/utils/alertPopupData";

type ItemFilter = "all" | "out" | "low";
type View = "items" | "bills";

interface TodaySalesWindowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | undefined;
  /** Shown only when the user may open Item-wise Sales. */
  onOpenItemWiseSales?: () => void;
}

function stockTone(stock: number | null): string {
  if (stock === null) return "bg-slate-100 text-slate-500";
  if (stock <= 0) return "bg-red-100 text-red-700 ring-1 ring-red-200";
  if (stock <= DEFAULT_ACTIVITY_LOW_STOCK_THRESHOLD) return "bg-amber-100 text-amber-800 ring-1 ring-amber-200";
  return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

const PAYMENT_PARTS = [
  { key: "cash", label: "Cash", icon: Banknote, bar: "bg-emerald-500", chip: "text-emerald-700 bg-emerald-50" },
  { key: "upi", label: "UPI", icon: Smartphone, bar: "bg-violet-500", chip: "text-violet-700 bg-violet-50" },
  { key: "card", label: "Card", icon: CreditCard, bar: "bg-blue-500", chip: "text-blue-700 bg-blue-50" },
  { key: "other", label: "Credit / other", icon: Wallet, bar: "bg-amber-500", chip: "text-amber-800 bg-amber-50" },
] as const;

/** Full "Today's sales" window opened from the sales alert popup. */
export function TodaySalesWindow({ open, onOpenChange, orgId, onOpenItemWiseSales }: TodaySalesWindowProps) {
  const [view, setView] = useState<View>("items");
  const [filter, setFilter] = useState<ItemFilter>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [ALERT_POPUP_TODAY_DETAIL_KEY, orgId],
    queryFn: () => fetchTodaySalesDetail(orgId!),
    enabled: open && !!orgId,
    staleTime: 30_000,
  });

  const counts = useMemo(() => {
    const items = data?.items ?? [];
    return {
      all: items.length,
      out: items.filter((l) => l.stock !== null && l.stock <= 0).length,
      low: items.filter(
        (l) => l.stock !== null && l.stock > 0 && l.stock <= DEFAULT_ACTIVITY_LOW_STOCK_THRESHOLD,
      ).length,
    };
  }, [data]);

  const q = search.trim().toLowerCase();
  const items = useMemo(() => {
    let rows = data?.items ?? [];
    if (filter === "out") rows = rows.filter((l) => l.stock !== null && l.stock <= 0);
    if (filter === "low")
      rows = rows.filter(
        (l) => l.stock !== null && l.stock > 0 && l.stock <= DEFAULT_ACTIVITY_LOW_STOCK_THRESHOLD,
      );
    if (q) rows = rows.filter((l) => l.name.toLowerCase().includes(q) || (l.barcode ?? "").toLowerCase().includes(q));
    return rows;
  }, [data, filter, q]);

  const bills = useMemo(() => {
    const rows = data?.bills ?? [];
    if (!q) return rows;
    return rows.filter(
      (b) => b.saleNumber.toLowerCase().includes(q) || b.customerName.toLowerCase().includes(q),
    );
  }, [data, q]);

  const rankById = useMemo(
    () => new Map((data?.items ?? []).map((l, i) => [l.variantId, i + 1])),
    [data],
  );
  const maxQty = Math.max(1, ...(data?.items ?? []).map((l) => l.qty));
  const billCount = data?.bills.length ?? 0;
  const payTotal = data
    ? data.payments.cash + data.payments.upi + data.payments.card + data.payments.other
    : 0;
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  const tiles = [
    {
      label: "Sales",
      value: data ? formatInrShort(data.totalAmount) : "—",
      icon: IndianRupee,
      tone: "from-emerald-500 to-teal-600",
    },
    { label: "Bills", value: data ? String(billCount) : "—", icon: Receipt, tone: "from-blue-600 to-indigo-600" },
    {
      label: "Items sold",
      value: data ? String(data.totalQty) : "—",
      icon: ShoppingBag,
      tone: "from-violet-600 to-fuchsia-600",
    },
    {
      label: "Avg bill",
      value: data && billCount > 0 ? formatInrShort(data.totalAmount / billCount) : "—",
      icon: Wallet,
      tone: "from-amber-500 to-orange-600",
    },
    {
      label: "Sold out",
      value: data ? String(counts.out) : "—",
      icon: PackageX,
      tone: "from-rose-500 to-red-600",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl p-0 gap-0 overflow-hidden rounded-2xl border-0 shadow-2xl flex flex-col max-h-[92vh] [&>button:last-child]:hidden"
      >
        {/* Header */}
        <div className="relative bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-5 py-4 text-white">
          <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute right-24 -bottom-16 h-32 w-32 rounded-full bg-white/10" />
          <div className="relative flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shadow-inner">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg font-bold leading-tight">Today&apos;s sales</DialogTitle>
              <DialogDescription className="text-[12px] text-white/80">
                {today} · top sellers and stock left
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              aria-label="Refresh"
              className="h-8 w-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center disabled:opacity-60"
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="h-8 w-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 px-4 py-4 sm:px-5 space-y-4">
          {/* KPI tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {tiles.map((t) => (
              <div
                key={t.label}
                className={cn("rounded-xl bg-gradient-to-br p-3 text-white shadow-md", t.tone)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-white/85">{t.label}</span>
                  <t.icon className="h-4 w-4 text-white/80" />
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums leading-tight">{t.value}</div>
              </div>
            ))}
          </div>

          {/* Payment mix */}
          {data && payTotal > 0 && (
            <div className="rounded-xl border bg-card p-3 shadow-sm">
              <div className="text-[12px] font-semibold text-muted-foreground mb-2">Payment mix</div>
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                {PAYMENT_PARTS.map((p) => {
                  const v = data.payments[p.key];
                  if (v <= 0) return null;
                  return <div key={p.key} className={p.bar} style={{ width: `${(v / payTotal) * 100}%` }} />;
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {PAYMENT_PARTS.map((p) => (
                  <span
                    key={p.key}
                    className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium", p.chip)}
                  >
                    <p.icon className="h-3.5 w-3.5" />
                    {p.label}
                    <span className="font-bold tabular-nums">{formatInrShort(data.payments[p.key])}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="inline-flex rounded-lg bg-muted p-1 shrink-0">
              {(
                [
                  { key: "items", label: `Items (${counts.all})` },
                  { key: "bills", label: `Bills (${billCount})` },
                ] as const
              ).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setView(v.key)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors",
                    view === v.key ? "bg-white text-emerald-700 shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
            {view === "items" && (
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { key: "all", label: "All", tone: "bg-slate-800 text-white", idle: "bg-white text-slate-700 border" },
                    { key: "out", label: `Sold out (${counts.out})`, tone: "bg-red-600 text-white", idle: "bg-red-50 text-red-700 border border-red-200" },
                    { key: "low", label: `Low (${counts.low})`, tone: "bg-amber-500 text-white", idle: "bg-amber-50 text-amber-800 border border-amber-200" },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[12px] font-semibold transition-colors",
                      filter === f.key ? f.tone : f.idle,
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
            <div className="relative sm:ml-auto sm:w-60">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={view === "items" ? "Search item or barcode" : "Search bill or customer"}
                className="h-8 pl-8 text-[12px]"
              />
            </div>
          </div>

          {/* Body */}
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading today&apos;s sales…
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-12 text-sm text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Could not load today&apos;s sales.
              <button type="button" onClick={() => void refetch()} className="text-primary font-semibold hover:underline">
                Try again
              </button>
            </div>
          ) : view === "items" ? (
            items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
                <Package className="h-6 w-6" />
                {counts.all === 0 ? "No items sold yet today." : "No items match."}
              </div>
            ) : (
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="hidden sm:grid grid-cols-[2.25rem_1fr_9rem_6rem_6rem] gap-3 px-3 py-2 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b">
                  <span>#</span>
                  <span>Item</span>
                  <span>Sold</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Stock left</span>
                </div>
                <ul className="divide-y">
                  {items.map((line) => {
                    const rank = rankById.get(line.variantId) ?? 0;
                    return (
                      <li
                        key={line.variantId}
                        className="grid grid-cols-[2.25rem_1fr_auto] sm:grid-cols-[2.25rem_1fr_9rem_6rem_6rem] items-center gap-x-3 gap-y-1 px-3 py-2 text-[13px] hover:bg-emerald-50/50"
                      >
                        <span
                          className={cn(
                            "h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold",
                            rank === 1
                              ? "bg-amber-400 text-white"
                              : rank === 2
                                ? "bg-slate-400 text-white"
                                : rank === 3
                                  ? "bg-orange-400 text-white"
                                  : "bg-slate-100 text-slate-600",
                          )}
                        >
                          {rank}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{line.name}</div>
                          {line.barcode && (
                            <div className="text-[11px] text-muted-foreground font-mono truncate">{line.barcode}</div>
                          )}
                        </div>
                        <div className="hidden sm:flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-emerald-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                              style={{ width: `${(line.qty / maxQty) * 100}%` }}
                            />
                          </div>
                          <span className="font-semibold tabular-nums w-8 text-right">{line.qty}</span>
                        </div>
                        <span className="hidden sm:block text-right tabular-nums text-muted-foreground">
                          {formatInrShort(line.amount)}
                        </span>
                        <span className="text-right">
                          <span className="sm:hidden mr-2 text-[12px] text-muted-foreground">sold {line.qty}</span>
                          <span
                            className={cn(
                              "inline-flex min-w-[3.5rem] justify-center rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums",
                              stockTone(line.stock),
                            )}
                          >
                            {line.stock === null ? "—" : line.stock <= 0 ? "0 left" : `${line.stock} left`}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          ) : bills.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
              <Receipt className="h-6 w-6" />
              {billCount === 0 ? "No bills yet today." : "No bills match."}
            </div>
          ) : (
            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <ul className="divide-y">
                {bills.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-3 py-2 text-[13px] hover:bg-blue-50/50">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shrink-0">
                      <Receipt className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">
                        {b.saleNumber}
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                          {b.saleType === "pos" ? "POS" : "Invoice"}
                        </span>
                      </div>
                      <div className="text-[12px] text-muted-foreground truncate">
                        {formatTime(b.saleDate)} · {b.customerName} · {b.itemQty} {b.itemQty === 1 ? "item" : "items"}
                        {b.paymentMethod ? ` · ${b.paymentMethod.toUpperCase()}` : ""}
                      </div>
                    </div>
                    <span className="font-bold tabular-nums text-emerald-700">{formatInrShort(b.netAmount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data?.truncated && (
            <p className="text-[11px] text-muted-foreground text-center">
              Showing the latest {billCount} bills. Open Item-wise Sales for the full day.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t bg-card px-4 py-3 sm:px-5">
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Stock left is the live stock right now.
          </span>
          <div className="ml-auto flex gap-2">
            {onOpenItemWiseSales && (
              <button
                type="button"
                onClick={onOpenItemWiseSales}
                className="h-9 px-4 rounded-lg text-[13px] font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-sm"
              >
                Item-wise Sales report
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 px-4 rounded-lg text-[13px] font-semibold border bg-white hover:bg-muted"
            >
              Close
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
