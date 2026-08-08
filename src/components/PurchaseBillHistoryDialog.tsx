import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, History, CheckCircle2 } from "lucide-react";
import { ListSkeleton } from "@/components/ui/skeletons";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { fetchDocumentEditEvents } from "@/utils/documentHistoryEdits";

interface PurchaseBillHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billId: string | null | undefined;
  organizationId: string | null | undefined;
}

type TimelineType = "created" | "edited" | "payment" | "purchase_return" | "cancelled";

interface TimelineEntry {
  id: string;
  type: TimelineType;
  timestamp: string;
  icon: string;
  title: string;
  lines: string[];
}

const fmtMoney = (amount: number) =>
  `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatTimelineDate = (ts: string) => {
  try {
    return format(new Date(ts), "dd-MMM hh:mm a");
  } catch {
    return ts;
  }
};

const formatStatusLabel = (status: string | null | undefined) => {
  if (!status) return "-";
  const s = status.toLowerCase();
  if (s === "paid" || s === "completed") return "Paid";
  if (s === "partial") return "Partial";
  if (s === "unpaid" || s === "pending") return "Unpaid";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

export function PurchaseBillHistoryDialog({
  open,
  onOpenChange,
  billId,
  organizationId,
}: PurchaseBillHistoryDialogProps) {
  const isMobile = useIsMobile();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["purchase-bill-history", organizationId, billId],
    enabled: open && !!billId && !!organizationId,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const [billRes, vouchersRes, returnsRes, itemsRes] = await Promise.all([
        supabase
          .from("purchase_bills")
          .select(
            "id, software_bill_no, supplier_invoice_no, supplier_name, supplier_id, bill_date, bill_entry_at, net_amount, gross_amount, gst_amount, discount_amount, paid_amount, payment_status, total_qty, total_items, created_at, updated_at, is_cancelled, cancelled_at, cancelled_reason, is_dc_purchase, notes",
          )
          .eq("id", billId!)
          .eq("organization_id", organizationId!)
          .maybeSingle(),
        supabase
          .from("voucher_entries")
          .select(
            "id, voucher_number, voucher_date, total_amount, discount_amount, payment_method, description, created_at, reference_id, reference_type, voucher_type",
          )
          .eq("organization_id", organizationId!)
          .eq("reference_id", billId!)
          .eq("voucher_type", "payment")
          .is("deleted_at", null)
          .order("created_at", { ascending: true }),
        supabase
          .from("purchase_returns")
          .select("id, return_number, net_amount, created_at, return_date, credit_status")
          .eq("organization_id", organizationId!)
          .eq("linked_bill_id", billId!)
          .is("deleted_at", null)
          .order("created_at", { ascending: true }),
        supabase
          .from("purchase_items")
          .select(
            "id, product_name, size, barcode, qty, pur_price, sale_price, mrp, line_total, brand, color",
          )
          .eq("bill_id", billId!)
          .is("deleted_at", null)
          .order("line_number", { ascending: true }),
      ]);

      if (billRes.error) throw billRes.error;
      if (vouchersRes.error) throw vouchersRes.error;
      if (returnsRes.error) throw returnsRes.error;
      if (itemsRes.error) throw itemsRes.error;

      const bill = billRes.data;
      const vouchers = vouchersRes.data || [];
      const purchaseReturns = returnsRes.data || [];
      const items = itemsRes.data || [];

      const editEvents = bill
        ? await fetchDocumentEditEvents({
            organizationId: organizationId!,
            entityId: bill.id,
            entityTypes: ["purchase_bill", "purchase", "purchase_bills"],
            createdAt: bill.created_at,
            updatedAt: bill.updated_at,
            ignoreUpdatedNearTimestamps: [
              bill.cancelled_at || "",
              ...vouchers.map((v) => v.created_at || v.voucher_date || ""),
              ...purchaseReturns.map((r) => r.created_at || r.return_date || ""),
            ],
          })
        : [];

      return { bill, vouchers, purchaseReturns, items, editEvents };
    },
  });

  const timeline = useMemo((): TimelineEntry[] => {
    if (!data?.bill) return [];
    const { bill, vouchers, purchaseReturns, editEvents } = data;
    const entries: TimelineEntry[] = [];

    entries.push({
      id: `created-${bill.id}`,
      type: "created",
      timestamp: bill.bill_entry_at || bill.created_at,
      icon: "📋",
      title: "Purchase Bill Created",
      lines: [
        `Net Amount: ${fmtMoney(bill.net_amount || 0)}`,
        `Items: ${bill.total_items || 0} · Qty: ${bill.total_qty || 0}`,
        ...(bill.supplier_invoice_no ? [`Supplier Inv: ${bill.supplier_invoice_no}`] : []),
        ...(bill.is_dc_purchase ? ["Type: Delivery Challan Purchase"] : []),
      ],
    });

    for (const edit of editEvents || []) {
      entries.push({
        id: edit.id,
        type: "edited",
        timestamp: edit.timestamp,
        icon: "✏️",
        title: "Purchase Bill Edited",
        lines: edit.lines,
      });
    }

    for (const v of vouchers) {
      const lines = [
        `${v.voucher_number} — ${fmtMoney(v.total_amount || 0)}`,
      ];
      if (v.payment_method) {
        lines[0] = `${v.voucher_number} — ${String(v.payment_method).replace(/_/g, " ")} ${fmtMoney(v.total_amount || 0)}`;
      }
      if (v.description) lines.push(v.description);
      entries.push({
        id: `payment-${v.id}`,
        type: "payment",
        timestamp: v.created_at || v.voucher_date,
        icon: "💳",
        title: "Payment Made",
        lines,
      });
    }

    for (const pr of purchaseReturns) {
      entries.push({
        id: `return-${pr.id}`,
        type: "purchase_return",
        timestamp: pr.created_at || pr.return_date,
        icon: "🔄",
        title: "Purchase Return",
        lines: [
          `${pr.return_number || "P/R"} — ${fmtMoney(pr.net_amount || 0)}`,
          ...(pr.credit_status ? [`Status: ${formatStatusLabel(pr.credit_status)}`] : []),
        ],
      });
    }

    if (bill.is_cancelled) {
      entries.push({
        id: `cancelled-${bill.id}`,
        type: "cancelled",
        timestamp: bill.cancelled_at || bill.updated_at || bill.created_at,
        icon: "❌",
        title: "Purchase Bill Cancelled",
        lines: bill.cancelled_reason ? [bill.cancelled_reason] : ["Stock reversed"],
      });
    }

    return entries.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }, [data]);

  const balance = useMemo(() => {
    if (!data?.bill) return null;
    const bill = data.bill;
    const invoiceAmount = Number(bill.net_amount || 0);
    const paidFromVouchers = (data.vouchers || []).reduce(
      (sum, v) => sum + (Number(v.total_amount) || 0),
      0,
    );
    const paidAmount = Math.max(Number(bill.paid_amount) || 0, paidFromVouchers);
    const prAdjust = (data.purchaseReturns || []).reduce(
      (sum, r) => sum + (Number(r.net_amount) || 0),
      0,
    );
    const balanceDue = Math.max(0, invoiceAmount - paidAmount - prAdjust);
    return {
      invoiceAmount,
      paidAmount,
      prAdjust,
      balanceDue,
      settled: balanceDue <= 0.5,
      paymentStatus: formatStatusLabel(bill.payment_status),
    };
  }, [data]);

  const bill = data?.bill;
  const billLabel = bill?.software_bill_no || bill?.supplier_invoice_no || "Purchase Bill";

  const renderBody = () => {
    if (isLoading) {
      return (
        <div className="space-y-4 py-2" aria-busy="true">
          <ListSkeleton items={1} showIcon={false} className="rounded-lg border bg-muted/30 p-3" />
          <ListSkeleton items={5} showIcon={false} />
        </div>
      );
    }

    if (isError || !bill) {
      return (
        <p className="text-sm text-destructive text-center py-8">
          Could not load purchase bill history.
        </p>
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          <div>
            <span className="text-muted-foreground">Supplier: </span>
            <span className="font-medium">{bill.supplier_name || "-"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Date: </span>
            <span className="font-medium tabular-nums">
              {bill.bill_date ? format(new Date(bill.bill_date + "T12:00:00"), "dd/MM/yyyy") : "-"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Amount: </span>
            <span className="font-medium tabular-nums">{fmtMoney(bill.net_amount || 0)}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-muted-foreground">Status: </span>
            <Badge variant="outline" className="text-xs">
              {formatStatusLabel(bill.payment_status)}
            </Badge>
            {bill.is_cancelled && (
              <Badge variant="destructive" className="text-xs">
                Cancelled
              </Badge>
            )}
            {bill.is_dc_purchase && (
              <Badge variant="outline" className="text-xs border-orange-300 text-orange-700">
                DC
              </Badge>
            )}
          </div>
        </div>

        <Tabs defaultValue="history" className="w-full">
          <TabsList className="w-full grid grid-cols-4 h-9 mb-3">
            <TabsTrigger value="history" className="text-xs px-1">
              History
            </TabsTrigger>
            <TabsTrigger value="products" className="text-xs px-1">
              Products
            </TabsTrigger>
            <TabsTrigger value="payments" className="text-xs px-1">
              Payments
            </TabsTrigger>
            <TabsTrigger value="returns" className="text-xs px-1">
              Returns
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="mt-0">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Timeline
              </p>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No events recorded.</p>
              ) : (
                <div className="space-y-0">
                  {timeline.map((entry, idx) => (
                    <div key={entry.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className="text-lg leading-none" aria-hidden>
                          {entry.icon}
                        </span>
                        {idx < timeline.length - 1 && (
                          <div className="w-px flex-1 bg-border min-h-[1.5rem] my-1" />
                        )}
                      </div>
                      <div className="pb-4 flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          <span className="text-muted-foreground font-normal tabular-nums">
                            {formatTimelineDate(entry.timestamp)}
                          </span>{" "}
                          {entry.title}
                        </p>
                        {entry.lines.map((line, i) => (
                          <p key={i} className="text-xs text-muted-foreground mt-0.5 pl-0.5">
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {balance && (
              <>
                <Separator className="my-4" />
                <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Balance Summary
                  </p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bill Amount</span>
                    <span className="font-medium tabular-nums">{fmtMoney(balance.invoiceAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paid</span>
                    <span className="font-medium tabular-nums">{fmtMoney(balance.paidAmount)}</span>
                  </div>
                  {balance.prAdjust > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span>P/R Adjust</span>
                      <span className="font-medium tabular-nums">-{fmtMoney(balance.prAdjust)}</span>
                    </div>
                  )}
                  <Separator className="my-2" />
                  <div className="flex justify-between items-center font-semibold">
                    <span>Balance Due</span>
                    <span
                      className={cn(
                        "tabular-nums flex items-center gap-1",
                        balance.settled ? "text-green-600" : "text-red-600",
                      )}
                    >
                      {fmtMoney(balance.balanceDue)}
                      {balance.settled && (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-xs font-medium">Settled</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="products" className="mt-0">
            {data.items.length > 0 ? (
              <div className="border rounded-lg overflow-hidden overflow-x-auto">
                <table className="w-full text-xs min-w-[420px]">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="p-2 text-left font-medium">#</th>
                      <th className="p-2 text-left font-medium">Product</th>
                      <th className="p-2 text-left font-medium">Size</th>
                      <th className="p-2 text-right font-medium">Qty</th>
                      <th className="p-2 text-right font-medium">Pur</th>
                      <th className="p-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item, idx) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="p-2 text-muted-foreground">{idx + 1}</td>
                        <td className="p-2 font-medium min-w-0">
                          <div className="truncate max-w-[160px]">{item.product_name || "-"}</div>
                          {item.barcode && (
                            <div className="font-mono text-[10px] text-muted-foreground">
                              {item.barcode}
                            </div>
                          )}
                        </td>
                        <td className="p-2">{item.size || "-"}</td>
                        <td className="p-2 text-right tabular-nums">{item.qty}</td>
                        <td className="p-2 text-right tabular-nums">{fmtMoney(item.pur_price || 0)}</td>
                        <td className="p-2 text-right tabular-nums font-medium">
                          {fmtMoney(item.line_total || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8 text-sm">No products</p>
            )}
          </TabsContent>

          <TabsContent value="payments" className="mt-0">
            {data.vouchers.length > 0 ? (
              <div className="space-y-2">
                {data.vouchers.map((v) => (
                  <div key={v.id} className="border rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="font-mono font-semibold">{v.voucher_number}</span>
                      <span className="font-semibold tabular-nums text-emerald-700">
                        {fmtMoney(v.total_amount || 0)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatTimelineDate(v.created_at || v.voucher_date)}
                      {v.payment_method ? ` · ${v.payment_method}` : ""}
                    </div>
                    {v.description && (
                      <p className="text-xs text-muted-foreground">{v.description}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8 text-sm">No payments</p>
            )}
          </TabsContent>

          <TabsContent value="returns" className="mt-0">
            {data.purchaseReturns.length > 0 ? (
              <div className="space-y-2">
                {data.purchaseReturns.map((pr) => (
                  <div key={pr.id} className="border rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="font-mono font-semibold">{pr.return_number || "P/R"}</span>
                      <span className="font-semibold tabular-nums text-amber-700">
                        {fmtMoney(pr.net_amount || 0)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatTimelineDate(pr.created_at || pr.return_date)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8 text-sm">No purchase returns</p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    );
  };

  const titleText = bill ? `Bill ${billLabel} — History` : "Purchase Bill History";

  if (isMobile) {
    return (
      <div
        className={cn(
          "fixed inset-0 z-50 bg-background flex flex-col transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full pointer-events-none",
        )}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b px-3 py-3 flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center active:scale-90 transition-all touch-manipulation"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold truncate">{titleText}</h2>
            <p className="text-[11px] text-muted-foreground">Bill lifecycle & payments</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">{renderBody()}</div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw] h-[92vh] max-h-[92vh] overflow-hidden flex flex-col p-0">
        <div className="h-1 w-full bg-gradient-to-r from-primary via-blue-500 to-accent rounded-t-lg flex-shrink-0" />
        <div className="p-4 pb-0 flex-shrink-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <History className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="truncate">{titleText}</div>
                <DialogDescription className="text-xs font-normal mt-0.5">
                  Complete purchase bill lifecycle timeline
                </DialogDescription>
              </div>
            </DialogTitle>
          </DialogHeader>
        </div>
        <ScrollArea className="flex-1 min-h-0 px-4 pb-4">
          <div className="pr-3">{renderBody()}</div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
