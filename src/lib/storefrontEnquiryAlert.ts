/** Wording for the "new website order / booking / enquiry" alert in the ERP. */

export type StorefrontEnquiryRow = {
  id: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  message?: string | null;
  size?: string | null;
};

export type StorefrontEnquiryKind = "order" | "booking" | "enquiry";

/** Cart checkouts start with "STORE ORDER"; paid product bookings carry "Booking ₹…". */
export function storefrontEnquiryKind(message: string | null | undefined): StorefrontEnquiryKind {
  const m = String(message || "");
  if (/^STORE ORDER\b/.test(m)) return "order";
  if (/(^|·\s*)Booking\s/.test(m)) return "booking";
  return "enquiry";
}

export function storefrontEnquiryAlert(row: StorefrontEnquiryRow): { title: string; body: string } {
  const kind = storefrontEnquiryKind(row.message);
  const who = (row.customer_name || "").trim() || (row.customer_phone || "").trim() || "A customer";
  const title =
    kind === "order" ? `New website order · ${who}` : kind === "booking" ? `New booking · ${who}` : `New enquiry · ${who}`;
  const detail = String(row.message || "")
    .replace(/^STORE ORDER\s*·\s*/, "")
    .replace(/(\s*\[v:[0-9a-f-]+\])+\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const phone = (row.customer_phone || "").trim();
  const body = [detail.slice(0, 140) || "Open Website → Enquiries to reply.", phone && phone !== who ? phone : ""]
    .filter(Boolean)
    .join(" · ");
  return { title, body };
}
