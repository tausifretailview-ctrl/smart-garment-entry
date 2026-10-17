import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import { toast } from "sonner";
import { ArrowLeftRight, Ban, Printer, ScanBarcode, Search, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { appPrint } from "@/utils/appPrint";
import { invalidateStatusBarSummary } from "@/utils/invalidateDashboardQueries";
import {
  addScanToLines,
  buildTransferNoteHtml,
  setLineQty,
  transferTotals,
  type TransferLine,
  type TransferScanVariant,
} from "@/utils/stockTransfer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface SiblingShop {
  id: string;
  name: string;
  slug: string;
}

interface TransferRow {
  id: string;
  transfer_number: string;
  from_organization_id: string;
  to_organization_id: string;
  transfer_date: string;
  total_qty: number;
  total_value: number;
  notes: string | null;
  cancelled_at: string | null;
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

const VARIANT_SELECT =
  "id, barcode, size, color, stock_qty, pur_price, sale_price, products!inner(product_name, brand, product_type, deleted_at)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toScanVariant(row: any): TransferScanVariant {
  return {
    id: row.id,
    barcode: row.barcode,
    size: row.size,
    color: row.color,
    stock_qty: Number(row.stock_qty) || 0,
    pur_price: row.pur_price,
    sale_price: row.sale_price,
    product_name: row.products?.product_name ?? "",
    brand: row.products?.brand ?? null,
  };
}

const money = (n: number) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const StockTransfer = () => {
  const { currentOrganization, organizations, organizationRole } = useOrganization();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();
  const isAdmin = organizationRole === "admin";

  const [tab, setTab] = useState<"new" | "list">("new");
  const [toOrgId, setToOrgId] = useState<string>("");
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [notes, setNotes] = useState("");
  const [scan, setScan] = useState("");
  const [matches, setMatches] = useState<TransferScanVariant[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const [direction, setDirection] = useState<"all" | "out" | "in">("all");
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<TransferRow | null>(null);

  const { data: siblings = [], isLoading: siblingsLoading } = useQuery({
    queryKey: ["sibling-shops", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<SiblingShop[]> => {
      const { data, error } = await db.rpc("get_sibling_shops", { p_organization_id: orgId });
      if (error) throw error;
      return (data || []) as SiblingShop[];
    },
  });

  const shopName = (id: string) =>
    id === orgId
      ? currentOrganization?.name ?? "This shop"
      : siblings.find((s) => s.id === id)?.name ??
        organizations.find((o) => o.id === id)?.name ??
        "Other shop";

  const totals = useMemo(() => transferTotals(lines), [lines]);

  const addVariant = (v: TransferScanVariant) => {
    const r = addScanToLines(lines, v);
    if (!r.ok) {
      toast.error((r as { reason: string }).reason);
      return;
    }
    setLines(r.lines);
    setMatches([]);
    setScan("");
    scanRef.current?.focus();
  };

  const handleScan = async () => {
    const code = scan.trim();
    if (!code || !orgId) return;
    const { data, error } = await db
      .from("product_variants")
      .select(VARIANT_SELECT)
      .eq("organization_id", orgId)
      .eq("barcode", code)
      .is("deleted_at", null)
      .is("products.deleted_at", null)
      .limit(10);
    if (error) {
      toast.error(error.message);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rows = ((data || []) as any[]).filter((r) => !["service", "combo"].includes(r.products?.product_type));
    if (rows.length === 0 && code.length >= 2) {
      const { data: byName, error: nameErr } = await db
        .from("product_variants")
        .select(VARIANT_SELECT)
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .is("products.deleted_at", null)
        .ilike("products.product_name", `%${code}%`)
        .gt("stock_qty", 0)
        .limit(30);
      if (nameErr) {
        toast.error(nameErr.message);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows = ((byName || []) as any[]).filter((r) => !["service", "combo"].includes(r.products?.product_type));
    }
    if (rows.length === 0) {
      toast.error(`No item found for "${code}"`);
      setMatches([]);
      return;
    }
    if (rows.length === 1) {
      addVariant(toScanVariant(rows[0]));
      return;
    }
    setMatches(rows.map(toScanVariant));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("create_stock_transfer", {
        p_from_organization_id: orgId,
        p_to_organization_id: toOrgId,
        p_items: lines.map((l) => ({ variant_id: l.id, qty: l.qty })),
        p_notes: notes || null,
      });
      if (error) throw error;
      return data as { transfer_id: string; transfer_number: string; total_qty: number; created_products: number };
    },
    onSuccess: (res) => {
      const created = res.created_products ? `, ${res.created_products} new item(s) created there` : "";
      toast.success(`Transfer ${res.transfer_number} saved: ${res.total_qty} pcs sent to ${shopName(toOrgId)}${created}`);
      setLines([]);
      setNotes("");
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      invalidateStatusBarSummary(queryClient, orgId);
      void printTransfer(res.transfer_id);
    },
    onError: (e: Error) => {
      setConfirmOpen(false);
      toast.error(e.message || "Transfer failed");
    },
  });

  const { data: transfers = [], isLoading: transfersLoading } = useQuery({
    queryKey: ["stock-transfers", orgId, direction, fromDate, toDate],
    enabled: !!orgId && tab === "list",
    queryFn: async (): Promise<TransferRow[]> => {
      let q = db
        .from("stock_transfers")
        .select("id, transfer_number, from_organization_id, to_organization_id, transfer_date, total_qty, total_value, notes, cancelled_at")
        .gte("transfer_date", `${fromDate}T00:00:00`)
        .lte("transfer_date", `${toDate}T23:59:59.999`)
        .order("transfer_date", { ascending: false })
        .limit(500);
      if (direction === "out") q = q.eq("from_organization_id", orgId);
      else if (direction === "in") q = q.eq("to_organization_id", orgId);
      else q = q.or(`from_organization_id.eq.${orgId},to_organization_id.eq.${orgId}`);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as TransferRow[];
    },
  });

  const { data: expandedItems = [] } = useQuery({
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

  const listTotals = useMemo(() => {
    let outQty = 0, outValue = 0, inQty = 0, inValue = 0;
    for (const t of transfers) {
      if (t.cancelled_at) continue;
      if (t.from_organization_id === orgId) {
        outQty += Number(t.total_qty) || 0;
        outValue += Number(t.total_value) || 0;
      } else {
        inQty += Number(t.total_qty) || 0;
        inValue += Number(t.total_value) || 0;
      }
    }
    return { outQty, outValue, inQty, inValue };
  }, [transfers, orgId]);

  async function printTransfer(transferId: string) {
    const [{ data: t, error: tErr }, { data: items, error: iErr }] = await Promise.all([
      db.from("stock_transfers").select("*").eq("id", transferId).single(),
      db
        .from("stock_transfer_items")
        .select("product_name, barcode, size, color, qty, unit_cost, line_value")
        .eq("transfer_id", transferId)
        .order("created_at"),
    ]);
    if (tErr || iErr || !t) {
      toast.error("Could not load the transfer for printing");
      return;
    }
    const html = buildTransferNoteHtml({
      transfer_number: t.transfer_number,
      transfer_date: t.transfer_date,
      from_name: shopName(t.from_organization_id),
      to_name: shopName(t.to_organization_id),
      notes: t.notes,
      cancelled: !!t.cancelled_at,
      items: items || [],
    });
    const res = await appPrint({ type: "report", html, silent: false });
    if (!res.success && res.error) toast.error(res.error);
  }

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("cancel_stock_transfer", { p_transfer_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer cancelled and stock moved back");
      setCancelTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      invalidateStatusBarSummary(queryClient, orgId);
    },
    onError: (e: Error) => {
      setCancelTarget(null);
      toast.error(e.message || "Cancel failed");
    },
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <BackToDashboard />
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6" />
          Stock Transfer
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Send stock to your other shop. Stock leaves this shop and is added there at once.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "new" | "list")}>
        <TabsList>
          <TabsTrigger value="new">New Transfer</TabsTrigger>
          <TabsTrigger value="list">Transfer Report</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-4">
          {!isAdmin ? (
            <Card className="p-4 text-sm text-muted-foreground">Only the shop owner/admin can transfer stock.</Card>
          ) : !siblingsLoading && siblings.length === 0 ? (
            <Card className="p-4 text-sm text-muted-foreground">
              No other shop found. Stock can be sent to another shop where your login is also admin.
            </Card>
          ) : (
            <>
              <Card className="p-4 grid gap-3 md:grid-cols-[1fr_2fr]">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">From</div>
                  <div className="font-semibold">{currentOrganization?.name}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">To shop</div>
                  <Select value={toOrgId} onValueChange={setToOrgId}>
                    <SelectTrigger className="max-w-md">
                      <SelectValue placeholder={siblingsLoading ? "Loading…" : "Choose shop"} />
                    </SelectTrigger>
                    <SelectContent>
                      {siblings.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </Card>

              <Card className="p-4 space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <ScanBarcode className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      ref={scanRef}
                      autoFocus
                      className="pl-8"
                      placeholder="Scan barcode or type item name, then Enter"
                      value={scan}
                      onChange={(e) => setScan(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleScan();
                        }
                      }}
                    />
                  </div>
                  <Button variant="outline" onClick={() => void handleScan()}>
                    <Search className="h-4 w-4 mr-1" /> Find
                  </Button>
                </div>

                {matches.length > 0 && (
                  <div className="border rounded-md divide-y max-h-64 overflow-auto">
                    {matches.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted flex justify-between gap-2 text-sm"
                        onClick={() => addVariant(m)}
                      >
                        <span>
                          <span className="font-medium">{m.product_name}</span>{" "}
                          <span className="text-muted-foreground">
                            {[m.size, m.color].filter(Boolean).join(" / ")} · {m.barcode || "no barcode"}
                          </span>
                        </span>
                        <span className="text-muted-foreground whitespace-nowrap">Stock {m.stock_qty}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="border rounded-md overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="hidden md:table-cell">Barcode</TableHead>
                        <TableHead>Size / Colour</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right w-24">Qty</TableHead>
                        <TableHead className="text-right hidden md:table-cell">Cost</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            Scan items to add them here
                          </TableCell>
                        </TableRow>
                      ) : (
                        lines.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell className="font-medium">{l.product_name}</TableCell>
                            <TableCell className="hidden md:table-cell font-mono text-xs">{l.barcode || "-"}</TableCell>
                            <TableCell>{[l.size, l.color].filter(Boolean).join(" / ") || "-"}</TableCell>
                            <TableCell className="text-right">{l.stock_qty}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min={1}
                                max={l.stock_qty}
                                className="h-8 w-20 ml-auto text-right"
                                value={l.qty}
                                onChange={(e) => setLines(setLineQty(lines, l.id, Number(e.target.value)))}
                              />
                            </TableCell>
                            <TableCell className="text-right hidden md:table-cell">{money(Number(l.pur_price) || 0)}</TableCell>
                            <TableCell className="text-right">{money(l.qty * (Number(l.pur_price) || 0))}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setLines(lines.filter((x) => x.id !== l.id))}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm">
                    <span className="font-semibold">{lines.length}</span> items ·{" "}
                    <span className="font-semibold">{totals.qty}</span> pcs · Value at cost{" "}
                    <span className="font-semibold">{money(totals.value)}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" disabled={lines.length === 0} onClick={() => setLines([])}>
                      Clear
                    </Button>
                    <Button
                      disabled={lines.length === 0 || !toOrgId || saveMutation.isPending}
                      onClick={() => setConfirmOpen(true)}
                    >
                      <ArrowLeftRight className="h-4 w-4 mr-1" />
                      {saveMutation.isPending ? "Saving…" : "Save Transfer"}
                    </Button>
                  </div>
                </div>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="list" className="space-y-4">
          <Card className="p-4 flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Show</div>
              <Select value={direction} onValueChange={(v) => setDirection(v as "all" | "out" | "in")}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All transfers</SelectItem>
                  <SelectItem value="out">Transfer Out</SelectItem>
                  <SelectItem value="in">Transfer In</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">From</div>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">To</div>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" />
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Transfer Out</div>
              <div className="text-lg font-bold text-orange-600">
                {listTotals.outQty} pcs · {money(listTotals.outValue)}
              </div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Transfer In</div>
              <div className="text-lg font-bold text-green-600">
                {listTotals.inQty} pcs · {money(listTotals.inValue)}
              </div>
            </Card>
          </div>

          <div className="border rounded-md overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Transfer No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Other shop</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfersLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
                  </TableRow>
                ) : transfers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No transfers in this period</TableCell>
                  </TableRow>
                ) : (
                  transfers.flatMap((t) => {
                    const isOut = t.from_organization_id === orgId;
                    const open = expanded === t.id;
                    const row = (
                      <TableRow key={t.id} className={t.cancelled_at ? "opacity-60" : ""}>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(open ? null : t.id)}>
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                        <TableCell className="font-mono">{t.transfer_number}</TableCell>
                        <TableCell>{format(new Date(t.transfer_date), "dd MMM yyyy, hh:mm a")}</TableCell>
                        <TableCell>
                          {t.cancelled_at ? (
                            <Badge variant="outline">Cancelled</Badge>
                          ) : isOut ? (
                            <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">Out</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">In</Badge>
                          )}
                        </TableCell>
                        <TableCell>{shopName(isOut ? t.to_organization_id : t.from_organization_id)}</TableCell>
                        <TableCell className="text-right">{t.total_qty}</TableCell>
                        <TableCell className="text-right">{money(t.total_value)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button variant="ghost" size="sm" onClick={() => void printTransfer(t.id)}>
                            <Printer className="h-4 w-4" />
                          </Button>
                          {isAdmin && !t.cancelled_at && (
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setCancelTarget(t)}>
                              <Ban className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                    if (!open) return [row];
                    return [
                      row,
                      <TableRow key={`${t.id}-items`} className="bg-muted/40">
                        <TableCell />
                        <TableCell colSpan={7}>
                          <div className="space-y-1 text-sm">
                            {expandedItems.map((i) => (
                              <div key={i.id} className="flex justify-between gap-3">
                                <span>
                                  {i.product_name}{" "}
                                  <span className="text-muted-foreground">
                                    {[i.size, i.color].filter(Boolean).join(" / ")} · {i.barcode || "-"}
                                  </span>
                                  {i.created_in_destination && (
                                    <Badge variant="outline" className="ml-2 text-[10px]">new item created</Badge>
                                  )}
                                </span>
                                <span className="whitespace-nowrap">
                                  {i.qty} × {money(i.unit_cost)} = {money(i.line_value)}
                                </span>
                              </div>
                            ))}
                            {t.notes && <div className="text-muted-foreground">Notes: {t.notes}</div>}
                          </div>
                        </TableCell>
                      </TableRow>,
                    ];
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send {totals.qty} pcs to {shopName(toOrgId)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Stock will be reduced here and added in {shopName(toOrgId)} right away. Items that shop does not have yet
              will be created there with the same barcode.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction
              disabled={saveMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                saveMutation.mutate();
              }}
            >
              Send stock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel transfer {cancelTarget?.transfer_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The stock goes back to the sending shop. This only works while the receiving shop still has those pieces.
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
