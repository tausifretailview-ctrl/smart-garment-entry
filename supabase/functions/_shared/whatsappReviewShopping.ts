/**
 * Meta invoice template QUICK_REPLY "Review Shopping".
 * Click → review text + interactive list whose action button is "Select".
 */

export const REVIEW_SHOPPING_LIST_BUTTON = "Select";

/** Same default as WhatsApp settings → Google Review Response. */
export const DEFAULT_REVIEW_SHOPPING_MESSAGE =
  "⭐ We would love your feedback!\n\nPlease take a moment to rate us:\n{google_review}\n\nYour review helps us serve you better! 🙏";

export const DEFAULT_REVIEW_SHOPPING_LIST_BODY =
  "How was your shopping? Tap Select and choose a rating.";

export const REVIEW_SHOPPING_RATING_ROWS = [
  { id: "review_5", title: "5 Excellent", description: "⭐⭐⭐⭐⭐ Loved it" },
  { id: "review_4", title: "4 Good", description: "⭐⭐⭐⭐ Happy" },
  { id: "review_3", title: "3 Average", description: "⭐⭐⭐ Okay" },
  { id: "review_2", title: "2 Poor", description: "⭐⭐ Needs work" },
  { id: "review_1", title: "1 Bad", description: "⭐ Not satisfied" },
] as const;

export function isReviewShoppingCta(buttonText: string, buttonId = ""): boolean {
  const t = String(buttonText || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const id = String(buttonId || "").trim().toLowerCase().replace(/-/g, "_");
  if (!t && !id) return false;
  if (t.includes("review shopping")) return true;
  if (id.includes("review_shopping")) return true;
  return false;
}

/**
 * Meta QUICK_REPLY can arrive as type=button, type=interactive, or type=text
 * ("Review Shopping" in the chat, as WappConnect often forwards it).
 */
export function isReviewShoppingInbound(
  messageText: string,
  buttonText = "",
  buttonId = "",
): boolean {
  return isReviewShoppingCta(buttonText || messageText, buttonId);
}

export function isReviewShoppingRatingReply(buttonId: string): boolean {
  return /^review_[1-5]$/.test(String(buttonId || "").trim().toLowerCase());
}

/** Invoice template CTAs that must not be treated as owner-bot commands. */
export function isInvoiceTemplateCta(buttonText: string, buttonId = ""): boolean {
  if (isReviewShoppingCta(buttonText, buttonId)) return true;
  if (isReviewShoppingRatingReply(buttonId)) return true;
  const t = String(buttonText || "").trim().toLowerCase();
  const id = String(buttonId || "").trim().toLowerCase().replace(/-/g, "_");
  if (t.includes("order details") || t.includes("feedback") || t.includes("invoice details")) {
    return true;
  }
  if (t.includes("chat with us") || t.includes("google review") || t.includes("invoice link")) {
    return true;
  }
  return (
    id.includes("order_details") ||
    id.includes("feedback") ||
    id === "invoice_link" ||
    id === "social_media" ||
    id === "google_review" ||
    id === "chat_with_us"
  );
}

export function buildReviewShoppingMessage(opts: {
  template?: string | null;
  googleReviewLink?: string | null;
}): string {
  const link = String(opts.googleReviewLink || "").trim();
  let msg = String(opts.template || "").trim() || DEFAULT_REVIEW_SHOPPING_MESSAGE;
  msg = msg.replace(/\{google_review\}/g, link);
  if (!link) {
    msg = msg.replace(/\n{3,}/g, "\n\n").trim();
  }
  return msg;
}

export function buildReviewShoppingListPayload(to: string, bodyText?: string) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: "Shopping Review" },
      body: { text: bodyText?.trim() || DEFAULT_REVIEW_SHOPPING_LIST_BODY },
      action: {
        button: REVIEW_SHOPPING_LIST_BUTTON,
        sections: [
          {
            title: "Your rating",
            rows: REVIEW_SHOPPING_RATING_ROWS.map((row) => ({
              id: row.id,
              title: row.title,
              description: row.description,
            })),
          },
        ],
      },
    },
  };
}

export function reviewShoppingThankYou(ratingId: string, googleReviewLink?: string | null): string {
  const n = String(ratingId || "").trim().slice(-1);
  const link = String(googleReviewLink || "").trim();
  if (n === "5" || n === "4") {
    const thanks = "Thank you! 🙏 Glad you enjoyed shopping with us.";
    return link ? `${thanks}\n\nPlease also rate us on Google:\n${link}` : thanks;
  }
  if (n === "3") {
    return "Thank you for your feedback. We will keep improving! 🙏";
  }
  return "Sorry we missed the mark. Our team will call you soon to make it right. 🙏";
}

/** 1–2 stars: the owner hears about it on WhatsApp at once, not only in the 15-minute push. */
export function isLowRating(rating: number | null | undefined): boolean {
  const n = Number(rating);
  return n >= 1 && n <= 2;
}

/** Owner's number for low-rating alerts: Settings owner phone, else the shop mobile (10 digits). */
export function lowRatingAlertPhone(
  settings: { owner_phone?: string | null; mobile_number?: string | null } | null,
  customerPhone: string,
): string | null {
  for (const raw of [settings?.owner_phone, settings?.mobile_number]) {
    const digits = String(raw ?? "").replace(/\D/g, "").slice(-10);
    if (digits.length !== 10) continue;
    if (digits === String(customerPhone).replace(/\D/g, "").slice(-10)) return null;
    return `91${digits}`;
  }
  return null;
}

/** "⚠️ 1★ review" alert sent to the owner with the customer's number to call back. */
export function lowRatingOwnerMessage(opts: {
  rating: number;
  customerPhone: string;
  customerName?: string | null;
  saleNumber?: string | null;
  salesman?: string | null;
}): string {
  const n = Math.max(1, Math.min(5, Math.round(Number(opts.rating) || 1)));
  const phone = String(opts.customerPhone).replace(/\D/g, "").slice(-10);
  const details = [
    `Customer: ${opts.customerName?.trim() || "Walk-in"}`,
    `Phone: ${phone}`,
    opts.saleNumber ? `Bill: ${opts.saleNumber}` : "",
    opts.salesman?.trim() ? `Salesman: ${opts.salesman.trim()}` : "",
  ].filter(Boolean);
  return [
    `⚠️ ${"★".repeat(n)}${"☆".repeat(5 - n)} review on WhatsApp`,
    "",
    ...details,
    "",
    "The customer was told the shop will call. Please call them today.",
  ].join("\n");
}

/** Stars from a rating list reply id ("review_4" → 4), else null. */
export function reviewRatingFromReplyId(buttonId: string): number | null {
  return isReviewShoppingRatingReply(buttonId) ? Number(String(buttonId).trim().slice(-1)) : null;
}

/** How far back a WhatsApp rating is matched to the customer's bill. */
export const WHATSAPP_REVIEW_BILL_DAYS = 14;

/**
 * What a WhatsApp rating does to the customer's latest bill: a new review, a changed
 * WhatsApp review, or nothing when the bill was already rated on its bill page / in the app.
 */
export function whatsappReviewWrite(
  existing: { source?: string | null } | null,
): "insert" | "update" | null {
  if (!existing) return "insert";
  return String(existing.source ?? "").toLowerCase().startsWith("whatsapp") ? "update" : null;
}
