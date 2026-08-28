import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";

type LinkStatus = "created" | "sent" | "paid" | "expired" | "cancelled";

/**
 * Where the customer lands after paying. Gateways redirect the browser here;
 * the authoritative payment record still comes from the webhook, so this page
 * only reads status and polls briefly while the webhook catches up.
 */
export default function PaymentStatusPage() {
  const [params] = useSearchParams();
  const gatewayLinkId =
    params.get("razorpay_payment_link_id") ||
    params.get("txnId") ||
    params.get("linkId") ||
    "";

  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState<number | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!gatewayLinkId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      const { data } = await supabase
        .from("payment_links")
        .select("status, amount, invoice_number")
        .eq("gateway_link_id", gatewayLinkId)
        .maybeSingle();

      if (cancelled) return;

      if (data) {
        setStatus(data.status as LinkStatus);
        setAmount(Number(data.amount));
        setInvoiceNumber(data.invoice_number ?? null);
      }
      setLoading(false);

      attempts += 1;
      // The webhook usually lands within a few seconds of the redirect.
      if (!cancelled && data?.status !== "paid" && attempts < 6) {
        setTimeout(() => { void poll(); }, 2500);
      }
    };

    void poll();
    return () => { cancelled = true; };
  }, [gatewayLinkId]);

  const isPaid = status === "paid";
  const isFailed = status === "cancelled" || status === "expired";

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center space-y-4">
          {loading ? (
            <>
              <Loader2 className="h-12 w-12 mx-auto animate-spin text-muted-foreground" />
              <h1 className="text-xl font-semibold">Checking your payment…</h1>
            </>
          ) : isPaid ? (
            <>
              <CheckCircle2 className="h-14 w-14 mx-auto text-emerald-600" />
              <h1 className="text-2xl font-semibold">Payment received</h1>
              <p className="text-muted-foreground">
                Thank you. Your payment
                {amount !== null ? ` of ₹${amount.toFixed(2)}` : ""}
                {invoiceNumber ? ` for ${invoiceNumber}` : ""} has been recorded.
              </p>
            </>
          ) : isFailed ? (
            <>
              <XCircle className="h-14 w-14 mx-auto text-destructive" />
              <h1 className="text-2xl font-semibold">Payment not completed</h1>
              <p className="text-muted-foreground">
                The payment was cancelled or the link expired. Please ask the shop for a new payment link.
              </p>
            </>
          ) : (
            <>
              <Clock className="h-14 w-14 mx-auto text-amber-500" />
              <h1 className="text-2xl font-semibold">Payment is being confirmed</h1>
              <p className="text-muted-foreground">
                If money has left your account, it will be confirmed shortly. You can safely close this page —
                the shop will see the payment automatically.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
