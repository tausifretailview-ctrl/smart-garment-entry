import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Warehouse,
} from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useTabCacheLayout } from "@/contexts/TabCacheLayoutContext";
import { useSharedAppShell } from "@/contexts/SharedAppShellContext";
import { useIndustrialMode } from "@/hooks/useIndustrialMode";
import { useToast } from "@/hooks/use-toast";
import { GodownDialog } from "@/components/godowns/GodownDialog";
import { ListTableSkeleton } from "@/components/skeletons/ListPageSkeleton";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  GODOWN_STOCK_PAGE,
  fetchAllGodownStock,
  fetchGodownStock,
  fetchGodownSummary,
  fetchGodowns,
  formatGodownQty,
  formatGodownValue,
  godownItemLabel,
  godownStockExcelRows,
  godownTypeInfo,
  type Godown,
} from "@/utils/godowns";
import type * as XLSXType from "xlsx";

let xlsxModulePromise: Promise<typeof XLSXType> | null = null;
const loadXlsx = (): Promise<typeof XLSXType> => (xlsxModulePromise ??= import("xlsx"));

/**
 * Industrial mode, Phase 3 step 3a: the shop's godowns and the stock in each. Main holds all
 * stock that is not in another godown, so the shop's bills and stock reports are unchanged.
 */
export default function Godowns() {
  const { currentOrganization, organizationRole } = useOrganization();
  const orgId = currentOrganization?.id ?? "";
  const industrialOn = useIndustrialMode().enabled;
  const canManage = organizationRole === "admin" || organizationRole === "manager";
  const inTabCache = useTabCacheLayout();
  const sharedShell = useSharedAppShell();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [dialog, setDialog] = useState<{ open: boolean; godown: Godown | null }>({ open: false, godown: null });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);
  useEffect(() => setPage(0), [debounced, selectedId]);

  const list = useQuery({
    queryKey: ["godowns", orgId],
    queryFn: () => fetchGodowns(orgId),
    enabled: !!orgId && industrialOn,
    staleTime: 60_000,
  });
  const godowns = list.data?.godowns ?? [];
  const missingSql = !!list.data?.missingSql;

  const summary = useQuery({
    queryKey: ["godown-summary", orgId],
    queryFn: () => fetchGodownSummary(orgId),
    enabled: !!orgId && industrialOn && !missingSql && godowns.length > 0,
    staleTime: 30_000,
  });

  // Main is picked first; the pick stays while the list refreshes.
  const selected = godowns.find((g) => g.id === selectedId) ?? godowns[0] ?? null;

  const stock = useQuery({
    queryKey: ["godown-stock", orgId, selected?.id ?? "", debounced, page],
    queryFn: () => fetchGodownStock({ organizationId: orgId, godownId: selected!.id, search: debounced, offset: page * GODOWN_STOCK_PAGE }),
    enabled: !!orgId && industrialOn && !!selected && !missingSql,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const rows = stock.data?.rows ?? [];
  const total = stock.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / GODOWN_STOCK_PAGE));

  const totals = useMemo(() => {
    let items = 0;
    let value = 0;
    for (const s of summary.data?.values() ?? []) {
      items += s.items;
      value += s.stock_value;
    }
    return { items, value };
  }, [summary.data]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["godowns", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["godown-summary", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["godown-stock", orgId] });
  };

  const exportExcel = async () => {
    if (!selected || exporting) return;
    setExporting(true);
    try {
      const all = await fetchAllGodownStock(orgId, selected.id, debounced);
      const XLSX = await loadXlsx();
      const ws = XLSX.utils.json_to_sheet(godownStockExcelRows(selected.name, all));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Godown stock");
      XLSX.writeFile(wb, `Godown_${selected.name.replace(/[^A-Za-z0-9]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      toast({ variant: "destructive", title: "Could not make the Excel file", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setExporting(false);
    }
  };

  if (!industrialOn) {
    return (
      <div className="flex h-full w-full items-start justify-center bg-slate-50 p-6">
        <Card className="max-w-lg border-slate-200 p-6 text-sm text-slate-600 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-800">
            <Warehouse className="h-5 w-5 text-teal-600" />
            Godowns
          </div>
          Godowns are part of Industrial mode. Turn it on in Settings &gt; Product to keep stock in more than one place.
        </Card>
      </div>
    );
  }

  const selectedSummary = selected ? summary.data?.get(selected.id) : undefined;
  const isMainSelected = selected?.godown_type === "main";

  return (
    <div
      className={cn(
        "purchase-dashboard-workspace flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 px-2 py-2 sm:px-3",
        !inTabCache && !sharedShell && "h-[calc(100vh-3.5rem)]",
      )}
    >
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold leading-none tracking-tight text-teal-800">
              <Warehouse className="h-4 w-4 shrink-0 opacity-70" />
              Godowns
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Stock in each place of this shop, on one GSTIN
              {summary.data ? (
                <span className="text-slate-400">
                  {" "}
                  · {totals.items.toLocaleString("en-IN")} item lines · {formatGodownValue(totals.value)} at purchase rate
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 border-slate-200 text-sm"
              onClick={refresh}
              disabled={list.isFetching || summary.isFetching}
            >
              {list.isFetching || summary.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
            {canManage ? (
              <Button
                size="sm"
                className="h-9 gap-1.5 bg-teal-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
                onClick={() => setDialog({ open: true, godown: null })}
                disabled={missingSql || list.isLoading}
              >
                <Plus className="h-4 w-4" />
                Godown
              </Button>
            ) : null}
          </div>
        </div>

        {missingSql ? (
          <div className="flex shrink-0 items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Run the Phase 3 step 3a SQL first: it adds the godown tables.
          </div>
        ) : null}
        {list.error ? (
          <div className="flex shrink-0 items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {list.error instanceof Error ? list.error.message : "Could not read the godowns"}
          </div>
        ) : null}

        {list.isLoading ? (
          <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[112px] animate-pulse rounded-xl border border-slate-200 bg-white" />
            ))}
          </div>
        ) : godowns.length > 0 ? (
          <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {godowns.map((g) => {
              const s = summary.data?.get(g.id);
              const info = godownTypeInfo(g.godown_type);
              const active = selected?.id === g.id;
              return (
                <div
                  key={g.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(g.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelectedId(g.id)}
                  className={cn(
                    "group relative cursor-pointer rounded-xl border bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500",
                    active ? "border-teal-400 ring-2 ring-teal-600/25" : "border-slate-200",
                    !g.is_active && "opacity-60",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-slate-800">{g.name}</span>
                        <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ring-1", info.badge)}>{info.label}</span>
                        {g.code ? <span className="font-mono text-[10px] text-slate-400">{g.code}</span> : null}
                        {!g.is_active ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-500">Closed</span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex items-center gap-1 truncate text-[11px] text-slate-400">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{[g.address, g.pincode].filter(Boolean).join(" ") || "No address"}</span>
                      </div>
                    </div>
                    {canManage ? (
                      <button
                        type="button"
                        className="rounded-md p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-teal-700 focus:opacity-100 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDialog({ open: true, godown: g });
                        }}
                        title={`Edit ${g.name}`}
                        aria-label={`Edit ${g.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Items</div>
                      <div className="text-sm font-semibold tabular-nums text-slate-800">
                        {s ? s.items.toLocaleString("en-IN") : summary.isLoading ? "…" : "0"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Qty</div>
                      <div className="text-sm font-semibold tabular-nums text-slate-800">{s ? formatGodownQty(s.qty) : summary.isLoading ? "…" : "0"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Value</div>
                      <div className="text-sm font-semibold tabular-nums text-teal-800">
                        {s ? formatGodownValue(s.stock_value) : summary.isLoading ? "…" : "₹0"}
                      </div>
                    </div>
                  </div>
                  {s && s.short_items > 0 ? (
                    <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-amber-700">
                      <AlertTriangle className="h-3 w-3" />
                      {s.short_items} item{s.short_items === 1 ? "" : "s"} below zero here
                    </div>
                  ) : null}
                </div>
              );
            })}
            {canManage && godowns.length < 2 && !missingSql ? (
              <button
                type="button"
                onClick={() => setDialog({ open: true, godown: null })}
                className="flex min-h-[112px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-teal-300 bg-teal-50/40 p-3 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-50"
              >
                <Plus className="h-5 w-5" />
                Add your first godown
                <span className="text-[11px] font-normal text-teal-600/80">Own godown, job worker or damaged goods</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {selected && !missingSql ? (
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 p-0 shadow-sm">
            <div className="flex shrink-0 flex-wrap items-center gap-2 overflow-x-auto border-b border-slate-100 bg-white px-3 py-2.5">
              <div className="mr-1 min-w-0">
                <div className="truncate text-sm font-semibold text-slate-800">Stock in {selected.name}</div>
                <div className="text-[11px] text-slate-400">
                  {isMainSelected ? "Shop stock minus what is in other godowns" : godownTypeInfo(selected.godown_type).hint}
                </div>
              </div>
              <div className="relative min-w-[180px] max-w-full flex-1 sm:max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Item, barcode, brand, colour..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="no-uppercase h-9 border-slate-200 bg-slate-50 pl-9 text-sm focus:bg-white"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-9 gap-1.5 border-slate-200 text-sm"
                onClick={() => void exportExcel()}
                disabled={exporting || total === 0}
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                Excel
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {stock.isLoading ? (
                <ListTableSkeleton />
              ) : stock.error ? (
                <div className="flex items-start gap-2 px-4 py-6 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {stock.error instanceof Error ? stock.error.message : "Could not read the stock"}
                </div>
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center text-sm text-slate-500">
                  <Warehouse className="h-8 w-8 text-slate-300" />
                  {debounced
                    ? "No item matches the search."
                    : isMainSelected
                      ? "No stock in the shop yet."
                      : `Nothing in ${selected.name} yet. Moving stock between godowns comes with the next step, Godown transfer.`}
                </div>
              ) : (
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-slate-50">
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="w-[150px]">Barcode</TableHead>
                      <TableHead className="w-[120px] text-right">Qty</TableHead>
                      <TableHead className="w-[110px] text-right">Rate</TableHead>
                      <TableHead className="w-[120px] text-right">Value</TableHead>
                      <TableHead className="w-[120px] text-right">Shop stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.variant_id} className="text-sm">
                        <TableCell>
                          <div className="font-medium text-slate-800">{godownItemLabel(r)}</div>
                          {r.brand || r.category ? (
                            <div className="text-xs text-slate-400">{[r.brand, r.category].filter(Boolean).join(" · ")}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">{r.barcode || "—"}</TableCell>
                        <TableCell className={cn("text-right font-semibold tabular-nums", r.qty < 0 ? "text-red-600" : "text-slate-800")}>
                          {formatGodownQty(r.qty)} <span className="text-xs font-normal text-slate-400">{r.uom || ""}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-slate-600">{formatGodownValue(r.rate)}</TableCell>
                        <TableCell className="text-right tabular-nums text-slate-800">{formatGodownValue(r.stock_value)}</TableCell>
                        <TableCell className="text-right tabular-nums text-slate-400">{formatGodownQty(r.shop_qty)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            {total > 0 ? (
              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 bg-white px-3 py-1.5 text-xs text-slate-500">
                <span>
                  {total.toLocaleString("en-IN")} item{total === 1 ? "" : "s"}
                  {selectedSummary ? ` · ${formatGodownQty(selectedSummary.qty)} qty · ${formatGodownValue(selectedSummary.stock_value)}` : ""}
                </span>
                {pages > 1 ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0 || stock.isFetching}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="tabular-nums">
                      {page + 1} / {pages}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                      disabled={page >= pages - 1 || stock.isFetching}
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>
        ) : null}
      </div>

      {orgId ? (
        <GodownDialog
          open={dialog.open}
          onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
          organizationId={orgId}
          godown={dialog.godown}
          godowns={godowns}
          stockQty={dialog.godown ? summary.data?.get(dialog.godown.id)?.qty ?? 0 : 0}
          onSaved={(id) => {
            toast({ title: dialog.godown ? "Godown saved" : "Godown added" });
            if (!dialog.godown) setSelectedId(id);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}
