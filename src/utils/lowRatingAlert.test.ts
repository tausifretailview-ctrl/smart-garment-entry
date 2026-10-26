import { describe, expect, it } from "vitest";
import {
  isLowRating,
  lowRatingAlertPhone,
  lowRatingOwnerMessage,
  reviewShoppingThankYou,
} from "../../supabase/functions/_shared/whatsappReviewShopping";
import { reviewMessage } from "../../supabase/functions/_shared/ownerAlertSchedule";

describe("low WhatsApp rating alert", () => {
  it("treats only 1 and 2 stars as low", () => {
    expect([1, 2, 3, 4, 5].map(isLowRating)).toEqual([true, true, false, false, false]);
    expect(isLowRating(null)).toBe(false);
  });

  it("sends to the owner phone, else the shop mobile, never to the customer", () => {
    expect(lowRatingAlertPhone({ owner_phone: "+91 98200 11122", mobile_number: "9000000000" }, "9876543210")).toBe("919820011122");
    expect(lowRatingAlertPhone({ owner_phone: "", mobile_number: "022-1234" }, "9876543210")).toBeNull();
    expect(lowRatingAlertPhone({ owner_phone: null, mobile_number: "9000000000" }, "9876543210")).toBe("919000000000");
    expect(lowRatingAlertPhone({ owner_phone: "9876543210" }, "919876543210")).toBeNull();
    expect(lowRatingAlertPhone(null, "9876543210")).toBeNull();
  });

  it("tells the owner who to call", () => {
    const msg = lowRatingOwnerMessage({
      rating: 1,
      customerPhone: "919876543210",
      customerName: "Riya",
      saleNumber: "POS/26-27/12",
      salesman: "Amit",
    });
    expect(msg).toContain("★☆☆☆☆");
    expect(msg).toContain("Phone: 9876543210");
    expect(msg).toContain("Bill: POS/26-27/12");
    expect(msg).toContain("Salesman: Amit");
    expect(lowRatingOwnerMessage({ rating: 2, customerPhone: "9876543210" })).not.toContain("Salesman");
  });

  it("promises the low-rating customer a call back", () => {
    expect(reviewShoppingThankYou("review_1")).toContain("call you");
    expect(reviewShoppingThankYou("review_5")).not.toContain("call you");
  });

  it("adds call-back number and salesman to the owner's push only for low ratings", () => {
    const low = reviewMessage({ rating: 2, customer_phone: "+919876543210", salesman: "Amit", source: "whatsapp" });
    expect(low.body).toContain("Call 9876543210");
    expect(low.body).toContain("Salesman Amit");
    const high = reviewMessage({ rating: 5, customer_phone: "9876543210", salesman: "Amit" });
    expect(high.body).not.toContain("Call");
  });
});
