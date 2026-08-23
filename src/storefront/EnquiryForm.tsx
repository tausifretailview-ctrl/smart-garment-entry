import { useState } from "react";
import { validateEnquiryInput } from "@/lib/storefrontEnquiry";
import { submitStorefrontEnquiry } from "./storefrontClient";

export function EnquiryForm({
  slug,
  productId,
}: {
  slug: string;
  productId?: string | null;
}) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
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

  return (
    <form className="mt-4 space-y-3" onSubmit={onSubmit}>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Your name</span>
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          required
          className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[color:var(--store-accent,#2563EB)]"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Mobile number</span>
        <input
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          required
          inputMode="tel"
          className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[color:var(--store-accent,#2563EB)]"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Message (optional)</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[color:var(--store-accent,#2563EB)]"
        />
      </label>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-[color:var(--store-accent,#2563EB)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Send enquiry"}
      </button>
    </form>
  );
}
