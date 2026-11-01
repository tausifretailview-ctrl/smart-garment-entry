import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, PackageSearch, RefreshCw, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toIsoDay } from "@/utils/industrialMode";
import {
  fetchPendingSaleOrderItems,
  filterPendingItems,
  pendingItemsTotals,
} from "@/utils/saleOrderPendingItems";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null | undefined;
};

/** Render cap keeps the dialog instant on big order books; search narrows the rest. */
const ROW_LIMIT = 300;

function ddmmyy(iso: string | null): string {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}

function qty(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

/** Industrial mode: what is still to dispatch on open sale orders, per item, against stock in hand. */
export function SaleOrderPendingItemsDialog({ open, onOpenChange, organizationId }: Props) {
  const [search, setSearch] = useState("");
  const [onlyShort, setOnlyShort] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["sale-order-pending-items", organizationId],
    queryFn: () => fetchPendingSaleOrderItems(organizationId!),
    enabled: open && !!organizationId,
    staleTime: 30_000,
  });

  const all = data?.items;
  const totals = useMemo(() => pendingItemsTotals(all ?? []), [all]);
  const filtered = useMemo(() => filterPendingItems(all ?? [], search, onlyShort), [all, search, onlyShort]);
  const visible = filtered.slice(0, ROW_LIMIT);
  const today = toIsoDay(new Date());

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const tiles = [
    { label: "Items pending", value: qty(totals.items), tone: "text-slate-900" },
    { label: "Qty to dispatch", value: qty(totals.pendingQty), tone: "text-sky-800" },
    { label: "Short items", value: qty(totals.shortItems), tone: totals.shortItems > 0 ? "text-red-700" : "text-slate-900" },
    { label: "Open orders", value: qty(totals.orders), tone: "text-slate-900" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] max-w-5xl flex-col gap-3 p-0 sm:p-0">
        <DialogHeader className="border-b px-5 pb-3 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <PackageSearch className="h-5 w-5 text-sky-700" />
            Pending by item
          </DialogTitle>
          <DialogDescription>
            What is still to dispatch on open sale orders, against stock in hand. Short items come first.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 px-5 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.label}</div>
              <div className={cn("text-xl font-bold tabular-nums", t.tone)}>{isLoading ? "…" : t.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Item, size, customer or order no"
              className="h-9 pl-9 text-sm no-uppercase"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            aria-pressed={onlyShort}
            onClick={() => setOnlyShort((v) => !v)}
            className={cn(
              "h-9 gap-1.5",
              onlyShort && "border-red-600 bg-red-600 text-white hover:bg-red-700 hover:text-white",
            )}
          >
            <AlertTriangle className="h-4 w-4" />
            Only short
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto border-t">
          {isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading open sale orders…
            </div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-red-700">
              {error instanceof Error ? error.message : "Could not load pending items"}
            </div>
          ) : visible.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {all && all.length > 0 ? "Nothing matches this search." : "No open sale order has anything left to dispatch."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_rgb(226,232,240)]">
                <tr>
                  <th className="w-8 px-2 py-2" />
                  <th className="px-2 py-2">Item</th>
                  <th className="px-2 py-2">Size / colour</th>
                  <th className="px-2 py-2 text-right">To dispatch</th>
                  <th className="px-2 py-2 text-right">In stock</th>
                  <th className="px-2 py-2 text-right">Short</th>
                  <th className="px-2 py-2 text-right">Orders</th>
                  <th className="px-3 py-2">Earliest due</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => {
                  const isOpen = expanded.has(s.key);
                  const overdue = !!s.earliestDue && s.earliestDue < today;
                  return (
                    <Fragment key={s.key}>
                      <tr
                        className={cn("cursor-pointer border-b border-slate-100 hover:bg-slate-50", isOpen && "bg-slate-50")}
                        onClick={() => toggle(s.key)}
                      >
                        <td className="px-2 py-2 text-slate-400">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="px-2 py-2 font-medium text-slate-900">{s.productName}</td>
                        <td className="px-2 py-2 text-slate-600">{[s.size, s.color].filter(Boolean).join(" · ") || "—"}</td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums">{qty(s.pendingQty)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-600">{qty(s.stockQty)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {s.shortQty > 0 ? (
                            <span className="rounded bg-red-50 px-1.5 py-0.5 font-bold text-red-700 ring-1 ring-red-200">
                              {qty(s.shortQty)}
                            </span>
                          ) : (
                            <span className="text-emerald-700">Ready</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-600">{s.orders.length}</td>
                        <td className={cn("px-3 py-2 tabular-nums", overdue ? "font-semibold text-red-700" : "text-slate-600")}>
                          {ddmmyy(s.earliestDue)}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          <td />
                          <td colSpan={7} className="px-2 pb-3 pt-1">
                            <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
                              {s.orders.map((o) => (
                                <div
                                  key={o.orderId}
                                  className="flex items-center gap-3 border-b border-slate-100 px-3 py-1.5 text-[13px] last:border-b-0"
                                >
                                  <span className="w-32 shrink-0 font-mono font-semibold text-teal-800">{o.orderNumber || "Sale Order"}</span>
                                  <span className="min-w-0 flex-1 truncate text-slate-700">{o.customerName || "—"}</span>
                                  <span className="w-20 text-right font-semibold tabular-nums">{qty(o.qty)}</span>
                                  <span
                                    className={cn(
                                      "w-20 text-right tabular-nums",
                                      o.dueDate && o.dueDate < today ? "font-semibold text-red-700" : "text-slate-500",
                                    )}
                                  >
                                    {ddmmyy(o.dueDate)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {(filtered.length > ROW_LIMIT || data?.truncated) && (
          <div className="border-t bg-amber-50 px-5 py-2 text-xs text-amber-800">
            {filtered.length > ROW_LIMIT && `Showing the first ${ROW_LIMIT} of ${filtered.length} items. Search to narrow the list. `}
            {data?.truncated && "Very large order book: only the first 10,000 pending lines were read."}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
