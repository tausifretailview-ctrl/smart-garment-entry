import { Fragment, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Truck,
  Warehouse,
  XCircle,
} from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useTabCacheLayout } from "@/contexts/TabCacheLayoutContext";
import { useSharedAppShell } from "@/contexts/SharedAppShellContext";
import { useIndustrialMode } from "@/hooks/useIndustrialMode";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useSettings } from "@/hooks/useSettings";
import { useToast } from "@/hooks/use-toast";
import { ListTableSkeleton } from "@/components/skeletons/ListPageSkeleton";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { ymdToDdMmYyyy } from "@/lib/dateDisplay";
import { transferDateRange, type TransferDatePreset } from "@/utils/stockTransfer";
import { fetchGodowns, formatGodownQty, formatGodownValue, godownItemLabel } from "@/utils/godowns";
import {
  GODOWN_TRANSFER_PAGE,
  canCancelMove,
  cancelGodownTransfer,
  fetchGodownMoveItems,
  fetchGodownTransferStats,
  fetchGodownTransfers,
  transportOf,
  type GodownMoveRow,
  type GodownTransferFilters,
} from "@/utils/godownTransfer";
import { challanShopOf, printGodownTransferChallan } from "@/utils/godownTransferPrint";

const DATE_PRESETS: Array<{ id: TransferDatePreset; label: string }> = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "year", label: "This year (FY)" },
  { id: "all", label: "All dates" },
  { id: "custom", label: "Custom dates" },
];

/** Items of one transfer, read when its row is opened. */
function MoveItems({ moveId }: { moveId: string }) {
  const items = useQuery({ queryKey: ["godown-transfer-items", moveId], queryFn: () => fetchGodownMoveItems(moveId), staleTime: 5 * 60_000 });
  if (items.isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading items…
      </div>
    );
  }
  if (items.error) return <div className="px-4 py-3 text-xs text-red-700">{items.error instanceof Error ? items.error.message : "Could not read the items"}</div>;
  return (
    <div className="px-4 py-2">
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-slate-400">
          <tr>
            <th className="py-1 text-left font-semibold">Item</th>
            <th className="w-[120px] py-1 text-left font-semibold">Barcode</th>
            <th className="w-[80px] py-1 text-left font-semibold">HSN</th>
            <th className="w-[110px] py-1 text-right font-semibold">Qty</th>
            <th className="w-[100px] py-1 text-right font-semibold">Rate</th>
            <th className="w-[110px] py-1 text-right font-semibold">Value</th>
          </tr>
        </thead>
        <tbody>
          {(items.data ?? []).map((i) => (
            <tr key={i.variant_id} className="border-t border-slate-100">
              <td className="py-1 font-medium text-slate-700">{godownItemLabel(i)}</td>
              <td className="py-1 font-mono text-slate-500">{i.barcode || "—"}</td>
              <td className="py-1 font-mono text-slate-500">{i.hsn_code || "—"}</td>
              <td className="py-1 text-right tabular-nums text-slate-800">
                {formatGodownQty(i.qty)} <span className="text-slate-400">{i.uom || ""}</span>
              </td>
              <td className="py-1 text-right tabular-nums text-slate-500">{formatGodownValue(i.rate)}</td>
              <td className="py-1 text-right tabular-nums text-slate-800">{formatGodownValue(i.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Industrial mode, Phase 3 step 3b: every godown transfer, with challan print and cancel. */
export default function GodownTransfers() {
  const { currentOrganization, organizationRole } = useOrganization();
  const orgId = currentOrganization?.id ?? "";
  const industrialOn = useIndustrialMode().enabled;
  const canManage = organizationRole === "admin" || organizationRole === "manager";
  const { data: settings } = useSettings();
  const { orgNavigate } = useOrgNavigation();
  const inTabCache = useTabCacheLayout();
  const sharedShell = useSharedAppShell();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [preset, setPreset] = useState<TransferDatePreset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [godownId, setGodownId] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "done" | "cancelled">("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cancelRow, setCancelRow] = useState<GodownMoveRow | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [printingId, setPrintingId] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const range = useMemo(() => transferDateRange(preset, new Date(), { from: customFrom, to: customTo }), [preset, customFrom, customTo]);
  const filters: GodownTransferFilters = useMemo(
    () => ({ organizationId: orgId, range, godownId: godownId === "all" ? null : godownId, status, search: debounced }),
    [orgId, range, godownId, status, debounced],
  );
  useEffect(() => setPage(0), [filters]);

  const list = useQuery({
    queryKey: ["godowns", orgId],
    queryFn: () => fetchGodowns(orgId),
    enabled: !!orgId && industrialOn,
    staleTime: 60_000,
  });
  const godowns = useMemo(() => list.data?.godowns ?? [], [list.data]);
  const missingSql = !!list.data?.missingSql;
  const nameOf = (id: string) => godowns.find((g) => g.id === id)?.name ?? "Godown";

  const ready = !!orgId && industrialOn && !missingSql && !!list.data;
  const moves = useQuery({
    queryKey: ["godown-transfers", orgId, filters, page],
    queryFn: () => fetchGodownTransfers(filters, page),
    enabled: ready,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const stats = useQuery({
    queryKey: ["godown-transfer-stats", orgId, filters],
    queryFn: () => fetchGodownTransferStats(filters),
    enabled: ready,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const rows = moves.data?.rows ?? [];
  const total = moves.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / GODOWN_TRANSFER_PAGE));

  const refreshAll = () => {
    for (const key of ["godowns", "godown-summary", "godown-stock", "godown-transfers", "godown-transfer-stats"]) {
      void queryClient.invalidateQueries({ queryKey: [key, orgId] });
    }
  };

  const shop = challanShopOf(settings, currentOrganization?.name ?? "");
  const print = async (m: GodownMoveRow, allCopies: boolean) => {
    if (printingId) return;
    setPrintingId(m.id);
    try {
      await printGodownTransferChallan({ moveId: m.id, godowns, shop, allCopies });
    } catch (e) {
      toast({ variant: "destructive", title: "Could not print the challan", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setPrintingId(null);
    }
  };

  const confirmCancel = async () => {
    if (!cancelRow || cancelling) return;
    setCancelling(true);
    try {
      await cancelGodownTransfer(cancelRow.id);
      toast({ title: `Transfer ${cancelRow.move_no ?? ""} cancelled`, description: `The goods are back in ${nameOf(cancelRow.from_godown_id)}.` });
      setCancelRow(null);
      refreshAll();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not cancel", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setCancelling(false);
    }
  };

  if (!industrialOn) {
    return (
      <div className="flex h-full w-full items-start justify-center bg-slate-50 p-6">
        <Card className="max-w-lg border-slate-200 p-6 text-sm text-slate-600 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-800">
            <Warehouse className="h-5 w-5 text-teal-600" />
            Godown Transfers
          </div>
          Godowns are part of Industrial mode. Turn it on in Settings &gt; Product to keep stock in more than one place.
        </Card>
      </div>
    );
  }

  const stat = (label: string, value: string, tone = "text-slate-800") => (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums leading-tight", tone)}>{value}</div>
    </div>
  );

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
              Godown Transfers
            </h1>
            <p className="mt-1 text-sm text-slate-500">Goods moved between the godowns of this shop, with delivery challans</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" className="h-9 gap-1.5 border-slate-200 text-sm" onClick={() => orgNavigate("/godowns")}>
              <Warehouse className="h-4 w-4" />
              Godowns
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 border-slate-200 text-sm"
              onClick={refreshAll}
              disabled={moves.isFetching}
            >
              {moves.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
            {canManage ? (
              <Button
                size="sm"
                className="h-9 gap-1.5 bg-teal-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
                onClick={() => orgNavigate("/godown-transfer-entry")}
                disabled={missingSql || list.isLoading}
              >
                <Plus className="h-4 w-4" />
                Transfer
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

        <div className="grid shrink-0 grid-cols-3 gap-2 sm:max-w-xl">
          {stat("Transfers", stats.data ? stats.data.count.toLocaleString("en-IN") : "…")}
          {stat("Qty moved", stats.data ? formatGodownQty(stats.data.qty) : "…")}
          {stat("Value moved", stats.data ? formatGodownValue(stats.data.value) : "…", "text-teal-800")}
        </div>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 p-0 shadow-sm">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-3 py-2.5">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Transfer no or note…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="no-uppercase h-9 border-slate-200 bg-slate-50 pl-8 text-sm focus:bg-white"
              />
            </div>
            <Select value={preset} onValueChange={(v) => setPreset(v as TransferDatePreset)}>
              <SelectTrigger className="h-9 w-[150px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {preset === "custom" ? (
              <>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-[150px] text-sm" />
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-[150px] text-sm" />
              </>
            ) : null}
            <Select value={godownId} onValueChange={setGodownId}>
              <SelectTrigger className="h-9 w-[170px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All godowns</SelectItem>
                {godowns.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as "all" | "done" | "cancelled")}>
              <SelectTrigger className="h-9 w-[140px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {moves.isLoading || list.isLoading ? (
              <ListTableSkeleton />
            ) : moves.error ? (
              <div className="flex items-start gap-2 px-4 py-6 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {moves.error instanceof Error ? moves.error.message : "Could not read the transfers"}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center text-sm text-slate-500">
                <Truck className="h-8 w-8 text-slate-300" />
                {debounced || godownId !== "all" || status !== "all" ? "No transfer matches the filters." : "No godown transfers in these dates yet."}
                {canManage && !missingSql ? (
                  <Button size="sm" variant="outline" className="mt-1 gap-1.5" onClick={() => orgNavigate("/godown-transfer-entry")}>
                    <Plus className="h-4 w-4" />
                    New transfer
                  </Button>
                ) : null}
              </div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-slate-50">
                  <TableRow>
                    <TableHead className="w-[36px]" />
                    <TableHead className="w-[140px]">Transfer no</TableHead>
                    <TableHead className="w-[100px]">Date</TableHead>
                    <TableHead>From → To</TableHead>
                    <TableHead className="w-[70px] text-right">Items</TableHead>
                    <TableHead className="w-[110px] text-right">Qty</TableHead>
                    <TableHead className="w-[120px] text-right">Value</TableHead>
                    <TableHead className="w-[130px]">Vehicle</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[120px] text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((m) => {
                    const open = openId === m.id;
                    const t = transportOf(m.transport);
                    const cancelled = m.status === "cancelled";
                    return (
                      <Fragment key={m.id}>
                        <TableRow
                          className={cn("cursor-pointer text-sm", cancelled && "text-slate-400", open && "bg-teal-50/50")}
                          onClick={() => setOpenId(open ? null : m.id)}
                        >
                          <TableCell className="py-2">
                            {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                          </TableCell>
                          <TableCell className={cn("py-2 font-mono font-semibold", cancelled ? "line-through" : "text-slate-800")}>
                            {m.move_no || "—"}
                            {m.ref_type === "opening" ? <span className="ml-1 font-sans text-[10px] font-normal text-slate-400">opening</span> : null}
                          </TableCell>
                          <TableCell className="py-2 tabular-nums">{ymdToDdMmYyyy(m.move_date)}</TableCell>
                          <TableCell className="py-2">
                            <span className="font-medium">{nameOf(m.from_godown_id)}</span>
                            <ArrowRight className="mx-1.5 inline h-3.5 w-3.5 text-teal-600" />
                            <span className="font-medium">{nameOf(m.to_godown_id)}</span>
                            {m.note ? <div className="truncate text-xs text-slate-400">{m.note}</div> : null}
                          </TableCell>
                          <TableCell className="py-2 text-right tabular-nums">{m.item_count}</TableCell>
                          <TableCell className="py-2 text-right font-semibold tabular-nums">{formatGodownQty(m.total_qty)}</TableCell>
                          <TableCell className="py-2 text-right tabular-nums">{formatGodownValue(m.total_value)}</TableCell>
                          <TableCell className="py-2 font-mono text-xs">{t.vehicle_no || "—"}</TableCell>
                          <TableCell className="py-2">
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1",
                                cancelled ? "bg-slate-100 text-slate-500 ring-slate-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200",
                              )}
                            >
                              {cancelled ? "Cancelled" : "Done"}
                            </span>
                          </TableCell>
                          <TableCell className="py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" disabled={printingId === m.id}>
                                    {printingId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                                    Print
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => void print(m, false)}>Delivery challan</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => void print(m, true)}>Challan, 3 copies (Rule 55)</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              {canManage && canCancelMove(m) ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                  onClick={() => setCancelRow(m)}
                                  title="Cancel transfer"
                                  aria-label={`Cancel ${m.move_no ?? "transfer"}`}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                        {open ? (
                          <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                            <TableCell colSpan={10} className="p-0">
                              <MoveItems moveId={m.id} />
                              {t.transporter_name || t.lr_no ? (
                                <div className="px-4 pb-2 text-xs text-slate-500">
                                  Transport: {[t.transporter_name, t.lr_no ? `LR ${t.lr_no}` : ""].filter(Boolean).join(" · ")}
                                </div>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
          {total > 0 ? (
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 bg-white px-3 py-1.5 text-xs text-slate-500">
              <span>
                {total.toLocaleString("en-IN")} transfer{total === 1 ? "" : "s"}
              </span>
              {pages > 1 ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0 || moves.isFetching}
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
                    disabled={page >= pages - 1 || moves.isFetching}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>

      <AlertDialog open={!!cancelRow} onOpenChange={(o) => !o && !cancelling && setCancelRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel transfer {cancelRow?.move_no}?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelRow ? `${formatGodownQty(cancelRow.total_qty)} goes back from ${nameOf(cancelRow.to_godown_id)} to ${nameOf(cancelRow.from_godown_id)}. ` : ""}
              This works only while the goods are still in {cancelRow ? nameOf(cancelRow.to_godown_id) : "that godown"}. The transfer stays in the list marked
              Cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={cancelling}
              onClick={(e) => {
                e.preventDefault();
                void confirmCancel();
              }}
            >
              {cancelling ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Cancel transfer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
