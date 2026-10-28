import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowLeftRight,
  Ban,
  Barcode,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
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
import { ListTableSkeleton } from "@/components/skeletons/ListPageSkeleton";
import {
  INSIGHTS_BODY_CELL,
  INSIGHTS_BODY_CELL_NUM,
  INSIGHTS_BODY_ROW,
  InsightsKpiCard,
  InsightsPanel,
  InsightsStaticTh,
  InsightsTableHeader,
} from "@/components/business-insights/insightsLayout";
import { cn } from "@/lib/utils";
import { invalidateStatusBarSummary } from "@/utils/invalidateDashboardQueries";
import { printStockTransferNote } from "@/utils/stockTransferPrint";
import {
  filterTransfers,
  transferBarcodeItems,
  transferDateRange,
  transferKpis,
  transferStatus,
  transferTag,
  type ReceivedVariantForLabel,
  type TransferDatePreset,
  type TransferDirectionFilter,
  type TransferListRow,
  type TransferStatusFilter,
  type TransferTagTone,
} from "@/utils/stockTransfer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface TransferRow extends TransferListRow {
  reject_reason?: string | null;
}

interface TransferItemRow {
  id: string;
  product_name: string | null;
  barcode: string | null;
  size: string | null;
  color: string | null;
  qty: number;
  unit_cost: number;
  line_value: number;
  created_in_destination: boolean;
}

const money = (n: number) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TAG_CLASS: Record<TransferTagTone, string> = {
  receive: "bg-amber-500 text-white border-amber-600 animate-pulse motion-reduce:animate-none",
  waiting: "bg-sky-100 text-sky-800 border-sky-200",
  received: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

const DATE_PRESETS: Array<{ id: TransferDatePreset; label: string }> = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "year", label: "This year (FY)" },
  { id: "all", label: "All dates" },
  { id: "custom", label: "Custom dates" },
];

const STATUS_FILTERS: Array<{ id: TransferStatusFilter; label: string }> = [
  { id: "all", label: "All status" },
  { id: "receive", label: "Receive (to accept)" },
  { id: "waiting", label: "Waiting (sent)" },
  { id: "accepted", label: "Received" },
  { id: "rejected", label: "Rejected" },
  { id: "cancelled", label: "Cancelled" },
];

const TRANSFER_SELECT = "*";

const StockTransfer = () => {
  const { currentOrganization, organizations, organizationRole } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const orgId = currentOrganization?.id ?? "";
  const queryClient = useQueryClient();
  const isAdmin = organizationRole === "admin";
  const canReceive = organizationRole === "admin" || organizationRole === "manager";

  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState<TransferDatePreset>("month");
  const [customFrom, setCustomFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [status, setStatus] = useState<TransferStatusFilter>("all");
  const [direction, setDirection] = useState<TransferDirectionFilter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [acceptTarget, setAcceptTarget] = useState<TransferRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TransferRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [cancelTarget, setCancelTarget] = useState<TransferRow | null>(null);
  const [labelsLoading, setLabelsLoading] = useState<string | null>(null);

  const range = useMemo(
    () => transferDateRange(datePreset, new Date(), { from: customFrom, to: customTo }),
    [datePreset, customFrom, customTo],
  );

  const { data: shopNames = {} } = useQuery({
    queryKey: ["stock-transfer-shop-names", orgId],
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await db.rpc("get_stock_transfer_shop_names", { p_organization_id: orgId });
      if (error) return {};
      const out: Record<string, string> = {};
      for (const r of (data || []) as Array<{ id: string; name: string }>) out[r.id] = r.name;
      return out;
    },
  });

  const shopName = (id: string) =>
    id === orgId
      ? currentOrganization?.name ?? "This shop"
      : shopNames[id] ?? organizations.find((o) => o.id === id)?.name ?? "Other shop";

  const {
    data: transfers = [],
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["stock-transfers", orgId, range?.from ?? "", range?.to ?? ""],
    enabled: !!orgId,
    queryFn: async (): Promise<TransferRow[]> => {
      let q = db
        .from("stock_transfers")
        .select(TRANSFER_SELECT)
        .or(`from_organization_id.eq.${orgId},to_organization_id.eq.${orgId}`)
        .order("transfer_date", { ascending: false })
        .limit(1000);
      if (range) q = q.gte("transfer_date", `${range.from}T00:00:00`).lte("transfer_date", `${range.to}T23:59:59.999`);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data || []) as TransferRow[];

      // Transfers waiting for this shop always show, whatever the date filter.
      const { data: waiting } = await db
        .from("stock_transfers")
        .select(TRANSFER_SELECT)
        .eq("to_organization_id", orgId)
        .eq("status", "pending")
        .order("transfer_date", { ascending: false })
        .limit(200);
      const seen = new Set(rows.map((r) => r.id));
      const extra = ((waiting || []) as TransferRow[]).filter((r) => !seen.has(r.id));
      return [...extra, ...rows];
    },
  });

  const shown = useMemo(
    () => filterTransfers(transfers, { orgId, status, direction, search, shopName }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transfers, orgId, status, direction, search, shopNames, organizations],
  );
  const kpis = useMemo(() => transferKpis(transfers, orgId), [transfers, orgId]);

  const { data: expandedItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["stock-transfer-items", expanded],
    enabled: !!expanded,
    queryFn: async (): Promise<TransferItemRow[]> => {
      const { data, error } = await db
        .from("stock_transfer_items")
        .select("id, product_name, barcode, size, color, qty, unit_cost, line_value, created_in_destination")
        .eq("transfer_id", expanded)
        .order("created_at");
      if (error) throw error;
      return (data || []) as TransferItemRow[];
    },
  });

  const afterChange = () => {
    void queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
    void queryClient.invalidateQueries({ queryKey: ["stock-transfer-items"] });
    invalidateStatusBarSummary(queryClient, orgId);
  };

  const acceptMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await db.rpc("accept_stock_transfer", { p_transfer_id: id });
      if (error) throw error;
      return data as { transfer_number: string; total_qty: number; created_products: number };
    },
    onSuccess: (res) => {
      const created = res.created_products ? ` ${res.created_products} new item(s) were added to your products.` : "";
      toast.success(`Transfer ${res.transfer_number} received: ${res.total_qty} pcs added to stock.${created}`);
      setAcceptTarget(null);
      afterChange();
    },
    onError: (e: Error) => {
      setAcceptTarget(null);
      toast.error(e.message || "Accept failed");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await db.rpc("reject_stock_transfer", { p_transfer_id: id, p_reason: reason || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer rejected. The stock goes back to the sending shop.");
      setRejectTarget(null);
      setRejectReason("");
      afterChange();
    },
    onError: (e: Error) => {
      setRejectTarget(null);
      toast.error(e.message || "Reject failed");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("cancel_stock_transfer", { p_transfer_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer cancelled and stock moved back");
      setCancelTarget(null);
      afterChange();
    },
    onError: (e: Error) => {
      setCancelTarget(null);
      toast.error(e.message || "Cancel failed");
    },
  });

  async function printLabels(t: TransferRow) {
    setLabelsLoading(t.id);
    try {
      const { data: lines, error } = await db
        .from("stock_transfer_items")
        .select("to_variant_id, qty")
        .eq("transfer_id", t.id)
        .order("created_at");
      if (error) throw error;
      const ids = [...new Set(((lines || []) as Array<{ to_variant_id: string | null }>).map((l) => l.to_variant_id).filter(Boolean))];
      if (ids.length === 0) {
        toast.error("Accept the transfer first, then print barcodes");
        return;
      }
      const { data: variants, error: vErr } = await db
        .from("product_variants")
        .select("id, barcode, size, color, mrp, sale_price, pur_price, products(product_name, brand, category, style, color)")
        .in("id", ids);
      if (vErr) throw vErr;
      const purchaseItems = transferBarcodeItems(
        t.transfer_number,
        (lines || []) as Array<{ to_variant_id: string | null; qty: number }>,
        (variants || []) as ReceivedVariantForLabel[],
      );
      if (purchaseItems.length === 0) {
        toast.error("No items of this transfer were found in your shop");
        return;
      }
      orgNavigate("/barcode-printing", { state: { purchaseItems } });
    } catch (e) {
      toast.error((e as Error).message || "Could not load items for barcode printing");
    } finally {
      setLabelsLoading(null);
    }
  }

  return (
    <div className="business-insights-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Button variant="outline" size="sm" className="h-9 px-3 text-sm shrink-0" onClick={() => orgNavigate("/")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Dashboard
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 shrink-0" />
                Stock Transfer
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                Send stock to your other shop. The other shop accepts it here before it is added to their stock.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="h-9" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={cn("h-4 w-4 mr-1", isFetching && "animate-spin")} />
              Refresh
            </Button>
            {isAdmin && (
              <Button size="sm" className="h-9 bg-blue-600 hover:bg-blue-700" onClick={() => orgNavigate("/stock-transfer-entry")}>
                <Plus className="h-4 w-4 mr-1" />
                New Transfer
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 w-full shrink-0">
          <InsightsKpiCard
            label="To Receive"
            value={kpis.toReceive}
            tone={kpis.toReceive > 0 ? "attention" : "neutral"}
            sub={kpis.toReceive > 0 ? `${kpis.toReceiveQty} pcs waiting for you to accept` : "Nothing waiting"}
          />
          <InsightsKpiCard
            label="Waiting at other shop"
            value={kpis.waiting}
            tone="neutral"
            sub="Sent, not yet accepted"
          />
          <InsightsKpiCard label="Sent" value={kpis.sentQty} sub={`${money(kpis.sentValue)} at cost`} />
          <InsightsKpiCard
            label="Received"
            value={kpis.receivedQty}
            tone={kpis.receivedQty > 0 ? "positive" : "neutral"}
            sub={`${money(kpis.receivedValue)} at cost`}
          />
        </div>

        <InsightsPanel
          className="flex-1 min-h-0"
          title="Transfers"
          subtitle={isLoading ? "Loading…" : `${shown.length} shown`}
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search transfer no, shop, notes…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-8 text-sm border-slate-200 bg-white no-uppercase"
                />
              </div>
              <Select value={datePreset} onValueChange={(v) => setDatePreset(v as TransferDatePreset)}>
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
              {datePreset === "custom" && (
                <>
                  <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-[150px] text-sm" />
                  <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-[150px] text-sm" />
                </>
              )}
              <Select value={status} onValueChange={(v) => setStatus(v as TransferStatusFilter)}>
                <SelectTrigger className="h-9 w-[180px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={direction} onValueChange={(v) => setDirection(v as TransferDirectionFilter)}>
                <SelectTrigger className="h-9 w-[140px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Sent &amp; received</SelectItem>
                  <SelectItem value="out">Sent (out)</SelectItem>
                  <SelectItem value="in">Received (in)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        >
          {isLoading ? (
            <ListTableSkeleton rows={8} columns={9} className="py-2" />
          ) : isError ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              Could not load transfers. If Stock Transfer is new for this shop, run the stock transfer SQL once, then reload.
            </div>
          ) : shown.length === 0 ? (
            <div className="text-center py-10">
              <ArrowLeftRight className="h-10 w-10 mx-auto text-slate-300 mb-3" />
              <h3 className="text-sm font-bold text-slate-800 mb-1">No transfers</h3>
              <p className="text-xs text-muted-foreground">Change the date or status filter, or send a new transfer.</p>
            </div>
          ) : (
            <Table className="w-full min-w-[1050px]">
              <InsightsTableHeader>
                <InsightsStaticTh label="" className="w-10" />
                <InsightsStaticTh label="Transfer No" />
                <InsightsStaticTh label="Date" />
                <InsightsStaticTh label="Type" />
                <InsightsStaticTh label="From shop" />
                <InsightsStaticTh label="To shop" />
                <InsightsStaticTh label="Qty" className="text-right" />
                <InsightsStaticTh label="Value" className="text-right" />
                <InsightsStaticTh label="Status" />
                <InsightsStaticTh label="Actions" className="text-right" />
              </InsightsTableHeader>
              <TableBody>
                {shown.map((t) => {
                  const incoming = t.to_organization_id === orgId;
                  const st = transferStatus(t);
                  const tag = transferTag(st, incoming);
                  const open = expanded === t.id;
                  return (
                    <Fragment key={t.id}>
                      <TableRow
                        className={cn(
                          INSIGHTS_BODY_ROW,
                          (st === "cancelled" || st === "rejected") && "opacity-60",
                          st === "pending" && incoming && "bg-amber-50 even:bg-amber-50",
                        )}
                      >
                        <TableCell className={INSIGHTS_BODY_CELL}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setExpanded(open ? null : t.id)}
                            title="Show items"
                          >
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                        <TableCell className={cn(INSIGHTS_BODY_CELL, "font-mono font-bold text-blue-700 whitespace-nowrap")}>
                          {t.transfer_number}
                        </TableCell>
                        <TableCell className={cn(INSIGHTS_BODY_CELL, "whitespace-nowrap")}>
                          <div className="font-semibold">{format(new Date(t.transfer_date), "dd MMM yyyy")}</div>
                          <div className="text-xs text-muted-foreground">{format(new Date(t.transfer_date), "hh:mm a")}</div>
                        </TableCell>
                        <TableCell className={INSIGHTS_BODY_CELL}>
                          <span
                            className={cn(
                              "inline-block rounded px-2 py-0.5 text-xs font-bold",
                              incoming ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700",
                            )}
                          >
                            {incoming ? "IN" : "OUT"}
                          </span>
                        </TableCell>
                        <TableCell className={cn(INSIGHTS_BODY_CELL, "font-semibold")}>{shopName(t.from_organization_id)}</TableCell>
                        <TableCell className={cn(INSIGHTS_BODY_CELL, "font-semibold")}>{shopName(t.to_organization_id)}</TableCell>
                        <TableCell className={cn(INSIGHTS_BODY_CELL_NUM, "font-bold")}>{t.total_qty}</TableCell>
                        <TableCell className={INSIGHTS_BODY_CELL_NUM}>{money(t.total_value)}</TableCell>
                        <TableCell className={INSIGHTS_BODY_CELL}>
                          <span
                            className={cn(
                              "inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide",
                              TAG_CLASS[tag.tone],
                            )}
                          >
                            {tag.label}
                          </span>
                        </TableCell>
                        <TableCell className={cn(INSIGHTS_BODY_CELL, "text-right whitespace-nowrap")}>
                          {st === "pending" && incoming && canReceive && (
                            <>
                              <Button
                                size="sm"
                                className="h-8 bg-emerald-600 hover:bg-emerald-700 mr-1"
                                onClick={() => setAcceptTarget(t)}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-red-700 border-red-200 hover:bg-red-50 mr-1"
                                onClick={() => setRejectTarget(t)}
                              >
                                <X className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                          {st === "accepted" && incoming && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 mr-1"
                              onClick={() => void printLabels(t)}
                              disabled={labelsLoading === t.id}
                              title="Print barcode labels with this shop's name and label design"
                            >
                              {labelsLoading === t.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Barcode className="h-4 w-4 mr-1" />
                              )}
                              Barcode
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            title="Print transfer note"
                            onClick={() => void printStockTransferNote(t.id, shopName)}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          {isAdmin && !incoming && (st === "pending" || st === "accepted") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-destructive"
                              title="Cancel transfer"
                              onClick={() => setCancelTarget(t)}
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      {open && (
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableCell />
                          <TableCell colSpan={9} className="py-2 pr-4">
                            {itemsLoading ? (
                              <div className="text-sm text-muted-foreground">Loading items…</div>
                            ) : (
                              <div className="space-y-1">
                                {expandedItems.map((i) => (
                                  <div key={i.id} className="flex justify-between gap-3 text-[15px]">
                                    <span>
                                      <span className="font-bold">{i.product_name}</span>{" "}
                                      <span className="text-muted-foreground text-sm">
                                        {[i.size, i.color].filter(Boolean).join(" / ")} · {i.barcode || "-"}
                                      </span>
                                      {i.created_in_destination && (
                                        <span className="ml-2 rounded border px-1.5 text-[10px] font-semibold text-slate-600">
                                          new item created
                                        </span>
                                      )}
                                    </span>
                                    <span className="whitespace-nowrap tabular-nums">
                                      {i.qty} × {money(i.unit_cost)} = {money(i.line_value)}
                                    </span>
                                  </div>
                                ))}
                                {t.notes && <div className="text-sm text-muted-foreground">Notes: {t.notes}</div>}
                                {t.reject_reason && (
                                  <div className="text-sm text-red-700">Reject reason: {t.reject_reason}</div>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </InsightsPanel>
      </div>

      <AlertDialog open={!!acceptTarget} onOpenChange={(o) => !o && setAcceptTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Accept transfer {acceptTarget?.transfer_number} ({acceptTarget?.total_qty} pcs)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The stock is added to {currentOrganization?.name}. Items this shop does not have yet are created with the
              same barcode. Check the goods against the transfer note before accepting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction
              disabled={acceptMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (acceptTarget) acceptMutation.mutate(acceptTarget.id);
              }}
            >
              {acceptMutation.isPending ? "Accepting…" : "Accept stock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!rejectTarget}
        onOpenChange={(o) => {
          if (!o) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject transfer {rejectTarget?.transfer_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Nothing is added here, and the stock goes back to {rejectTarget ? shopName(rejectTarget.from_organization_id) : "the sending shop"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Reason (optional)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={2}
            className="no-uppercase"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={rejectMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (rejectTarget) rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason });
              }}
            >
              Reject transfer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel transfer {cancelTarget?.transfer_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget && transferStatus(cancelTarget) === "pending"
                ? "The other shop has not accepted it yet. The stock comes back to this shop."
                : "The stock goes back to this shop. This only works while the receiving shop still has those pieces."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (cancelTarget) cancelMutation.mutate(cancelTarget.id);
              }}
            >
              Cancel transfer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default StockTransfer;
