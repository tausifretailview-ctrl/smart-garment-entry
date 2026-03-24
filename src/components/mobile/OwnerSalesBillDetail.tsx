import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft, FileText, User, Phone, Calendar, CreditCard, Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(v);

interface Props {
  billId: string;
  onBack: () => void;
}

export const OwnerSalesBillDetail = ({ billId, onBack }: Props) => {
  const { currentOrganization } = useOrganization();

  const { data: bill, isLoading } = useQuery({
    queryKey: ["owner-bill-detail", billId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("id", billId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!billId,
  });

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ["owner-bill-items", billId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sale_items")
        .select("*")
        .eq("sale_id", billId)
        .is("deleted_at", null)
        .order("created_at");
      return data || [];
    },
    enabled: !!billId,
  });

  const handleShare = () => {
    if (!bill) return;
    const text = [
      `🧾 Sale Bill: ${bill.sale_number}`,
      `📅 Date: ${format(new Date(bill.sale_date), "dd MMM yyyy")}`,
      `👤 Customer: ${bill.customer_name || "Walk-in"}`,
      `💰 Total: ${fmt(bill.net_amount || 0)}`,
      `💳 Payment: ${bill.payment_method}`,
      `📌 Status: ${bill.payment_status}`,
    ].join("\n");
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank");
    }
  };

  const statusBadge = (status: string, cancelled: boolean) => {
    if (cancelled)
      return <span className="text-xs font-bold px-3 py-1 rounded-full bg-muted text-muted-foreground">Cancelled</span>;
    switch (status) {
      case "paid":
        return <span className="text-xs font-bold px-3 py-1 rounded-full bg-success/15 text-success">Paid</span>;
      case "pending":
        return <span className="text-xs font-bold px-3 py-1 rounded-full bg-destructive/15 text-destructive">Pending</span>;
      case "partial":
        return <span className="text-xs font-bold px-3 py-1 rounded-full bg-warning/15 text-warning">Partial</span>;
      default:
        return <span className="text-xs font-bold px-3 py-1 rounded-full bg-muted text-muted-foreground">{status}</span>;
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
            <h1 className="text-base font-semibold text-foreground">{bill.sale_number}</h1>
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
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-foreground">{bill.sale_number}</span>
              </div>
              {statusBadge(bill.payment_status || "pending", bill.is_cancelled || false)}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {format(new Date(bill.sale_date), "dd MMM yyyy")} • {format(new Date(bill.created_at), "hh:mm a")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-foreground font-medium">{bill.customer_name || "Walk-in Customer"}</span>
              </div>
              {bill.customer_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{bill.customer_phone}</span>
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
                {items.map((item, idx) => (
                  <div
                    key={item.id}
                    className={cn("bg-muted/30 rounded-xl p-3", idx % 2 === 0 ? "bg-muted/20" : "bg-muted/40")}
                  >
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground truncate">{item.product_name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Size: {item.size} {item.color ? `• ${item.color}` : ""} • Qty: {item.quantity}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-xs font-bold text-foreground tabular-nums">{fmt(item.line_total)}</p>
                        <p className="text-[10px] text-muted-foreground">@{fmt(item.unit_price)}</p>
                      </div>
                    </div>
                    {item.discount_percent > 0 && (
                      <p className="text-[10px] text-success mt-1">Discount: {item.discount_percent}%</p>
                    )}
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
            {(bill.discount_amount || 0) > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Discount</span>
                <span className="font-medium text-success tabular-nums">-{fmt(bill.discount_amount || 0)}</span>
              </div>
            )}
            {(bill.flat_discount_amount || 0) > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Flat Discount</span>
                <span className="font-medium text-success tabular-nums">-{fmt(bill.flat_discount_amount || 0)}</span>
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
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Payment Info
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Method</span>
              <span className="font-medium capitalize">{bill.payment_method}</span>
            </div>
            {(bill.cash_amount || 0) > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Cash</span>
                <span className="font-medium tabular-nums">{fmt(bill.cash_amount || 0)}</span>
              </div>
            )}
            {(bill.upi_amount || 0) > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">UPI</span>
                <span className="font-medium tabular-nums">{fmt(bill.upi_amount || 0)}</span>
              </div>
            )}
            {(bill.card_amount || 0) > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Card</span>
                <span className="font-medium tabular-nums">{fmt(bill.card_amount || 0)}</span>
              </div>
            )}
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
