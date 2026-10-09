import { describe, expect, it } from "vitest";
import { customerReviewAlert, reviewSourceLabel } from "./customerReviewAlert";

describe("customerReviewAlert", () => {
  it("shows stars, customer, comment, bill and where it came from", () => {
    const a = customerReviewAlert(
      { rating: 5, comment: "Great  collection\nand staff", tags: ["Staff"], source: "customer_app" },
      { sale_number: "POS/26-27/12", customer_name: "Riya" },
    );
    expect(a).toEqual({
      title: "★★★★★ review · Riya",
      body: "“Great collection and staff” · Bill POS/26-27/12 · Bill & Offers app",
      unhappy: false,
    });
  });
  it("flags unhappy ratings and falls back to tags without a comment", () => {
    const a = customerReviewAlert({ rating: 2, tags: ["Prices", "Billing speed"], source: "whatsapp" }, null);
    expect(a.title).toBe("⚠️ ★★☆☆☆ review · A customer");
    expect(a.body).toBe("Prices, Billing speed · WhatsApp");
    expect(a.unhappy).toBe(true);
  });
  it("clamps bad ratings and names sources", () => {
    expect(customerReviewAlert({ rating: 9 }, null).title).toContain("★★★★★");
    expect(reviewSourceLabel("customer_page")).toBe("Bill link");
    expect(reviewSourceLabel(null)).toBe("Bill link");
  });
});
