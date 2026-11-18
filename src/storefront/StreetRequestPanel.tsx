import { useState, type FormEvent } from "react";
import { validateEnquiryInput } from "@/lib/storefrontEnquiry";
import {
  SHOPPER_DETAILS_STORAGE_KEY,
  holdUntilLabel,
  type StorefrontRequestKind,
} from "@/lib/storefrontRequests";
import { submitStorefrontRequest } from "./storefrontClient";

function readShopper(): { name: string; phone: string } {
  try {
    const raw = JSON.parse(window.localStorage.getItem(SHOPPER_DETAILS_STORAGE_KEY) || "{}") as Record<string, unknown>;
    return {
      name: typeof raw.name === "string" ? raw.name.slice(0, 80) : "",
      phone: typeof raw.phone === "string" ? raw.phone.slice(0, 15) : "",
    };
  } catch {
    return { name: "", phone: "" };
  }
}

const COPY: Record<StorefrontRequestKind, { title: string; lead: (size: string) => string; button: string }> = {
  reserve: {
    title: "Reserve & try in store",
    lead: (size) => `The shop keeps size ${size} aside for you for 24 hours. Come in, try it, and pay only if you like it.`,
    button: "Reserve for 24 hours",
  },
  restock: {
    title: "Tell me when it's back",
    lead: (size) => `Size ${size} is sold out. Leave your number and the shop will message you on WhatsApp when it is back.`,
    button: "Tell me when it's back",
  },
};

/**
 * Product page panel for "Reserve & try in store" and "Tell me when it's back": name and mobile,
 * sent to the shop's Website → Enquiries list. Name and mobile are remembered in this browser.
 */
export function StreetRequestPanel({
  kind,
  slug,
  productId,
  variantId,
  sizeLabel,
  shopName,
  onClose,
}: {
  kind: StorefrontRequestKind;
  slug: string;
  productId: string;
  variantId: string;
  sizeLabel: string;
  shopName: string;
  onClose: () => void;
}) {
  const saved = readShopper();
  const [name, setName] = useState(saved.name);
  const [phone, setPhone] = useState(saved.phone);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ holdUntil: string | null } | null>(null);
  const copy = COPY[kind];

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const checked = validateEnquiryInput({ customerName: name, customerPhone: phone, productId });
    if (checked.ok === false) {
      setError(checked.error);
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitStorefrontRequest({
        slug,
        kind,
        customerName: checked.value.customerName,
        customerPhone: checked.value.customerPhone,
        productId,
        variantId,
      });
      if (!result.ok) {
        setError(result.error || "Could not send. Please try again.");
        return;
      }
      try {
        window.localStorage.setItem(
          SHOPPER_DETAILS_STORAGE_KEY,
          JSON.stringify({ name: checked.value.customerName, phone: checked.value.customerPhone }),
        );
      } catch {
        /* storage blocked — the details are just not remembered */
      }
      setDone({ holdUntil: result.holdUntil });
    } catch {
      setError("Could not send. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    const until = holdUntilLabel(done.holdUntil);
    return (
      <div className="st-req st-req-done" role="status">
        <strong>{kind === "reserve" ? "Reserved for you" : "You are on the list"}</strong>
        <p>
          {kind === "reserve"
            ? `${shopName} is keeping size ${sizeLabel} aside${until ? ` till ${until}` : " for 24 hours"}. Give your mobile number at the shop.`
            : `${shopName} will message you on WhatsApp when size ${sizeLabel} is back in stock.`}
        </p>
        <button type="button" className="st-link" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  return (
    <form className="st-req" onSubmit={onSubmit} aria-label={copy.title}>
      <div className="st-req-head">
        <strong>{copy.title}</strong>
        <button type="button" className="st-req-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <p>{copy.lead(sizeLabel)}</p>
      <label>
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" maxLength={80} />
      </label>
      <label>
        <span>Mobile / WhatsApp</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          inputMode="tel"
          autoComplete="tel"
          maxLength={15}
        />
      </label>
      {error ? <p className="st-req-error">{error}</p> : null}
      <button type="submit" className="st-btn st-btn-solid st-btn-sm" disabled={submitting}>
        {submitting ? "Sending…" : copy.button}
      </button>
    </form>
  );
}
