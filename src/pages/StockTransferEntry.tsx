import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeftRight, Barcode, ChevronLeft, Loader2, Search, Send, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { INSIGHTS_NEUTRAL_TH } from "@/components/business-insights/insightsLayout";
import { cn } from "@/lib/utils";
import { entryPageMainClass, entryPageSectionX, entryPageShellClass } from "@/lib/entryPageLayout";
import { invalidateStatusBarSummary } from "@/utils/invalidateDashboardQueries";
import { printStockTransferNote } from "@/utils/stockTransferPrint";
import {
  addScanToLines,
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

const TH = cn(INSIGHTS_NEUTRAL_TH, "h-11 !text-[13px]");

const StockTransferEntry = () => {
  const { currentOrganization, organizations, organizationRole } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();
  const isAdmin = organizationRole === "admin";

  const [toOrgId, setToOrgId] = useState<string>("");
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [notes, setNotes] = useState("");
  const [scan, setScan] = useState("");
  const [matches, setMatches] = useState<TransferScanVariant[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const { data: siblings = [], isLoading: siblingsLoading, isError: siblingsError } = useQuery({
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
      : siblings.find((s) => s.id === id)?.name ?? organizations.find((o) => o.id === id)?.name ?? "Other shop";

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
      return data as {
        transfer_id: string;
        transfer_number: string;
        total_qty: number;
        created_products: number;
        status?: string;
      };
    },
    onSuccess: (res) => {
      if (res.status === "pending") {
        toast.success(
          `Transfer ${res.transfer_number} sent: ${res.total_qty} pcs. ${shopName(toOrgId)} will see it as Receive in their Stock Transfer dashboard.`,
        );
      } else {
        const created = res.created_products ? `, ${res.created_products} new item(s) created there` : "";
        toast.success(`Transfer ${res.transfer_number} saved: ${res.total_qty} pcs sent to ${shopName(toOrgId)}${created}`);
      }
      setLines([]);
      setNotes("");
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      invalidateStatusBarSummary(queryClient, orgId);
      void printStockTransferNote(res.transfer_id, shopName);
    },
    onError: (e: Error) => {
      setConfirmOpen(false);
      toast.error(e.message || "Transfer failed");
    },
  });

  const blocker = !isAdmin
    ? "Only the shop owner/admin can send stock to another shop."
    : siblingsError
      ? "Stock Transfer is not set up on the database yet. Run the stock transfer SQL once, then reload this page."
      : !siblingsLoading && siblings.length === 0
        ? 'No other shop found for this login. In the other shop, open Organization Management, use Add Existing User with this login\'s email as Admin, then reload this page and pick the shop under "To shop".'
        : null;

  return (
    <div className={cn(entryPageShellClass, "bg-white sale-order-readable min-h-0 relative")} data-entry-form>
      <header className="bg-white border-b-2 border-black shrink-0 flex flex-col">
        <div className={cn("entry-page-header-row h-[52px] flex items-center gap-2", entryPageSectionX)}>
          <div className="entry-page-header-leading flex items-center gap-2 sm:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => orgNavigate("/stock-transfer")}
              className="h-8 shrink-0 text-black hover:text-black hover:bg-black/5 border border-black/20 text-xs gap-1.5 font-bold"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
            <div className="w-px h-6 bg-black/15 shrink-0" />
            <ArrowLeftRight className="h-5 w-5 text-black shrink-0" />
            <span className="text-black font-bold text-[15px] whitespace-nowrap hidden md:inline">Stock Transfer Entry</span>
            <span className="border-2 border-black text-black font-mono text-[11px] font-bold px-3 py-1 rounded-md shrink-0">
              NEW
            </span>
          </div>
        </div>
      </header>

      {blocker ? (
        <main className={entryPageMainClass}>
          <div className={cn("py-6 text-[15px] text-black/70 font-semibold", entryPageSectionX)}>{blocker}</div>
        </main>
      ) : (
        <main className={entryPageMainClass}>
          <section className={cn("bg-white border-b border-black/10 py-2 shrink-0 shadow-sm", entryPageSectionX)}>
            <div className="flex flex-wrap lg:flex-nowrap items-end gap-3">
              <div className="space-y-1 flex-1 min-w-[160px]">
                <Label className="text-[13px] font-bold text-black">From shop</Label>
                <Input
                  value={currentOrganization?.name ?? ""}
                  readOnly
                  className="h-10 bg-neutral-50 font-bold text-sm border-black/20"
                />
              </div>
              <div className="space-y-1 flex-[1.5] min-w-[180px]">
                <Label className="text-[13px] font-bold text-black">To shop</Label>
                <Select value={toOrgId} onValueChange={setToOrgId}>
                  <SelectTrigger className="h-10 border-black/20 text-sm font-semibold">
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
              <div className="space-y-1 flex-1 min-w-[140px]">
                <Label className="text-[13px] font-bold text-black">Transfer Date</Label>
                <Input
                  value={format(new Date(), "dd MMM yyyy")}
                  readOnly
                  className="h-10 bg-neutral-50 text-sm border-black/20"
                />
              </div>
              <div className="space-y-1 flex-[1.5] min-w-[180px]">
                <Label className="text-[13px] font-bold text-black">Notes</Label>
                <Textarea
                  placeholder="Notes (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={1}
                  className="min-h-[40px] h-10 resize-none border-black/20 text-sm"
                />
              </div>
            </div>
          </section>

          <section className={cn("bg-neutral-50 border-b border-black/10 py-3 shrink-0", entryPageSectionX)}>
            <form
              className="flex items-center gap-3 flex-wrap"
              onSubmit={(e) => {
                e.preventDefault();
                void handleScan();
              }}
            >
              <div className="relative flex-1 min-w-[280px]">
                <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40 pointer-events-none" />
                <Input
                  ref={scanRef}
                  type="text"
                  autoFocus
                  autoComplete="off"
                  placeholder="SCAN BARCODE OR TYPE ITEM NAME, THEN ENTER"
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setScan("");
                      setMatches([]);
                    }
                  }}
                  className="pl-10 h-10 text-sm bg-white border-black/20 uppercase font-semibold"
                />
                {matches.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-30 border border-black/20 rounded-md bg-white shadow-lg divide-y max-h-72 overflow-auto">
                    {matches.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-sky-50 flex justify-between gap-2"
                        onClick={() => addVariant(m)}
                      >
                        <span className="min-w-0">
                          <span className="font-bold text-[15px] text-black">{m.product_name}</span>{" "}
                          <span className="text-[13px] text-black/60">
                            {[m.size, m.color].filter(Boolean).join(" / ")} · {m.barcode || "no barcode"}
                          </span>
                        </span>
                        <span className="text-[13px] text-black/60 whitespace-nowrap">Stock {m.stock_qty}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button type="submit" className="h-10 px-5 bg-black text-white hover:bg-black/90 font-bold shrink-0">
                <Search className="h-4 w-4 mr-1" />
                Find
              </Button>
              <div className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg ml-auto shrink-0">
                <span className="text-[12px] font-bold opacity-80">Total Qty</span>
                <span className="font-black tabular-nums text-[16px]">{totals.qty}</span>
              </div>
            </form>
          </section>

          <section className={cn("flex-1 min-h-0 py-2 overflow-hidden bg-neutral-100 relative w-full min-w-0", entryPageSectionX)}>
            <div className="h-full w-full min-w-0 overflow-x-auto overflow-y-auto isolate rounded-lg border border-black/15 shadow-sm bg-white">
              {lines.length > 0 ? (
                <Table className="table-fixed w-full min-w-[900px] border-separate border-spacing-0 erp-desktop-table erp-entry-lines-table">
                  <TableHeader className="sticky top-0 z-10 [&_tr]:border-none">
                    <TableRow className="bg-slate-800 hover:bg-slate-800 border-none">
                      <TableHead className={cn(TH, "w-[48px] text-center")}>#</TableHead>
                      <TableHead className={cn(TH, "min-w-[200px]")}>Product</TableHead>
                      <TableHead className={cn(TH, "w-[80px] text-center")}>Size</TableHead>
                      <TableHead className={cn(TH, "w-[100px] text-center")}>Color</TableHead>
                      <TableHead className={cn(TH, "w-[130px] text-center")}>Barcode</TableHead>
                      <TableHead className={cn(TH, "w-[80px] text-right")}>Stock</TableHead>
                      <TableHead className={cn(TH, "w-[96px] text-center")}>Qty</TableHead>
                      <TableHead className={cn(TH, "w-[110px] text-right")}>Cost</TableHead>
                      <TableHead className={cn(TH, "w-[120px] text-right")}>Value</TableHead>
                      <TableHead className={cn(TH, "w-[48px]")} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l, index) => (
                      <TableRow key={l.id} className="border-b border-slate-100 hover:bg-sky-50/70 even:bg-slate-50/80">
                        <TableCell className="text-center text-black/60 font-mono !text-[15px] py-1.5">{index + 1}</TableCell>
                        <TableCell className="font-bold !text-[17px] text-black py-1.5 leading-snug">{l.product_name}</TableCell>
                        <TableCell className="text-center !text-[16px] font-mono font-semibold text-black py-1.5">{l.size || "-"}</TableCell>
                        <TableCell className="text-center !text-[16px] font-medium text-black py-1.5">{l.color || "-"}</TableCell>
                        <TableCell className="text-center !text-[15px] font-mono font-medium text-black/80 py-1.5">{l.barcode || "-"}</TableCell>
                        <TableCell className="text-right !text-[15px] font-mono text-black/70 py-1.5">{l.stock_qty}</TableCell>
                        <TableCell className="py-1">
                          <Input
                            type="number"
                            min={1}
                            max={l.stock_qty}
                            value={l.qty}
                            onChange={(e) => setLines(setLineQty(lines, l.id, Number(e.target.value)))}
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-[64px] h-8 mx-auto text-center text-sm border-black/20 font-mono"
                          />
                        </TableCell>
                        <TableCell className="text-right !text-[15px] font-mono font-semibold text-black py-1.5">
                          {money(Number(l.pur_price) || 0)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-[15px] font-mono tabular-nums text-black py-1.5">
                          {money(l.qty * (Number(l.pur_price) || 0))}
                        </TableCell>
                        <TableCell className="py-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 hover:bg-red-50"
                            onClick={() => setLines(lines.filter((x) => x.id !== l.id))}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-black/45">
                  <Search className="h-10 w-10 mb-3 opacity-40" />
                  <p className="text-sm font-semibold">Scan barcode or type an item name to add transfer lines</p>
                  <p className="text-xs mt-1">Stock leaves this shop when you send, and is added there when they accept</p>
                </div>
              )}
            </div>
          </section>
        </main>
      )}

      <footer className="entry-page-footer sale-order-footer shrink-0 relative z-40">
        <div className="bg-white text-black border-t-2 border-black w-full">
          <div className="flex items-center justify-between px-4 py-3 gap-4 w-full min-w-0 flex-wrap">
            <div className="flex items-center gap-3 shrink-0 text-[13px] font-bold text-black/70">
              {lines.length === 0 ? (
                <span>No items added yet</span>
              ) : (
                <span>
                  {lines.length} item{lines.length !== 1 ? "s" : ""} to {toOrgId ? shopName(toOrgId) : "…"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 shrink-0 ml-auto">
              <div className="hidden md:flex flex-col gap-0.5 pl-4 border-l border-black/15">
                <div className="flex items-center justify-between gap-3 min-w-[120px]">
                  <span className="text-[12px] uppercase tracking-wide font-extrabold text-black/70">Items</span>
                  <span className="text-[16px] font-extrabold tabular-nums">{lines.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3 min-w-[120px]">
                  <span className="text-[12px] uppercase tracking-wide font-extrabold text-black/70">Total Qty</span>
                  <span className="text-[16px] font-extrabold tabular-nums">{totals.qty}</span>
                </div>
              </div>
              <div className="pl-4 border-l-2 border-black flex flex-col items-end shrink-0">
                <span className="text-[13px] font-extrabold uppercase tracking-wide text-black underline underline-offset-2">
                  Value at cost
                </span>
                <span className="text-[36px] font-black font-mono tabular-nums leading-none text-black tracking-tighter">
                  {money(totals.value)}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-neutral-100 border-t border-black/10 flex flex-wrap items-center px-4 py-2.5 gap-x-3 gap-y-1.5">
          <div className="text-[13px] text-black/60 font-semibold flex-1 min-w-0">
            The other shop accepts this transfer from its Stock Transfer dashboard.
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              disabled={lines.length === 0}
              onClick={() => setLines([])}
              className="h-9 px-3 text-[13px] font-bold text-red-700 hover:bg-red-50 gap-1.5 border border-red-200"
            >
              <X className="h-4 w-4" />
              Clear
            </Button>
            <Button
              size="sm"
              disabled={!!blocker || lines.length === 0 || !toOrgId || saveMutation.isPending}
              onClick={() => setConfirmOpen(true)}
              className="h-9 px-5 text-[14px] bg-black text-white hover:bg-black/90 font-extrabold gap-1.5"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {saveMutation.isPending ? "Sending…" : "Send Transfer"}
            </Button>
          </div>
        </div>
      </footer>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send {totals.qty} pcs to {shopName(toOrgId)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Stock leaves this shop now. {shopName(toOrgId)} sees this transfer as Receive in its Stock Transfer
              dashboard, and the stock is added there when they accept it. If they reject it, the stock comes back here.
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
    </div>
  );
};

export default StockTransferEntry;
