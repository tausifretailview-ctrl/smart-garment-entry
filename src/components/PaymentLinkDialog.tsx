import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Copy, MessageCircle, QrCode, Link2, AlertCircle, Check } from "lucide-react";
import { useUPIPaymentLink } from "@/hooks/useUPIPaymentLink";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { toast } from "sonner";
import QRCode from "qrcode";

interface PaymentLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  customerPhone?: string | null;
  amount: number;
  invoiceNumber?: string;
  invoiceCount?: number;
}

export function PaymentLinkDialog({
  open,
  onOpenChange,
  customerName,
  customerPhone,
  amount,
  invoiceNumber,
  invoiceCount,
}: PaymentLinkDialogProps) {
  const { generateUPILink, isUPIConfigured, upiId, businessName } = useUPIPaymentLink();
  const { sendWhatsApp, copyToClipboard } = useWhatsAppSend();
  const [showQR, setShowQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const upiLink = generateUPILink({
    amount,
    customerName,
    invoiceNumber,
  });

  // Generate QR code when dialog opens
  useEffect(() => {
    if (open && upiLink && showQR) {
      QRCode.toDataURL(upiLink, {
        width: 256,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error("QR generation error:", err));
    }
  }, [open, upiLink, showQR]);

  const handleCopyLink = async () => {
    if (!upiLink) return;
    
    const copied = await copyToClipboard(upiLink);
    if (copied) {
      setCopied(true);
      toast.success("Payment link copied!");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy link");
    }
  };

  const handleSendWhatsApp = () => {
    if (!customerPhone) {
      toast.error("Customer phone number is required");
      return;
    }

    const message = `🔔 *Payment Request*\n\n` +
      `Dear ${customerName},\n\n` +
      `Please pay *₹${amount.toLocaleString("en-IN")}*` +
      (invoiceNumber ? ` for invoice ${invoiceNumber}` : "") +
      (invoiceCount && invoiceCount > 1 ? ` (${invoiceCount} invoices)` : "") +
      `.\n\n` +
      `👉 *Click to Pay:*\n${upiLink}\n\n` +
      `Or scan the QR code / use this UPI ID:\n📱 *${upiId}*\n\n` +
      `Thank you!\n${businessName}`;

    sendWhatsApp(customerPhone, message);
    onOpenChange(false);
  };

  const handleCopyMessage = async () => {
    const message = `Payment Request\n\n` +
      `Dear ${customerName},\n\n` +
      `Please pay ₹${amount.toLocaleString("en-IN")}` +
      (invoiceNumber ? ` for invoice ${invoiceNumber}` : "") +
      `.\n\n` +
      `Pay Now: ${upiLink}\n\n` +
      `UPI ID: ${upiId}\n\n` +
      `Thank you!\n${businessName}`;

    const copied = await copyToClipboard(message);
    if (copied) {
      toast.success("Message copied to clipboard!");
    }
  };

  if (!isUPIConfigured) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              UPI Not Configured
            </DialogTitle>
            <DialogDescription>
              Please configure your UPI ID in Settings → Invoice Settings to generate payment links.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Send Payment Link
          </DialogTitle>
          <DialogDescription>
            Share this payment link with {customerName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer & Amount Summary */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Customer</span>
              <span className="font-medium">{customerName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Amount</span>
              <span className="font-bold text-lg text-primary">
                ₹{amount.toLocaleString("en-IN")}
              </span>
            </div>
            {invoiceNumber && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Invoice</span>
                <Badge variant="outline">{invoiceNumber}</Badge>
              </div>
            )}
            {invoiceCount && invoiceCount > 1 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Invoices</span>
                <Badge variant="secondary">{invoiceCount} pending</Badge>
              </div>
            )}
          </div>

          {/* UPI Link Display */}
          <div className="space-y-2">
            <Label>Payment Link</Label>
            <div className="flex gap-2">
              <Input 
                value={upiLink || ""} 
                readOnly 
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyLink}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              UPI ID: <span className="font-mono">{upiId}</span>
            </p>
          </div>

          {/* QR Code Section */}
          {showQR && qrDataUrl && (
            <div className="flex flex-col items-center gap-2 p-4 bg-white rounded-lg border">
              <img src={qrDataUrl} alt="Payment QR Code" className="w-48 h-48" />
              <p className="text-xs text-muted-foreground">
                Scan with any UPI app
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={() => setShowQR(!showQR)}
              className="flex items-center gap-2"
            >
              <QrCode className="h-4 w-4" />
              {showQR ? "Hide QR" : "Show QR"}
            </Button>
            <Button
              variant="outline"
              onClick={handleCopyMessage}
              className="flex items-center gap-2"
            >
              <Copy className="h-4 w-4" />
              Copy Message
            </Button>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={handleSendWhatsApp}
            disabled={!customerPhone}
            className="flex items-center gap-2"
          >
            <MessageCircle className="h-4 w-4" />
            Send via WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
