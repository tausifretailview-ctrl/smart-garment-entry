import { useState } from "react";
import { validateEnquiryInput } from "@/lib/storefrontEnquiry";
import { formatStorefrontPrice } from "@/lib/storefrontStock";
import { submitStorefrontEnquiry } from "./storefrontClient";
import { EllaUpiPayBlock } from "./EllaUpiPayBlock";
import { ellaCopy } from "./storefrontTheme";
import type { EllaStorefrontProduct } from "./ellaProduct";

export function EllaEnquiryForm({
  slug,
  product,
  whatsAppHref,
  upiId,
  upiBusinessName,
}: {
  slug: string;
  product: EllaStorefrontProduct | null;
  whatsAppHref?: string | null;
  upiId?: string | null;
  upiBusinessName?: string | null;
}) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="ella-success" role="status">
        Thank you. The studio has your enquiry for {product?.name || "this visit"} and will be in touch.
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const bookingBits = [
      product ? (product.code ? `[${product.code}]` : product.name) : "",
      upiId ? `UPI ${upiId}` : "",
      product?.price ? `Booking ${formatStorefrontPrice(product.price)}` : "",
      message,
    ].filter(Boolean);
    const composed = bookingBits.join(" · ");
    const checked = validateEnquiryInput({
      customerName,
      customerPhone,
      message: composed,
      productId: product?.productId,
    });
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

  return (
    <form className="ella-form" onSubmit={onSubmit}>
      <label>
        <span>Name</span>
        <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required autoComplete="name" />
      </label>
      <label>
        <span>Phone / WhatsApp</span>
        <input
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          required
          inputMode="tel"
          autoComplete="tel"
        />
      </label>
      <label>
        <span>Event date or message (optional)</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
      </label>
      {error ? <p className="ella-error">{error}</p> : null}
      {upiId ? (
        <EllaUpiPayBlock
          upiId={upiId}
          upiBusinessName={upiBusinessName}
          amount={product?.price}
          note={product ? `Ella booking ${product.code}` : "Ella studio booking"}
        />
      ) : null}
      <div className="ella-form-actions">
        <button type="submit" className="ella-btn" disabled={submitting}>
          {submitting ? "Sending" : upiId ? "I have paid — book" : "Send enquiry"}
        </button>
        {whatsAppHref ? (
          <a
            className="ella-btn ella-btn-outline"
            href={whatsAppHref}
            target="_blank"
            rel="noreferrer"
            data-ella-wa="product"
            data-style-code={product?.code || ""}
          >
            WhatsApp
          </a>
        ) : null}
      </div>
      <p className="ella-form-note">{ellaCopy.enquiryNote}</p>
    </form>
  );
}
