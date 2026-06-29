import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { formatTimestampIST } from "@/lib/localDayBounds";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { MobileSalePrintPreviewDialog } from "@/components/mobile/MobileSalePrintPreviewDialog";
import {
  ArrowLeft, FileText, User, Phone, Calendar, CreditCard, Share2, Eye,
} from "lucide-react";

const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(v);

interface Props {
  billId: string;
  onBack: () => void;
}

export const OwnerSalesBillDetail = ({ billId, onBack }: Props) => {
  const [previewOpen, setPreviewOpen] = useState(false);

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

  useEffect(() => {
    if (bill && !isLoading) setPreviewOpen(true);
  }, [bill, isLoading]);

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
                  {formatTimestampIST(bill.created_at || bill.sale_date)}
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

      {/* Invoice preview */}
      <div className="px-4 mt-4">
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground py-3.5 text-sm font-semibold active:scale-[0.98] touch-manipulation shadow-sm"
        >
          <Eye className="h-4 w-4" />
          Invoice PDF Preview
        </button>
      </div>

      {/* Totals summary */}
      <div className="px-4 mt-4 mb-6">
        <Card className="border-border/40">
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium tabular-nums">{fmt(bill.gross_amount || 0)}</span>
            </div>
            <div className="border-t border-border pt-2 flex justify-between">
              <span className="text-sm font-bold text-foreground">Grand Total</span>
              <span className="text-lg font-bold text-foreground tabular-nums">{fmt(bill.net_amount || 0)}</span>
            </div>
            <div className="flex justify-between text-xs pt-1">
              <span className="text-muted-foreground flex items-center gap-1">
                <CreditCard className="h-3.5 w-3.5" />
                {bill.payment_method}
              </span>
              <span className="font-semibold tabular-nums">{fmt(bill.paid_amount || 0)} paid</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <MobileSalePrintPreviewDialog
        saleId={billId}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </div>
  );
};
