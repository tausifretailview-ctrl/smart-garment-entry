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
import { Loader2, ArrowLeft, History, CheckCircle2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  fetchSaleReceiptSplitsForInvoices,
  reconcileSaleInvoiceWithSplit,
  type SaleReceiptVoucherSplit,
} from "@/utils/customerBalanceUtils";

interface InvoiceHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string | null | undefined;
  organizationId: string | null | undefined;
}

type TimelineType =
  | "created"
  | "payment"
  | "sale_return"
  | "delivery"
  | "einvoice"
  | "cancelled";

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

const formatPaymentLabel = (method: string | null | undefined) => {
  const m = (method || "").toLowerCase();
  if (m === "advance_adjustment") return "Advance Adjustment";
  if (m === "credit_note_adjustment") return "Credit Note Adjustment";
  if (m === "pay_later") return "Pay Later";
  if (!m) return "-";
  return m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const formatStatusLabel = (status: string | null | undefined) => {
  if (!status) return "-";
  const s = status.toLowerCase();
  if (s === "completed") return "Paid";
  if (s === "partial") return "Partial";
  if (s === "pending") return "Pending";
  if (s === "hold") return "Hold";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const formatDeliveryLabel = (status: string | null | undefined) => {
  if (!status) return "-";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

export function InvoiceHistoryDialog({
  open,
  onOpenChange,
  saleId,
  organizationId,
}: InvoiceHistoryDialogProps) {
  const isMobile = useIsMobile();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["invoice-history", organizationId, saleId],
    enabled: open && !!saleId && !!organizationId,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const [saleRes, vouchersRes, returnsRes, deliveryRes, saleItemsRes] = await Promise.all([
        supabase
          .from("sales")
          .select(
            "id, sale_number, sale_date, customer_id, customer_name, net_amount, paid_amount, sale_return_adjust, payment_status, payment_method, delivery_status, shipping_address, created_at, updated_at, shop_name, irn, ack_no, einvoice_status, is_cancelled, cancelled_at, cancelled_reason"
          )
          .eq("id", saleId!)
          .eq("organization_id", organizationId!)
          .maybeSingle(),
        supabase
          .from("voucher_entries")
          .select(
            "id, voucher_number, voucher_date, total_amount, discount_amount, payment_method, description, created_at, reference_id, reference_type"
          )
          .eq("organization_id", organizationId!)
          .eq("reference_id", saleId!)
          .in("reference_type", ["sale", "customer"])
          .eq("voucher_type", "receipt")
          .is("deleted_at", null)
          .order("created_at", { ascending: true }),
        supabase
          .from("sale_returns")
          .select("id, return_number, net_amount, credit_status, created_at, return_date")
          .eq("organization_id", organizationId!)
          .eq("linked_sale_id", saleId!)
          .is("deleted_at", null)
          .order("created_at", { ascending: true }),
        supabase
          .from("delivery_tracking")
          .select("id, status, status_date, narration, created_at")
          .eq("organization_id", organizationId!)
          .eq("sale_id", saleId!)
          .order("created_at", { ascending: true }),
        supabase
          .from("sale_items")
          .select(
            "id, product_name, size, barcode, quantity, mrp, unit_price, discount_share, line_total, item_notes"
          )
          .eq("sale_id", saleId!)
          .is("deleted_at", null)
          .order("created_at", { ascending: true }),
      ]);

      if (saleRes.error) throw saleRes.error;
      if (vouchersRes.error) throw vouchersRes.error;
      if (returnsRes.error) throw returnsRes.error;
      if (deliveryRes.error) throw deliveryRes.error;
      if (saleItemsRes.error) throw saleItemsRes.error;

      const sale = saleRes.data;
      const directVouchers = vouchersRes.data || [];

      // Customer Payment usually stores receipts at customer level
      // (reference_type=customer, reference_id=customer uuid) with the invoice number in
      // the description — NOT reference_id=saleId. The narrow query above misses them, so
      // the timeline showed no payment and the balance summary wrongly read "Settled".
      // Pull customer-level receipts that name this invoice so they appear in the timeline.
      let customerVouchers: typeof directVouchers = [];
      const saleNumber = (sale?.sale_number || "").trim();
      if (sale?.customer_id && saleNumber) {
        const { data: custV, error: custErr } = await supabase
          .from("voucher_entries")
          .select(
            "id, voucher_number, voucher_date, total_amount, discount_amount, payment_method, description, created_at, reference_id, reference_type"
          )
          .eq("organization_id", organizationId!)
          .eq("reference_id", sale.customer_id)
          .eq("voucher_type", "receipt")
          .is("deleted_at", null)
          .ilike("description", `%${saleNumber}%`)
          .order("created_at", { ascending: true });
        if (custErr) throw custErr;
        customerVouchers = custV || [];
      }

      const seen = new Set(directVouchers.map((v) => v.id));
      const vouchers = [
        ...directVouchers,
        ...customerVouchers.filter((v) => !seen.has(v.id)),
      ];

      // Authoritative per-invoice settlement split — matches Sales Invoice Dashboard and
      // Customer Ledger (handles sale-linked + customer-level receipts, cash vs CN/advance).
      let split: SaleReceiptVoucherSplit = { cash: 0, cn: 0, adv: 0, discount: 0 };
      if (sale) {
        const splitMap = await fetchSaleReceiptSplitsForInvoices(supabase, organizationId!, [
          { id: sale.id, sale_number: sale.sale_number, customer_id: sale.customer_id },
        ]);
        split = splitMap.get(sale.id) ?? split;
      }

      return {
        sale,
        vouchers,
        split,
        saleReturns: returnsRes.data || [],
        deliveryHistory: deliveryRes.data || [],
        saleItems: saleItemsRes.data || [],
      };
    },
  });

  const timeline = useMemo((): TimelineEntry[] => {
    if (!data?.sale) return [];
    const { sale, vouchers, saleReturns, deliveryHistory } = data;
    const entries: TimelineEntry[] = [];

    const srLines: string[] = [];
    if ((sale.sale_return_adjust || 0) > 0) {
      if (saleReturns.length > 0) {
        const refs = saleReturns
          .map((r) => `${r.return_number || "SR"} — ${fmtMoney(r.net_amount || 0)}`)
          .join(", ");
        srLines.push(`S/R Adjust: ${fmtMoney(sale.sale_return_adjust || 0)} (${refs})`);
      } else {
        srLines.push(`S/R Adjust: ${fmtMoney(sale.sale_return_adjust || 0)}`);
      }
    }

    entries.push({
      id: `created-${sale.id}`,
      type: "created",
      timestamp: sale.created_at,
      icon: "📋",
      title: "Invoice Created",
      lines: [
        `Net Amount: ${fmtMoney(sale.net_amount || 0)}`,
        ...srLines,
        `Payment: ${formatPaymentLabel(sale.payment_method)}`,
        ...(sale.shop_name ? [`Shop: ${sale.shop_name}`] : []),
      ],
    });

    for (const v of vouchers) {
      const pm = (v.payment_method || "").toLowerCase();
      const lines = [
        `${v.voucher_number} — ${formatPaymentLabel(v.payment_method)} ${fmtMoney(v.total_amount || 0)}`,
      ];
      if ((v.discount_amount || 0) > 0) {
        lines.push(`Discount: ${fmtMoney(v.discount_amount || 0)}`);
      }
      if (v.description) {
        lines.push(v.description);
      }
      entries.push({
        id: `payment-${v.id}`,
        type: "payment",
        timestamp: v.created_at || v.voucher_date,
        icon: pm === "advance_adjustment" || pm === "credit_note_adjustment" ? "💳" : "💳",
        title: "Payment Received",
        lines,
      });
    }

    for (const sr of saleReturns) {
      entries.push({
        id: `return-${sr.id}`,
        type: "sale_return",
        timestamp: sr.created_at || sr.return_date,
        icon: "🔄",
        title: "Sale Return Adjusted",
        lines: [
          `${sr.return_number || "Sale Return"} — ${fmtMoney(sr.net_amount || 0)}`,
          `Credit Status: ${formatStatusLabel(sr.credit_status)}`,
        ],
      });
    }

    if (deliveryHistory.length > 0) {
      for (const d of deliveryHistory) {
        const lines = [`Status: ${formatDeliveryLabel(d.status)}`];
        if (d.narration) lines.push(d.narration);
        entries.push({
          id: `delivery-${d.id}`,
          type: "delivery",
          timestamp: d.created_at || d.status_date,
          icon: "📦",
          title: "Delivery Updated",
          lines,
        });
      }
    } else if (sale.delivery_status && sale.delivery_status !== "undelivered") {
      entries.push({
        id: `delivery-sale-${sale.id}`,
        type: "delivery",
        timestamp: sale.updated_at || sale.created_at,
        icon: "📦",
        title: "Delivery Updated",
        lines: [`Status: ${formatDeliveryLabel(sale.delivery_status)}`],
      });
    }

    if (sale.irn) {
      entries.push({
        id: `einvoice-${sale.id}`,
        type: "einvoice",
        timestamp: sale.updated_at || sale.created_at,
        icon: "📄",
        title: "E-Invoice Generated",
        lines: [
          `IRN: ${sale.irn}`,
          ...(sale.ack_no ? [`Ack No: ${sale.ack_no}`] : []),
          ...(sale.einvoice_status ? [`Status: ${sale.einvoice_status}`] : []),
        ],
      });
    }

    if (sale.is_cancelled) {
      entries.push({
        id: `cancelled-${sale.id}`,
        type: "cancelled",
        timestamp: sale.cancelled_at || sale.updated_at || sale.created_at,
        icon: "❌",
        title: "Invoice Cancelled",
        lines: sale.cancelled_reason ? [sale.cancelled_reason] : [],
      });
    }

    return entries.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [data]);

  const reconciled = useMemo(() => {
    if (!data?.sale) return null;
    const sale = data.sale;
    const split = data.split ?? { cash: 0, cn: 0, adv: 0, discount: 0 };
    // Merchandise gross (Σ mrp × qty) enables the pre-return S/R subtraction guard so a
    // full-bill invoice settled by an applied return reads Balance Due ₹0 (matches the
    // Sales Dashboard / Customer Ledger). No-op for post-return / exchange invoices.
    const itemsGross = (data.saleItems || []).reduce(
      (sum: number, it: any) => sum + (Number(it.quantity) || 0) * (Number(it.mrp) || 0),
      0,
    );
    const rec = reconcileSaleInvoiceWithSplit(
      {
        net_amount: Number(sale.net_amount || 0),
        sale_return_adjust: Number(sale.sale_return_adjust || 0),
        paid_amount: Number(sale.paid_amount || 0),
        items_gross: itemsGross,
      },
      split,
    );
    return {
      invoiceAmount: Number(sale.net_amount || 0),
      srAdjust: Number(sale.sale_return_adjust || 0),
      cashPaid: split.cash,
      advancePaid: split.adv,
      cnPaid: split.cn,
      discount: split.discount,
      balanceDue: rec.outstanding,
      displayPaid: rec.paid_amount,
      paymentStatus: rec.payment_status,
      settled: rec.outstanding <= 0.01,
    };
  }, [data]);

  const sale = data?.sale;

  const renderBody = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (isError || !sale) {
      return (
        <p className="text-center text-muted-foreground py-12">
          Could not load invoice history.
        </p>
      );
    }

    return (
      <div className="space-y-4">
        {/* Header summary */}
        <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">Customer:</span>{" "}
            <span className="font-medium">{sale.customer_name || "Walk-in"}</span>
            <span className="text-muted-foreground mx-2">|</span>
            <span className="text-muted-foreground">Date:</span>{" "}
            <span className="font-medium">
              {sale.sale_date ? format(new Date(sale.sale_date), "dd/MM/yyyy") : "-"}
            </span>
          </p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              <span className="text-muted-foreground">Amount:</span>{" "}
              <span className="font-semibold">{fmtMoney(sale.net_amount || 0)}</span>
            </span>
            <span className="text-muted-foreground">|</span>
            <span>
              <span className="text-muted-foreground">Status:</span>{" "}
              <Badge
                variant="secondary"
                className={cn(
                  "text-xs h-5",
                  reconciled?.paymentStatus === "completed" && "bg-green-100 text-green-800",
                  reconciled?.paymentStatus === "partial" && "bg-orange-100 text-orange-800"
                )}
              >
                {formatStatusLabel(reconciled?.paymentStatus ?? sale.payment_status)}
              </Badge>
            </span>
            <span className="text-muted-foreground">|</span>
            <span>
              <span className="text-muted-foreground">Delivery:</span>{" "}
              <Badge variant="outline" className="text-xs h-5 capitalize">
                {formatDeliveryLabel(sale.delivery_status)}
              </Badge>
            </span>
            {sale.is_cancelled && (
              <Badge variant="destructive" className="text-xs h-5">
                Cancelled
              </Badge>
            )}
          </p>
        </div>

        <Tabs defaultValue="history" className="w-full">
          <TabsList className="w-full grid grid-cols-5 h-9 mb-3">
            <TabsTrigger value="history" className="text-xs px-1">
              History
            </TabsTrigger>
            <TabsTrigger value="products" className="text-xs px-1">
              Products
            </TabsTrigger>
            <TabsTrigger value="receipts" className="text-xs px-1">
              Receipts
            </TabsTrigger>
            <TabsTrigger value="creditnote" className="text-xs px-1">
              Credit Note
            </TabsTrigger>
            <TabsTrigger value="shipping" className="text-xs px-1">
              Shipping
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

            {reconciled && (
              <>
                <Separator className="my-4" />
                <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Balance Summary
                  </p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Invoice Amount</span>
                    <span className="font-medium tabular-nums">
                      {fmtMoney(reconciled.invoiceAmount)}
                    </span>
                  </div>
                  {reconciled.srAdjust > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span>S/R Adjust</span>
                      <span className="font-medium tabular-nums">
                        -{fmtMoney(reconciled.srAdjust)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cash / UPI / Card</span>
                    <span className="font-medium tabular-nums">{fmtMoney(reconciled.cashPaid)}</span>
                  </div>
                  {reconciled.advancePaid > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Advance Applied</span>
                      <span className="font-medium tabular-nums">
                        {fmtMoney(reconciled.advancePaid)}
                      </span>
                    </div>
                  )}
                  {reconciled.cnPaid > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Credit Note Applied</span>
                      <span className="font-medium tabular-nums">{fmtMoney(reconciled.cnPaid)}</span>
                    </div>
                  )}
                  {reconciled.discount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Receipt Discount</span>
                      <span className="font-medium tabular-nums">{fmtMoney(reconciled.discount)}</span>
                    </div>
                  )}
                  <Separator className="my-2" />
                  <div className="flex justify-between items-center font-semibold">
                    <span>Balance Due</span>
                    <span
                      className={cn(
                        "tabular-nums flex items-center gap-1",
                        reconciled.settled ? "text-green-600" : "text-red-600"
                      )}
                    >
                      {fmtMoney(reconciled.balanceDue)}
                      {reconciled.settled && (
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
            {data.saleItems.length > 0 ? (
              <div className="border rounded-lg overflow-hidden overflow-x-auto">
                <table className="w-full text-xs min-w-[420px]">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="p-2 text-left font-medium">#</th>
                      <th className="p-2 text-left font-medium">Product</th>
                      <th className="p-2 text-left font-medium">Size</th>
                      <th className="p-2 text-right font-medium">Qty</th>
                      <th className="p-2 text-right font-medium">Price</th>
                      <th className="p-2 text-right font-medium">Disc</th>
                      <th className="p-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.saleItems.map((item, i) => (
                      <tr key={item.id} className="border-b last:border-b-0">
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2">
                          <div className="font-medium">{item.product_name}</div>
                          {item.barcode && (
                            <div className="text-[10px] text-muted-foreground">BC: {item.barcode}</div>
                          )}
                          {item.item_notes && (
                            <div className="text-[10px] text-blue-600 italic">{item.item_notes}</div>
                          )}
                        </td>
                        <td className="p-2">{item.size || "-"}</td>
                        <td className="p-2 text-right">{item.quantity}</td>
                        <td className="p-2 text-right">{fmtMoney(item.unit_price || 0)}</td>
                        <td className="p-2 text-right">
                          {item.discount_share ? fmtMoney(item.discount_share) : "-"}
                        </td>
                        <td className="p-2 text-right font-medium">
                          {fmtMoney(item.line_total || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30 font-medium">
                      <td colSpan={3} className="p-2 text-right">
                        Total
                      </td>
                      <td className="p-2 text-right">
                        {data.saleItems.reduce((s, i) => s + (i.quantity || 0), 0)}
                      </td>
                      <td className="p-2" />
                      <td className="p-2" />
                      <td className="p-2 text-right">
                        {fmtMoney(data.saleItems.reduce((s, i) => s + (i.line_total || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8 text-sm">
                No product details available
              </p>
            )}
          </TabsContent>

          <TabsContent value="receipts" className="mt-0">
            {data.vouchers.length > 0 ? (
              <div className="space-y-2">
                {data.vouchers.map((v) => (
                  <div
                    key={v.id}
                    className="border rounded-lg p-3 text-xs flex justify-between items-center gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{v.voucher_number}</div>
                      <div className="text-muted-foreground">
                        {formatTimelineDate(v.voucher_date || v.created_at || "")}
                      </div>
                      <div className="text-muted-foreground">
                        {formatPaymentLabel(v.payment_method)}
                      </div>
                      {v.description && (
                        <div className="text-[10px] text-muted-foreground mt-0.5 italic truncate">
                          {v.description}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-emerald-600">
                        {fmtMoney(v.total_amount || 0)}
                      </div>
                      {(v.discount_amount || 0) > 0 && (
                        <div className="text-[10px] text-amber-600">
                          Discount: {fmtMoney(v.discount_amount || 0)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div className="border-t pt-2 flex justify-between text-sm font-medium">
                  <span>Total Received</span>
                  <span className="text-emerald-700">
                    {fmtMoney(
                      data.vouchers.reduce(
                        (s, v) => s + (v.total_amount || 0) + (v.discount_amount || 0),
                        0
                      )
                    )}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8 text-sm">No payments recorded</p>
            )}
          </TabsContent>

          <TabsContent value="creditnote" className="mt-0">
            {data.saleReturns.length > 0 ? (
              <div className="space-y-2">
                {data.saleReturns.map((sr) => (
                  <div
                    key={sr.id}
                    className="border rounded-lg p-3 text-xs flex justify-between items-center gap-3"
                  >
                    <div>
                      <div className="font-medium">{sr.return_number || "Sale Return"}</div>
                      <div className="text-muted-foreground">
                        {formatTimelineDate(sr.return_date || sr.created_at || "")}
                      </div>
                      <Badge variant="outline" className="text-[10px] mt-1 capitalize">
                        {(sr.credit_status || "").replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <div className="font-bold text-amber-600 shrink-0">
                      {fmtMoney(sr.net_amount || 0)}
                    </div>
                  </div>
                ))}
                {(sale.sale_return_adjust || 0) > 0 && (
                  <div className="border-t pt-2 flex justify-between text-sm font-medium text-amber-700">
                    <span>Total S/R Adjust on Invoice</span>
                    <span>{fmtMoney(sale.sale_return_adjust || 0)}</span>
                  </div>
                )}
              </div>
            ) : (sale.sale_return_adjust || 0) > 0 ? (
              <div className="border rounded-lg p-3 text-sm">
                <span className="text-muted-foreground">S/R Adjust on this invoice: </span>
                <span className="font-semibold text-amber-700">
                  {fmtMoney(sale.sale_return_adjust || 0)}
                </span>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8 text-sm">No credit notes</p>
            )}
          </TabsContent>

          <TabsContent value="shipping" className="mt-0">
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Delivery Status: </span>
                <Badge variant="outline" className="capitalize">
                  {formatDeliveryLabel(sale.delivery_status)}
                </Badge>
              </div>
              {sale.shipping_address && (
                <div>
                  <span className="text-muted-foreground">Shipping Address:</span>
                  <p className="mt-1 text-sm border rounded p-2 bg-muted/20 whitespace-pre-wrap">
                    {sale.shipping_address}
                  </p>
                </div>
              )}
              {data.deliveryHistory.length > 0 && (
                <div className="space-y-2 mt-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase">
                    Tracking History
                  </span>
                  {data.deliveryHistory.map((d) => (
                    <div key={d.id} className="border-l-2 border-blue-300 pl-3 py-1 text-xs">
                      <div className="font-medium">{formatDeliveryLabel(d.status)}</div>
                      <div className="text-muted-foreground">
                        {formatTimelineDate(d.status_date || d.created_at || "")}
                      </div>
                      {d.narration && (
                        <div className="text-muted-foreground italic">{d.narration}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {!sale.shipping_address && data.deliveryHistory.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No shipping details</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    );
  };

  const titleText = sale
    ? `Invoice ${sale.sale_number} — History`
    : "Invoice History";

  if (isMobile) {
    return (
      <div
        className={cn(
          "fixed inset-0 z-50 bg-background flex flex-col transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full pointer-events-none"
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
            <p className="text-[11px] text-muted-foreground">Invoice lifecycle & payments</p>
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
                  Complete invoice lifecycle timeline
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
