import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, Search, TrendingDown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatAltUnitQty } from "@/utils/industrialMode";
import { fetchReorderLevelItems, filterReorderItems } from "@/utils/reorderLevelReport";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null | undefined;
  onOpenProduct?: (productId: string) => void;
};

const ROW_LIMIT = 300;

function qty(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

/** Industrial mode: items at or under their reorder level, emptiest first. */
export function ReorderLevelDialog({ open, onOpenChange, organizationId, onOpenProduct }: Props) {
  const [search, setSearch] = useState("");
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["reorder-level-items", organizationId],
    queryFn: () => fetchReorderLevelItems(organizationId!),
    enabled: open && !!organizationId,
    staleTime: 30_000,
  });

  const items = data?.items;
  const filtered = useMemo(() => filterReorderItems(items ?? [], search), [items, search]);
  const visible = filtered.slice(0, ROW_LIMIT);
  const below = (items ?? []).filter((i) => i.state === "below").length;
  const at = (items ?? []).filter((i) => i.state === "at").length;

  const tiles = [
    { label: "Items with a level", value: data ? qty(data.tracked) : "…", tone: "text-slate-900" },
    { label: "Below level", value: data ? qty(below) : "…", tone: below > 0 ? "text-red-700" : "text-slate-900" },
    { label: "At level", value: data ? qty(at) : "…", tone: at > 0 ? "text-amber-700" : "text-slate-900" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-w-4xl flex-col gap-3 p-0 sm:p-0">
        <DialogHeader className="border-b px-5 pb-3 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <TrendingDown className="h-5 w-5 text-red-600" />
            Below reorder level
          </DialogTitle>
          <DialogDescription>
            Items whose stock has dropped to or under the reorder level set in Product Entry. Emptiest first.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 px-5">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.label}</div>
              <div className={cn("text-xl font-bold tabular-nums", t.tone)}>{t.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Item, brand or category"
              className="h-9 pl-9 text-sm no-uppercase"
            />
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto border-t">
          {isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking stock against reorder levels…
            </div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-red-700">
              {error instanceof Error ? error.message : "Could not load reorder levels"}
            </div>
          ) : visible.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {data && data.tracked === 0
                ? "No item has a reorder level yet. Set one in Product Entry › Units & reorder."
                : items && items.length > 0
                  ? "Nothing matches this search."
                  : "Every item is above its reorder level."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_rgb(226,232,240)]">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-2 py-2">Brand / category</th>
                  <th className="px-2 py-2 text-right">In stock</th>
                  <th className="px-2 py-2 text-right">Reorder level</th>
                  <th className="px-3 py-2 text-right">Short by</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((i) => {
                  const shortAlt = formatAltUnitQty(i.shortQty, i.uom, i.altUom, i.altFactor);
                  return (
                    <tr
                      key={i.productId}
                      className={cn("border-b border-slate-100", onOpenProduct && "cursor-pointer hover:bg-slate-50")}
                      onClick={onOpenProduct ? () => onOpenProduct(i.productId) : undefined}
                      title={onOpenProduct ? "Open in Product Entry" : undefined}
                    >
                      <td className="px-3 py-2 font-medium text-slate-900">{i.productName}</td>
                      <td className="px-2 py-2 text-slate-600">{[i.brand, i.category].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {qty(i.stockQty)} <span className="text-xs text-slate-500">{i.uom}</span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-600">{qty(i.reorderLevel)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {i.state === "at" ? (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                            At level
                          </span>
                        ) : (
                          <span className="inline-flex flex-col items-end">
                            <span className="rounded bg-red-50 px-1.5 py-0.5 font-bold text-red-700 ring-1 ring-red-200">
                              {qty(i.shortQty)} {i.uom}
                            </span>
                            {shortAlt && <span className="mt-0.5 text-[11px] text-slate-500">≈ {shortAlt}</span>}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {(filtered.length > ROW_LIMIT || data?.truncated) && (
          <div className="border-t bg-amber-50 px-5 py-2 text-xs text-amber-800">
            {filtered.length > ROW_LIMIT && `Showing the first ${ROW_LIMIT} of ${filtered.length} items. Search to narrow the list. `}
            {data?.truncated && "Only the first 10,000 items with a reorder level were read."}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
