import { useState } from "react";
import { validateEnquiryInput } from "@/lib/storefrontEnquiry";
import { whatsappShareUrl } from "@/lib/storefrontShare";
import { submitStorefrontEnquiry } from "./storefrontClient";

export function EnquiryForm({
  slug,
  productId,
  shopWhatsApp,
  productLabel,
}: {
  slug: string;
  productId?: string | null;
  shopWhatsApp?: string | null;
  productLabel?: string;
}) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="rounded-lg border border-[color:var(--store-line)] bg-[color:var(--store-ivory)] px-3 py-3 text-sm text-[color:var(--store-green)]">
        Thanks — the shop has your enquiry and will contact you shortly.
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const checked = validateEnquiryInput({ customerName, customerPhone, message, productId });
    if (checked.ok === false) {
      setError(checked.error);
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitStorefrontEnquiry({
        slug,
        customerName: checked.value.customerName,
        customerPhone: checked.value.customerPhone,
        message: checked.value.message,
        productId: checked.value.productId,
      });
      if (!result.ok) {
        setError(result.status === 429 ? "Too many enquiries. Please try again later." : result.error || "Could not send");
        return;
      }
      setDone(true);
    } catch {
      setError("Could not send enquiry. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const waText = productLabel
    ? `Hi, I am interested in ${productLabel}.`
    : "Hi, I have a product enquiry from your online catalogue.";

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <div className="storefront-field">
        <label htmlFor="sf-name">Your name</label>
        <input
          id="sf-name"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          required
          placeholder="e.g. Priya Sharma"
        />
      </div>
      <div className="storefront-field">
        <label htmlFor="sf-phone">Phone number</label>
        <input
          id="sf-phone"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          required
          inputMode="tel"
          placeholder="+91 98765 43210"
        />
      </div>
      <div className="storefront-field">
        <label htmlFor="sf-msg">Message (optional)</label>
        <textarea
          id="sf-msg"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          placeholder="Do you have this in my size?"
        />
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={submitting} className="storefront-btn-primary flex-1">
          {submitting ? "Sending…" : "Send enquiry"}
        </button>
        {shopWhatsApp ? (
          <a
            href={whatsappShareUrl(waText, shopWhatsApp)}
            target="_blank"
            rel="noreferrer"
            className="storefront-btn-wa"
          >
            WhatsApp
          </a>
        ) : null}
      </div>
    </form>
  );
}
