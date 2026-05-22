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
import { Loader2, ArrowLeft, History, CheckCircle2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

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
    queryFn: async () => {
      const [saleRes, vouchersRes, returnsRes, deliveryRes] = await Promise.all([
        supabase
          .from("sales")
          .select(
            "id, sale_number, sale_date, customer_name, net_amount, paid_amount, sale_return_adjust, payment_status, payment_method, delivery_status, created_at, updated_at, shop_name, irn, ack_no, einvoice_status, is_cancelled, cancelled_at, cancelled_reason"
          )
          .eq("id", saleId!)
          .eq("organization_id", organizationId!)
          .maybeSingle(),
        supabase
          .from("voucher_entries")
          .select(
            "id, voucher_number, voucher_date, total_amount, discount_amount, payment_method, description, created_at"
          )
          .eq("organization_id", organizationId!)
          .eq("reference_id", saleId!)
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
      ]);

      if (saleRes.error) throw saleRes.error;
      if (vouchersRes.error) throw vouchersRes.error;
      if (returnsRes.error) throw returnsRes.error;
      if (deliveryRes.error) throw deliveryRes.error;

      return {
        sale: saleRes.data,
        vouchers: vouchersRes.data || [],
        saleReturns: returnsRes.data || [],
        deliveryHistory: deliveryRes.data || [],
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

  const balanceSummary = useMemo(() => {
    if (!data?.sale) return null;
    const sale = data.sale;
    const vouchers = data.vouchers;

    const invoiceAmount = sale.net_amount || 0;
    const srAdjust = sale.sale_return_adjust || 0;
    const totalVoucherPaid = vouchers.reduce(
      (s, v) => s + (v.total_amount || 0) + (v.discount_amount || 0),
      0
    );
    const advancePaid = vouchers
      .filter((v) => v.payment_method === "advance_adjustment")
      .reduce((s, v) => s + (v.total_amount || 0), 0);
    const cnPaid = vouchers
      .filter((v) => v.payment_method === "credit_note_adjustment")
      .reduce((s, v) => s + (v.total_amount || 0), 0);
    const cashPaid = totalVoucherPaid - advancePaid - cnPaid;
    const discount = vouchers.reduce((s, v) => s + (v.discount_amount || 0), 0);
    const balanceDue = Math.max(0, invoiceAmount - srAdjust - totalVoucherPaid);

    return {
      invoiceAmount,
      srAdjust,
      cashPaid,
      advancePaid,
      cnPaid,
      discount,
      balanceDue,
      settled: balanceDue <= 0.01,
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
              <Badge variant="secondary" className="text-xs h-5">
                {formatStatusLabel(sale.payment_status)}
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

        <Separator />

        {/* Timeline */}
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

        {balanceSummary && (
          <>
            <Separator />
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Balance Summary
              </p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice Amount</span>
                <span className="font-medium tabular-nums">{fmtMoney(balanceSummary.invoiceAmount)}</span>
              </div>
              {balanceSummary.srAdjust > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span>S/R Adjust</span>
                  <span className="font-medium tabular-nums">-{fmtMoney(balanceSummary.srAdjust)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cash/UPI Paid</span>
                <span className="font-medium tabular-nums">{fmtMoney(balanceSummary.cashPaid)}</span>
              </div>
              {balanceSummary.advancePaid > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Advance Applied</span>
                  <span className="font-medium tabular-nums">{fmtMoney(balanceSummary.advancePaid)}</span>
                </div>
              )}
              {balanceSummary.cnPaid > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Credit Note Applied</span>
                  <span className="font-medium tabular-nums">{fmtMoney(balanceSummary.cnPaid)}</span>
                </div>
              )}
              {balanceSummary.discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Receipt Discount</span>
                  <span className="font-medium tabular-nums">{fmtMoney(balanceSummary.discount)}</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between items-center font-semibold">
                <span>Balance Due</span>
                <span
                  className={cn(
                    "tabular-nums flex items-center gap-1",
                    balanceSummary.settled ? "text-green-600" : "text-red-600"
                  )}
                >
                  {fmtMoney(balanceSummary.balanceDue)}
                  {balanceSummary.settled && (
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
      <DialogContent className="max-w-lg w-[95vw] max-h-[88vh] overflow-hidden flex flex-col p-0">
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
        <ScrollArea className="flex-1 px-4 pb-4">
          <div className="pr-3">{renderBody()}</div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
