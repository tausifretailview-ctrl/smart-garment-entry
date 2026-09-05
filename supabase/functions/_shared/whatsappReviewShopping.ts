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
  return "Sorry we missed the mark. We will use your feedback to do better. 🙏";
}
