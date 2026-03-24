import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText, Truck, Calendar, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(v);

interface Props {
  billId: string;
  onBack: () => void;
}

export const OwnerPurchaseBillDetail = ({ billId, onBack }: Props) => {
  const { data: bill, isLoading } = useQuery({
    queryKey: ["owner-purchase-bill-detail", billId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("*")
        .eq("id", billId)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!billId,
  });

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ["owner-purchase-bill-items", billId],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_items")
        .select("*")
        .eq("purchase_bill_id", billId)
        .order("created_at");
      return data || [];
    },
    enabled: !!billId,
  });

  const handleShare = () => {
    if (!bill) return;
    const text = [
      `📦 Purchase Bill: ${bill.software_bill_no}`,
      `📋 Supplier Inv: ${bill.supplier_invoice_no || "N/A"}`,
      `📅 Date: ${format(new Date(bill.bill_date), "dd MMM yyyy")}`,
      `🏭 Supplier: ${bill.supplier_name || "Unknown"}`,
      `💰 Total: ${fmt(bill.net_amount || 0)}`,
    ].join("\n");
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 pb-24">
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="px-4 mt-4 space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="min-h-screen bg-muted/30 pb-24 flex flex-col items-center justify-center">
        <p className="text-sm text-muted-foreground">Bill not found</p>
        <button onClick={onBack} className="mt-3 text-sm font-semibold text-primary">Go Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 touch-manipulation">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-foreground">{bill.software_bill_no}</h1>
          </div>
          <button
            onClick={handleShare}
            className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center active:scale-90 touch-manipulation"
          >
            <Share2 className="h-4 w-4 text-primary" />
          </button>
        </div>
      </div>

      {/* Bill Header Card */}
      <div className="px-4 mt-4">
        <Card className="border-border/40">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-warning" />
                <span className="text-sm font-bold text-foreground">{bill.software_bill_no}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {format(new Date(bill.bill_date), "dd MMM yyyy")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-foreground font-medium">{bill.supplier_name || "Unknown Supplier"}</span>
              </div>
              {bill.supplier_invoice_no && (
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Supplier Inv: {bill.supplier_invoice_no}</span>
                </div>
              )}
              {bill.supplier_id && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Supplier ID: {bill.supplier_id}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Items */}
      <div className="px-4 mt-4">
        <Card className="border-border/40">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold">
              Items ({items?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {itemsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
              </div>
            ) : items && items.length > 0 ? (
              <div className="space-y-2">
                {items.map((item: any, idx: number) => (
                  <div
                    key={item.id}
                    className={cn("bg-muted/30 rounded-xl p-3", idx % 2 === 0 ? "bg-muted/20" : "bg-muted/40")}
                  >
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground truncate">{item.product_name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Size: {item.size || "—"} {item.color ? `• ${item.color}` : ""} • Qty: {item.qty}
                        </p>
                        {item.gst_percent > 0 && (
                          <p className="text-[10px] text-muted-foreground">GST: {item.gst_percent}%</p>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-xs font-bold text-foreground tabular-nums">{fmt((item.qty || 0) * (item.pur_price || 0))}</p>
                        <p className="text-[10px] text-muted-foreground">Buy @{fmt(item.pur_price || 0)}</p>
                        {item.sale_price > 0 && (
                          <p className="text-[10px] text-success">Sell @{fmt(item.sale_price)}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No items</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Totals */}
      <div className="px-4 mt-4">
        <Card className="border-border/40">
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium tabular-nums">{fmt(bill.gross_amount || 0)}</span>
            </div>
            {(bill.gst_amount || 0) > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">GST Amount</span>
                <span className="font-medium tabular-nums">+{fmt(bill.gst_amount || 0)}</span>
              </div>
            )}
            {(bill.cgst_amount || 0) > 0 && (
              <div className="flex justify-between text-xs pl-4">
                <span className="text-muted-foreground">CGST</span>
                <span className="font-medium tabular-nums">{fmt(bill.cgst_amount || 0)}</span>
              </div>
            )}
            {(bill.sgst_amount || 0) > 0 && (
              <div className="flex justify-between text-xs pl-4">
                <span className="text-muted-foreground">SGST</span>
                <span className="font-medium tabular-nums">{fmt(bill.sgst_amount || 0)}</span>
              </div>
            )}
            {(bill.igst_amount || 0) > 0 && (
              <div className="flex justify-between text-xs pl-4">
                <span className="text-muted-foreground">IGST</span>
                <span className="font-medium tabular-nums">{fmt(bill.igst_amount || 0)}</span>
              </div>
            )}
            {(bill.discount_amount || 0) > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Discount</span>
                <span className="font-medium text-success tabular-nums">-{fmt(bill.discount_amount || 0)}</span>
              </div>
            )}
            {(bill.other_charges || 0) > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Other Charges</span>
                <span className="font-medium tabular-nums">+{fmt(bill.other_charges || 0)}</span>
              </div>
            )}
            {(bill.round_off || 0) !== 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Round Off</span>
                <span className="font-medium tabular-nums">{fmt(bill.round_off || 0)}</span>
              </div>
            )}
            <div className="border-t border-border pt-2 flex justify-between">
              <span className="text-sm font-bold text-foreground">Grand Total</span>
              <span className="text-lg font-bold text-foreground tabular-nums">{fmt(bill.net_amount || 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Info */}
      <div className="px-4 mt-4 mb-6">
        <Card className="border-border/40">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Paid Amount</span>
              <span className="font-semibold text-success tabular-nums">{fmt(bill.paid_amount || 0)}</span>
            </div>
            {(bill.net_amount || 0) - (bill.paid_amount || 0) > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Balance Due</span>
                <span className="font-semibold text-destructive tabular-nums">
                  {fmt((bill.net_amount || 0) - (bill.paid_amount || 0))}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
