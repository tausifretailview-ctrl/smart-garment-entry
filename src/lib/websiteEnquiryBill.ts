import { enquiryMessageForDisplay } from "@/lib/storefrontVariantSummary";
import type { WebsiteEnquiry } from "@/lib/websiteTypes";

/** POS query param that opens a new bill from a website order. */
export const POS_WEBSITE_ENQUIRY_PARAM = "websiteEnquiry";

export type WebsiteEnquiryBillPrefill = {
  customerName: string;
  /** Digits only, so POS links the customer with the same mobile (or creates one on save). */
  customerPhone: string;
  /** Booked barcodes in the order the shopper added them, each once. */
  barcodes: string[];
  notes: string;
};

/** 10 digits for Indian numbers saved with 91 or 0 in front; other numbers as digits. */
function indianMobileDigits(raw: string | null | undefined): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/**
 * What POS fills in when the shop bills a website order: the shopper's name and
 * mobile (so the bill lands in their app history and earns points), the booked
 * pieces, and the order text (offer code, points, UTR) as the bill note.
 */
export function websiteEnquiryBillPrefill(
  row: Pick<WebsiteEnquiry, "customer_name" | "customer_phone" | "message" | "barcode" | "booked_pieces">,
): WebsiteEnquiryBillPrefill {
  const fromPieces = Array.isArray(row.booked_pieces)
    ? row.booked_pieces.map((p) => String(p?.barcode ?? "").trim())
    : [];
  const barcodes: string[] = [];
  for (const code of [...fromPieces, String(row.barcode ?? "").trim()]) {
    if (code && !barcodes.includes(code)) barcodes.push(code);
  }
  const text = enquiryMessageForDisplay(row.message);
  return {
    customerName: String(row.customer_name ?? "").trim(),
    customerPhone: indianMobileDigits(row.customer_phone),
    barcodes,
    notes: text ? `Website order: ${text}`.slice(0, 500) : "Website order",
  };
}
