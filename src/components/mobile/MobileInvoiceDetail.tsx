import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  X, Share2, Printer, MessageCircle, Pencil, ChevronDown, ChevronUp, Phone, Loader2,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { withMobileQueryTimeout } from "@/lib/mobileQueryTimeout";
import {
  buildSaleWhatsAppMessage,
  fetchSaleForInvoicePreview,
  fetchSalePaymentHistory,
} from "@/utils/mobileInvoicePreviewData";
import { MobileSalePrintPreviewDialog } from "@/components/mobile/MobileSalePrintPreviewDialog";
import { cn } from "@/lib/utils";

type Props = {
  saleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(v);

function statusBadgeClass(status: string | null | undefined) {
  switch (status) {
    case "paid":
      return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400";
    case "partial":
      return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400";
    default:
      return "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-400";
  }
}

function statusLabel(status: string | null | undefined) {
  if (status === "paid") return "Paid";
  if (status === "partial") return "Partial";
  return "Pending";
}

export function MobileInvoiceDetail({ saleId, open, onOpenChange }: Props) {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const orgId = currentOrganization?.id;
  const [printOpen, setPrintOpen] = useState(false);
  const [paymentsExpanded, setPaymentsExpanded] = useState(false);

  const { data: sale, isLoading, isError } = useQuery({
    queryKey: ["mobile-invoice-detail", orgId, saleId],
    queryFn: () =>
      withMobileQueryTimeout(() => fetchSaleForInvoicePreview(saleId!, orgId!)),
    enabled: open && !!saleId && !!orgId,
    staleTime: 60_000,
    retry: 1,
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ["mobile-invoice-payments", orgId, saleId],
    queryFn: () =>
      withMobileQueryTimeout(() => fetchSalePaymentHistory(saleId!, orgId!)),
    enabled: open && !!saleId && !!orgId,
    staleTime: 60_000,
    retry: 1,
  });

  const discountTotal = (sale?.discount_amount || 0) + (sale?.flat_discount_amount || 0);
  const gstTotal =
    sale?.sale_items.reduce((sum, item) => {
      const taxable = (item.quantity || 0) * (item.unit_price || 0);
      return sum + taxable * ((item.gst_percent || 0) / 100);
    }, 0) ?? 0;

  const paidAmount = sale?.paid_amount ?? 0;
  const returnAdjust = sale?.sale_return_adjust ?? 0;
  const pendingAmount = Math.max(0, (sale?.net_amount ?? 0) - paidAmount - returnAdjust);

  const handleShare = () => {
    if (!sale) return;
    const url = `https://app.inventoryshop.in/invoice/view/${sale.id}`;
    if (navigator.share) {
      void navigator.share({
        title: sale.sale_number,
        text: `Invoice ${sale.sale_number} — ${fmt(sale.net_amount)}`,
        url,
      }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${buildSaleWhatsAppMessage(sale)}`, "_blank");
    }
  };

  const handleWhatsApp = () => {
    if (!sale) return;
    window.open(`https://wa.me/?text=${buildSaleWhatsAppMessage(sale)}`, "_blank");
  };

  const handleEdit = () => {
    if (!sale) return;
    onOpenChange(false);
    orgNavigate("/sales-invoice", { state: { editInvoiceId: sale.id } });
  };

  const handleClose = (next: boolean) => {
    if (!next) setPaymentsExpanded(false);
    onOpenChange(next);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent
          side="bottom"
          className="h-[min(92vh,780px)] rounded-t-2xl p-0 flex flex-col gap-0 [&>button]:hidden"
        >
          {isLoading ? (
            <div className="flex flex-col h-full">
              <div className="px-4 pt-4 pb-3 border-b shrink-0 flex items-center justify-between">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
              <div className="flex-1 p-4 space-y-3">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            </div>
          ) : isError || !sale ? (
            <div className="flex flex-col items-center justify-center flex-1 p-6 text-center">
              <p className="text-sm font-medium text-foreground">Could not load invoice</p>
              <button
                type="button"
                className="mt-3 text-sm text-primary font-semibold touch-manipulation"
                onClick={() => handleClose(false)}
              >
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-4 pt-4 pb-3 border-b shrink-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold font-mono text-foreground truncate">
                        {sale.sale_number}
                      </p>
                      <Badge variant="outline" className={cn("text-[10px] h-5", statusBadgeClass(sale.payment_status))}>
                        {statusLabel(sale.payment_status)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(sale.sale_date), "d MMM yyyy")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={handleShare}
                      className="w-9 h-9 rounded-full flex items-center justify-center active:bg-muted touch-manipulation"
                      aria-label="Share invoice"
                    >
                      <Share2 className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClose(false)}
                      className="w-9 h-9 rounded-full flex items-center justify-center active:bg-muted touch-manipulation"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Scrollable body — single scroll container inside sheet */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3">
                {/* Customer */}
                <div className="mb-4">
                  <p className="text-base font-semibold text-foreground">{sale.customer_name || "Walk-in"}</p>
                  {sale.customer_phone ? (
                    <a
                      href={`tel:${sale.customer_phone}`}
                      className="inline-flex items-center gap-1.5 text-sm text-primary mt-1 touch-manipulation"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {sale.customer_phone}
                    </a>
                  ) : null}
                  {sale.customer_address ? (
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{sale.customer_address}</p>
                  ) : null}
                </div>

                {/* Items table */}
                <div className="rounded-xl border border-border/50 overflow-hidden mb-4">
                  <div className="grid grid-cols-[1.5rem_1fr_2.5rem_2rem_3.5rem_3.5rem] gap-x-1 bg-muted/40 px-2 py-2 text-[10px] font-semibold text-muted-foreground uppercase">
                    <span>#</span>
                    <span>Product</span>
                    <span className="text-center">Size</span>
                    <span className="text-center">Qty</span>
                    <span className="text-right">Rate</span>
                    <span className="text-right">Amt</span>
                  </div>
                  <div className="divide-y divide-border/40">
                    {sale.sale_items.map((item, idx) => (
                      <div
                        key={`${item.product_name}-${idx}`}
                        className="grid grid-cols-[1.5rem_1fr_2.5rem_2rem_3.5rem_3.5rem] gap-x-1 px-2 py-2 text-[13px] items-start"
                      >
                        <span className="text-muted-foreground tabular-nums">{idx + 1}</span>
                        <span className="font-medium text-foreground leading-tight truncate">{item.product_name}</span>
                        <span className="text-center text-muted-foreground text-xs">{item.size || "—"}</span>
                        <span className="text-center tabular-nums">{item.quantity ?? 0}</span>
                        <span className="text-right tabular-nums text-xs">
                          {Math.round(item.unit_price || 0).toLocaleString("en-IN")}
                        </span>
                        <span className="text-right tabular-nums font-medium">
                          {Math.round(item.line_total || 0).toLocaleString("en-IN")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div className="rounded-xl border border-border/50 p-3 space-y-1.5 text-sm mb-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="tabular-nums">{fmt(sale.gross_amount || 0)}</span>
                  </div>
                  {discountTotal > 0 ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Discount</span>
                      <span className="tabular-nums text-emerald-600">−{fmt(discountTotal)}</span>
                    </div>
                  ) : null}
                  {returnAdjust > 0 ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Return adjust</span>
                      <span className="tabular-nums">−{fmt(returnAdjust)}</span>
                    </div>
                  ) : null}
                  {gstTotal > 0.01 ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GST</span>
                      <span className="tabular-nums">{fmt(gstTotal)}</span>
                    </div>
                  ) : null}
                  <div className="border-t border-border pt-2 flex justify-between items-center">
                    <span className="font-bold text-foreground">Total</span>
                    <span className="text-lg font-bold tabular-nums">{fmt(sale.net_amount || 0)}</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-muted-foreground">Paid</span>
                    <span className="font-semibold tabular-nums text-emerald-600">{fmt(paidAmount)}</span>
                  </div>
                  {pendingAmount > 0.5 ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pending</span>
                      <span className="font-semibold tabular-nums text-destructive">{fmt(pendingAmount)}</span>
                    </div>
                  ) : null}
                </div>

                {/* Payment history */}
                {(paymentsLoading || payments.length > 0) && (
                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={() => setPaymentsExpanded((v) => !v)}
                      className="w-full flex items-center justify-between py-2 text-sm font-medium text-foreground touch-manipulation"
                    >
                      <span className="flex items-center gap-1.5">
                        {paymentsExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                        Payment History ({paymentsLoading ? "…" : payments.length} receipt{payments.length === 1 ? "" : "s"})
                      </span>
                    </button>
                    {paymentsExpanded && (
                      <div className="space-y-2 pl-1">
                        {paymentsLoading ? (
                          <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading receipts…
                          </div>
                        ) : (
                          payments.map((p) => {
                            const settled = (p.total_amount || 0) + (p.discount_amount || 0);
                            return (
                              <div
                                key={p.id}
                                className="text-xs text-muted-foreground border-l-2 border-border pl-3 py-1"
                              >
                                <span className="font-mono font-medium text-foreground">{p.voucher_number}</span>
                                {" · "}
                                <span className="tabular-nums font-semibold text-foreground">{fmt(settled)}</span>
                                {" · "}
                                {p.payment_method || "—"}
                                {" · "}
                                {format(new Date(p.voucher_date), "d MMM yyyy")}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="shrink-0 border-t border-border px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPrintOpen(true)}
                    className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-muted/60 active:bg-muted touch-manipulation"
                  >
                    <Printer className="h-4 w-4 text-violet-600" />
                    <span className="text-[10px] font-medium">Print / PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleWhatsApp}
                    className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-muted/60 active:bg-muted touch-manipulation"
                  >
                    <MessageCircle className="h-4 w-4 text-emerald-600" />
                    <span className="text-[10px] font-medium">WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleEdit}
                    className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-muted/60 active:bg-muted touch-manipulation"
                  >
                    <Pencil className="h-4 w-4 text-primary" />
                    <span className="text-[10px] font-medium">Edit</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <MobileSalePrintPreviewDialog
        saleId={saleId}
        open={printOpen}
        onOpenChange={setPrintOpen}
      />
    </>
  );
}
