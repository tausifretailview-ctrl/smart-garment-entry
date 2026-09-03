import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildUpiPayLink } from "@/lib/upiPayLink";
import { formatStorefrontPrice } from "@/lib/storefrontStock";

export function EllaUpiPayBlock({
  upiId,
  upiBusinessName,
  amount,
  note,
  missingHint = "UPI is not configured for this store. Please use Enquire or WhatsApp.",
}: {
  upiId?: string | null;
  upiBusinessName?: string | null;
  amount?: number | null;
  note?: string;
  missingHint?: string;
}) {
  const [qrUrl, setQrUrl] = useState("");
  const payee = (upiBusinessName || "").trim() || "Store";
  const amt = Number(amount) || 0;
  const upiLink =
    upiId && amt > 0
      ? buildUpiPayLink({ upiId, payeeName: payee, amount: amt, note })
      : "";

  useEffect(() => {
    if (!upiLink) {
      setQrUrl("");
      return;
    }
    QRCode.toDataURL(upiLink, { width: 220, margin: 1, errorCorrectionLevel: "M" })
      .then(setQrUrl)
      .catch(() => setQrUrl(""));
  }, [upiLink]);

  if (!upiId) {
    return <p className="ella-form-note">{missingHint}</p>;
  }

  return (
    <div className="ella-upi-block">
      {qrUrl ? (
        <img className="ella-upi-qr" src={qrUrl} alt="UPI payment QR code" width={220} height={220} />
      ) : null}
      <div className="ella-upi-id">{upiId}</div>
      {upiLink ? (
        <a className="ella-btn" href={upiLink}>
          Pay {formatStorefrontPrice(amt)} via UPI
        </a>
      ) : null}
      <p className="ella-form-note">
        {amt > 0
          ? "Scan the QR or tap Pay — then confirm below so the studio can verify your payment."
          : "Pay this UPI ID, then send the booking so the studio can verify."}
      </p>
    </div>
  );
}
