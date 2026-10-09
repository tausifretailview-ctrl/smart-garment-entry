/** Wording for the "new customer review" alert in the ERP / PWA. */

export type CustomerReviewAlertRow = {
  rating?: number | null;
  comment?: string | null;
  tags?: string[] | null;
  source?: string | null;
};

export type CustomerReviewAlertSale = {
  sale_number?: string | null;
  customer_name?: string | null;
} | null;

/** Where the customer gave the rating, as the shop would say it. */
export function reviewSourceLabel(source: string | null | undefined): string {
  const s = String(source ?? "").toLowerCase();
  if (s.startsWith("whatsapp")) return "WhatsApp";
  if (s === "customer_app") return "Bill & Offers app";
  return "Bill link";
}

export function customerReviewAlert(
  row: CustomerReviewAlertRow,
  sale: CustomerReviewAlertSale,
): { title: string; body: string; unhappy: boolean } {
  const rating = Math.max(1, Math.min(5, Math.round(Number(row.rating) || 0)));
  const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
  const who = String(sale?.customer_name ?? "").trim() || "A customer";
  const unhappy = rating <= 2;
  const title = `${unhappy ? "⚠️ " : ""}${stars} review · ${who}`;
  const comment = String(row.comment ?? "").replace(/\s+/g, " ").trim();
  const tags = (row.tags ?? []).filter(Boolean).join(", ");
  const bill = String(sale?.sale_number ?? "").trim();
  const body = [
    comment ? `“${comment.slice(0, 120)}${comment.length > 120 ? "…" : ""}”` : tags || "",
    bill ? `Bill ${bill}` : "",
    reviewSourceLabel(row.source),
  ]
    .filter(Boolean)
    .join(" · ");
  return { title, body, unhappy };
}
