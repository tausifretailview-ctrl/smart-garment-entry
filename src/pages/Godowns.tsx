import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeftRight,
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
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
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
  godownCardStripe,
  godownItemLabel,
  godownStockExcelRows,
  godownTotals,
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
  const { orgNavigate } = useOrgNavigation();

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
  const godowns = useMemo(() => list.data?.godowns ?? [], [list.data]);
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

  const totals = useMemo(() => godownTotals(godowns, summary.data), [godowns, summary.data]);

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
  const canMove = canManage && godowns.filter((g) => g.is_active).length > 1;
  const pageStart = total === 0 ? 0 : page * GODOWN_STOCK_PAGE + 1;
  const pageEnd = Math.min(total, (page + 1) * GODOWN_STOCK_PAGE);
  const summaryText = (n: number, kind: "items" | "qty" | "value") =>
    summary.data ? (kind === "value" ? formatGodownValue(n) : kind === "qty" ? formatGodownQty(n) : n.toLocaleString("en-IN")) : "…";

  return (
    <div
      className={cn(
        "purchase-dashboard-workspace godowns-dashboard flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 px-2 py-2 sm:px-3",
        !inTabCache && !sharedShell && "h-[calc(100vh-3.5rem)]",
      )}
    >
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2">
        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-bold leading-none tracking-tight text-teal-700">
              <Warehouse className="h-5 w-5 shrink-0" />
              Godowns
            </h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              Stock in each place of this shop, on one GSTIN
              {godowns.length > 0 ? ` · ${godowns.length} place${godowns.length === 1 ? "" : "s"}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-sm"
              onClick={refresh}
              disabled={list.isFetching || summary.isFetching}
            >
              <RefreshCw className={cn("mr-1.5 h-4 w-4", (list.isFetching || summary.isFetching) && "animate-spin")} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-sm"
              onClick={() => orgNavigate("/godown-transfers")}
              disabled={missingSql}
            >
              <ArrowLeftRight className="mr-1.5 h-4 w-4" />
              Transfers
            </Button>
            {canManage ? (
              <Button
                size="sm"
                className="h-9 bg-teal-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
                onClick={() => setDialog({ open: true, godown: null })}
                disabled={missingSql || list.isLoading}
              >
                <Plus className="mr-1 h-4 w-4" />
                Godown
              </Button>
            ) : null}
          </div>
        </div>

        {missingSql ? (
          <div className="flex shrink-0 items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Run the Phase 3 step 3a SQL first: it adds the godown tables.
          </div>
        ) : null}
        {list.error ? (
          <div className="flex shrink-0 items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {list.error instanceof Error ? list.error.message : "Could not read the godowns"}
          </div>
        ) : null}

        {/* Totals strip */}
        {!missingSql && godowns.length > 0 ? (
          <div className="grid w-full shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="min-w-0 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-3 py-2 shadow-sm">
              <p className="text-xs font-medium leading-none text-white/80">Total stock value</p>
              <p className="mt-1 truncate text-base font-black leading-tight tabular-nums text-white sm:text-lg">
                {summaryText(totals.all.value, "value")}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-white/70">
                {summaryText(totals.all.items, "items")} item lines · {summaryText(totals.all.qty, "qty")} qty · at purchase rate
              </p>
            </div>
            <div className="min-w-0 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 px-3 py-2 shadow-sm">
              <p className="text-xs font-medium leading-none text-white/80">Main (shop)</p>
              <p className="mt-1 truncate text-base font-black leading-tight tabular-nums text-white sm:text-lg">
                {summaryText(totals.main.value, "value")}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-white/70">
                {summaryText(totals.main.items, "items")} item lines · {summaryText(totals.main.qty, "qty")} qty
              </p>
            </div>
            <div className="min-w-0 rounded-lg bg-gradient-to-br from-violet-500 to-violet-600 px-3 py-2 shadow-sm">
              <p className="text-xs font-medium leading-none text-white/80">
                In godowns ({totals.others.count.toLocaleString("en-IN")})
              </p>
              <p className="mt-1 truncate text-base font-black leading-tight tabular-nums text-white sm:text-lg">
                {summaryText(totals.others.value, "value")}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-white/70">
                {summaryText(totals.others.items, "items")} item lines · {summaryText(totals.others.qty, "qty")} qty
              </p>
            </div>
            <div
              className={cn(
                "min-w-0 rounded-lg bg-gradient-to-br px-3 py-2 shadow-sm",
                totals.shortItems > 0 ? "from-red-500 to-red-600" : "from-slate-600 to-slate-700",
              )}
            >
              <p className="text-xs font-medium leading-none text-white/80">Main below zero</p>
              <p className="mt-1 truncate text-base font-black leading-tight tabular-nums text-white sm:text-lg">
                {summary.data ? `${totals.shortItems.toLocaleString("en-IN")} item${totals.shortItems === 1 ? "" : "s"}` : "…"}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-white/70">
                {totals.shortItems > 0 ? "More sits in godowns than the shop has: check these" : "All good: nothing to check"}
              </p>
            </div>
          </div>
        ) : null}

        {/* Places */}
        {list.isLoading ? (
          <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[104px] animate-pulse rounded-lg border border-slate-200 bg-white" />
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
                  aria-pressed={active}
                  onClick={() => setSelectedId(g.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelectedId(g.id)}
                  className={cn(
                    "group relative cursor-pointer overflow-hidden rounded-lg border bg-white px-3 pb-2.5 pt-3 text-left shadow-sm transition-all hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500",
                    active ? "border-teal-500 ring-2 ring-teal-500/30" : "border-slate-200 hover:border-slate-300",
                    !g.is_active && "opacity-60",
                  )}
                >
                  <span className={cn("absolute inset-x-0 top-0 h-1", godownCardStripe(g.godown_type))} aria-hidden />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-base font-semibold text-slate-800">{g.name}</span>
                        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ring-1", info.badge)}>{info.label}</span>
                        {g.code ? <span className="font-mono text-[11px] text-slate-400">{g.code}</span> : null}
                        {!g.is_active ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500">Closed</span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{[g.address, g.pincode].filter(Boolean).join(" ") || "No address"}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {active ? (
                        <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Viewing</span>
                      ) : null}
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
                  </div>
                  <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2">
                    <div>
                      <div className="text-[11px] font-medium text-slate-500">Items</div>
                      <div className="text-base font-bold tabular-nums text-slate-800">
                        {s ? s.items.toLocaleString("en-IN") : summary.isLoading ? "…" : "0"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-slate-500">Qty</div>
                      <div className="text-base font-bold tabular-nums text-slate-800">{s ? formatGodownQty(s.qty) : summary.isLoading ? "…" : "0"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-slate-500">Value</div>
                      <div className="text-base font-bold tabular-nums text-teal-700">
                        {s ? formatGodownValue(s.stock_value) : summary.isLoading ? "…" : "₹0"}
                      </div>
                    </div>
                  </div>
                  {s && s.short_items > 0 ? (
                    <div className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                      <AlertTriangle className="h-3.5 w-3.5" />
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
                className="flex min-h-[104px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-teal-300 bg-teal-50/40 p-3 text-sm font-semibold text-teal-700 transition-colors hover:bg-teal-50"
              >
                <Plus className="h-5 w-5" />
                Add your first godown
                <span className="text-xs font-normal text-teal-600/80">Own godown, job worker or damaged goods</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Stock in the picked place */}
        {selected && !missingSql ? (
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 p-0 shadow-sm">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-3 py-2">
              <div className="mr-1 min-w-0">
                <div className="truncate text-base font-semibold text-slate-800">Stock in {selected.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {isMainSelected ? "Shop stock minus what is in other godowns" : godownTypeInfo(selected.godown_type).hint}
                </div>
              </div>
              <div className="relative min-w-[200px] max-w-lg flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search item, barcode, brand, colour…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="no-uppercase h-10 border-slate-200 bg-slate-50 pl-10 text-base focus:bg-white"
                />
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {canMove ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 border-teal-200 text-sm text-teal-700 hover:bg-teal-50"
                    onClick={() => orgNavigate(`/godown-transfer-entry?from=${encodeURIComponent(selected.id)}`)}
                    disabled={!isMainSelected && total === 0}
                  >
                    <ArrowLeftRight className="mr-1.5 h-4 w-4" />
                    Move stock
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-sm"
                  onClick={() => void exportExcel()}
                  disabled={exporting || total === 0}
                >
                  {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-4 w-4" />}
                  Export Excel
                </Button>
                <span className="pl-1 text-sm tabular-nums text-muted-foreground">
                  {stock.data ? `${total.toLocaleString("en-IN")} item${total === 1 ? "" : "s"}` : ""}
                </span>
              </div>
            </div>

            <div className="tab-scroll-stable min-h-0 flex-1 overflow-auto bg-white">
              {stock.isLoading ? (
                <ListTableSkeleton />
              ) : stock.error ? (
                <div className="flex items-start gap-2 px-4 py-6 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {stock.error instanceof Error ? stock.error.message : "Could not read the stock"}
                </div>
              ) : (
                <Table className="[&_td]:px-4 [&_th]:px-4">
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="border-none bg-slate-800 hover:bg-slate-800">
                      <TableHead className="h-10 w-[56px] text-xs font-bold uppercase tracking-wide text-white">Sr.</TableHead>
                      <TableHead className="h-10 text-xs font-bold uppercase tracking-wide text-white">Item</TableHead>
                      <TableHead className="h-10 w-[150px] text-xs font-bold uppercase tracking-wide text-white">Barcode</TableHead>
                      <TableHead className="h-10 w-[120px] text-right text-xs font-bold uppercase tracking-wide text-white">Qty</TableHead>
                      <TableHead className="h-10 w-[110px] text-right text-xs font-bold uppercase tracking-wide text-white">Rate</TableHead>
                      <TableHead className="h-10 w-[130px] text-right text-xs font-bold uppercase tracking-wide text-white">Value</TableHead>
                      <TableHead className="h-10 w-[120px] text-right text-xs font-bold uppercase tracking-wide text-white">Shop stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={7} className="h-40 text-center">
                          <div className="flex flex-col items-center justify-center gap-2 text-base text-muted-foreground">
                            <Warehouse className="h-8 w-8 text-slate-300" />
                            {debounced
                              ? "No item matches the search."
                              : isMainSelected
                                ? "No stock in the shop yet."
                                : `Nothing in ${selected.name} yet. Use Move stock on Main to send goods here.`}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((r, i) => (
                        <TableRow key={r.variant_id} className="h-11 hover:bg-teal-50/80 dark:hover:bg-teal-950/20">
                          <TableCell className="py-2.5 text-sm font-medium tabular-nums text-muted-foreground">
                            {page * GODOWN_STOCK_PAGE + i + 1}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <div className="text-base font-medium text-slate-800 dark:text-slate-100">{godownItemLabel(r)}</div>
                            {r.brand || r.category ? (
                              <div className="text-xs text-slate-500">{[r.brand, r.category].filter(Boolean).join(" · ")}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="py-2.5 font-mono text-sm text-slate-600 dark:text-slate-300">{r.barcode || "—"}</TableCell>
                          <TableCell
                            className={cn(
                              "py-2.5 text-right text-base font-semibold tabular-nums",
                              r.qty < 0 ? "text-red-600" : "text-slate-800 dark:text-slate-100",
                            )}
                          >
                            {formatGodownQty(r.qty)} <span className="text-xs font-normal text-slate-500">{r.uom || ""}</span>
                          </TableCell>
                          <TableCell className="py-2.5 text-right text-sm font-medium tabular-nums text-slate-600 dark:text-slate-300">
                            {formatGodownValue(r.rate)}
                          </TableCell>
                          <TableCell className="py-2.5 text-right text-base font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                            {formatGodownValue(r.stock_value)}
                          </TableCell>
                          <TableCell className="py-2.5 text-right text-sm font-medium tabular-nums text-slate-500">
                            {formatGodownQty(r.shop_qty)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
            {total > 0 ? (
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-white px-3 py-2">
                <p className="text-sm tabular-nums text-slate-600">
                  Showing {pageStart.toLocaleString("en-IN")}–{pageEnd.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}
                  {selectedSummary ? (
                    <span className="hidden text-slate-400 sm:inline">
                      {" "}
                      · {formatGodownQty(selectedSummary.qty)} qty · {formatGodownValue(selectedSummary.stock_value)}
                    </span>
                  ) : null}
                </p>
                {pages > 1 ? (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 border-slate-200 px-3 text-sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0 || stock.isFetching}
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Previous
                    </Button>
                    <span className="px-1 text-sm font-medium tabular-nums text-slate-700">
                      Page {page + 1} of {pages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 border-slate-200 px-3 text-sm"
                      onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                      disabled={page >= pages - 1 || stock.isFetching}
                    >
                      Next
                      <ChevronRight className="ml-1 h-4 w-4" />
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
