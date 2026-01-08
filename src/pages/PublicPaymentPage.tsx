import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone, IndianRupee, Building2, FileText, CheckCircle2 } from "lucide-react";
import QRCode from "qrcode";

export default function PublicPaymentPage() {
  const [searchParams] = useSearchParams();
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [payClicked, setPayClicked] = useState(false);

  // Extract payment details from URL params
  const upiId = searchParams.get("pa") || "";
  const businessName = decodeURIComponent(searchParams.get("pn") || "Merchant");
  const rawAmount = searchParams.get("am") || "0";
  const amount = isNaN(parseFloat(rawAmount)) ? "0" : rawAmount;
  const invoiceNumber = searchParams.get("tn") ? decodeURIComponent(searchParams.get("tn") || "") : "";

  // Generate UPI deep link
  const upiLink = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(businessName)}&am=${amount}&cu=INR${invoiceNumber ? `&tn=${encodeURIComponent(invoiceNumber)}` : ""}`
    : null;

  // Generate QR code
  useEffect(() => {
    if (upiLink) {
      QRCode.toDataURL(upiLink, {
        width: 200,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error("QR generation error:", err));
    }
  }, [upiLink]);

  const handlePayNow = () => {
    if (upiLink) {
      setPayClicked(true);
      // Open UPI app with deep link
      window.location.href = upiLink;
    }
  };

  if (!upiId || !amount) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-destructive">Invalid Payment Link</CardTitle>
            <CardDescription>
              This payment link is invalid or has expired.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const formattedAmount = parseFloat(amount).toLocaleString("en-IN");

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-2 pb-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-xl">{businessName}</CardTitle>
          <CardDescription>Payment Request</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Amount Display */}
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground mb-1">Amount to Pay</p>
            <div className="flex items-center justify-center gap-1">
              <IndianRupee className="h-8 w-8 text-primary" />
              <span className="text-4xl font-bold text-primary">{formattedAmount}</span>
            </div>
          </div>

          {/* Invoice Info */}
          {invoiceNumber && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Reference</p>
                <p className="font-medium text-sm">{invoiceNumber}</p>
              </div>
            </div>
          )}

          {/* Pay Now Button */}
          <Button
            onClick={handlePayNow}
            size="lg"
            className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-lg"
          >
            {payClicked ? (
              <>
                <CheckCircle2 className="h-5 w-5 mr-2" />
                Opening UPI App...
              </>
            ) : (
              <>
                <Smartphone className="h-5 w-5 mr-2" />
                Pay ₹{formattedAmount}
              </>
            )}
          </Button>

          {/* QR Code for Desktop */}
          {qrDataUrl && (
            <div className="space-y-3">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or scan QR code
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 p-4 bg-white rounded-lg border">
                <img src={qrDataUrl} alt="Payment QR Code" className="w-40 h-40" />
                <p className="text-xs text-muted-foreground text-center">
                  Scan with GPay, PhonePe, Paytm or any UPI app
                </p>
              </div>
            </div>
          )}

          {/* UPI ID Display */}
          <div className="text-center space-y-1">
            <p className="text-xs text-muted-foreground">UPI ID</p>
            <p className="font-mono text-sm bg-muted px-3 py-1.5 rounded inline-block">
              {upiId}
            </p>
          </div>

          {/* Security Note */}
          <p className="text-xs text-muted-foreground text-center">
            🔒 Secure payment via UPI. No card details required.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
