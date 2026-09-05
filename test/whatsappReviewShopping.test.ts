import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_REVIEW_SHOPPING_MESSAGE,
  REVIEW_SHOPPING_LIST_BUTTON,
  buildReviewShoppingListPayload,
  buildReviewShoppingMessage,
  isInvoiceTemplateCta,
  isReviewShoppingCta,
  isReviewShoppingInbound,
  isReviewShoppingRatingReply,
  reviewShoppingThankYou,
} from "../supabase/functions/_shared/whatsappReviewShopping.ts";

describe("Review Shopping Meta CTA", () => {
  it("matches the invoice template quick-reply text", () => {
    expect(isReviewShoppingCta("Review Shopping")).toBe(true);
    expect(isReviewShoppingCta("review shopping")).toBe(true);
    expect(isReviewShoppingCta("↩️ Review Shopping")).toBe(true);
    expect(isReviewShoppingCta("", "review_shopping")).toBe(true);
    expect(isReviewShoppingCta("", "review-shopping")).toBe(true);
    expect(isReviewShoppingCta("Order Details")).toBe(false);
    expect(isReviewShoppingCta("report")).toBe(false);
  });

  it("matches the live tap that arrives as a plain text message", () => {
    // POS/26-27/29: WhatsApp/WappConnect shows a green "Review Shopping" text bubble.
    expect(isReviewShoppingInbound("Review Shopping")).toBe(true);
    expect(isReviewShoppingInbound("Review Shopping", "", "")).toBe(true);
    expect(isReviewShoppingInbound("", "Review Shopping", "")).toBe(true);
    expect(isReviewShoppingInbound("report")).toBe(false);
  });

  it("is an invoice CTA so owner-bot must not claim it", () => {
    expect(isInvoiceTemplateCta("Review Shopping")).toBe(true);
    expect(isInvoiceTemplateCta("Order Details")).toBe(true);
    expect(isInvoiceTemplateCta("report")).toBe(false);
    expect(isInvoiceTemplateCta("", "review_5")).toBe(true);
  });

  it("builds the Select list payload", () => {
    const payload = buildReviewShoppingListPayload("917385432144");
    expect(payload.type).toBe("interactive");
    expect(payload.interactive.type).toBe("list");
    expect(payload.interactive.action.button).toBe(REVIEW_SHOPPING_LIST_BUTTON);
    expect(payload.interactive.action.button).toBe("Select");
    expect(payload.interactive.action.sections[0].rows).toHaveLength(5);
    expect(payload.interactive.action.sections[0].rows[0].id).toBe("review_5");
    for (const row of payload.interactive.action.sections[0].rows) {
      expect(row.title.length).toBeLessThanOrEqual(24);
    }
  });

  it("fills the shopping review message from the Google review template", () => {
    const msg = buildReviewShoppingMessage({
      template: "Rate us:\n{google_review}",
      googleReviewLink: "https://g.page/r/demo",
    });
    expect(msg).toContain("https://g.page/r/demo");
    expect(msg).not.toContain("{google_review}");
  });

  it("uses the WhatsApp settings Google Review Response when no org template is stored", () => {
    expect(DEFAULT_REVIEW_SHOPPING_MESSAGE).toContain("{google_review}");
    expect(DEFAULT_REVIEW_SHOPPING_MESSAGE).toContain("We would love your feedback");
    const msg = buildReviewShoppingMessage({
      googleReviewLink: "https://g.page/r/actual",
    });
    expect(msg).toContain("https://g.page/r/actual");
    expect(msg).toContain("We would love your feedback");
    expect(msg).not.toContain("{google_review}");
    expect(msg).not.toContain("tap *Select*");
  });

  it("thanks a 5-star list reply and includes Google link when present", () => {
    expect(isReviewShoppingRatingReply("review_5")).toBe(true);
    expect(reviewShoppingThankYou("review_5", "https://g.page/r/demo")).toContain(
      "https://g.page/r/demo",
    );
    expect(reviewShoppingThankYou("review_1")).not.toContain("Google");
  });
});

describe("whatsapp-webhook Review Shopping wiring", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(
    join(here, "../supabase/functions/whatsapp-webhook/index.ts"),
    "utf8",
  );

  it("handles Review Shopping before owner commands and sends the Select list", () => {
    expect(src).toContain("isReviewShoppingInbound(messageText, buttonText, buttonId)");
    expect(src).not.toContain("messageType === 'button' || messageType === 'interactive'");
    expect(src).toContain("buildReviewShoppingListPayload(senderPhone)");
    expect(src).toContain("isInvoiceTemplateCta(messageText, buttonId)");
    const ctaIdx = src.indexOf("isReviewShoppingInbound(messageText, buttonText, buttonId)");
    const ownerCallIdx = src.lastIndexOf("await handleOwnerCommand(");
    expect(ctaIdx).toBeGreaterThan(0);
    expect(ownerCallIdx).toBeGreaterThan(ctaIdx);
  });
});
