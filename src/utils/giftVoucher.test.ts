import { describe, expect, it } from "vitest";
import {
  generateGiftVoucherCode,
  giftVoucherDescription,
  giftVoucherWhatsAppPhone,
  giftVoucherWhatsAppText,
  normalizeGiftVoucherCode,
} from "./giftVoucher";

describe("gift voucher helpers", () => {
  it("makes GV + 6 easy-to-read characters", () => {
    const code = generateGiftVoucherCode(() => 0);
    expect(code).toBe("GV222222");
    expect(generateGiftVoucherCode()).toMatch(/^GV[2-9A-HJKMNP-Z]{6}$/);
  });

  it("keeps receipt-number hyphens and slashes, drops spaces", () => {
    expect(normalizeGiftVoucherCode(" gv7k 2m9q ")).toBe("GV7K2M9Q");
    expect(normalizeGiftVoucherCode("adv/26-27/12")).toBe("ADV/26-27/12");
  });

  it("writes the advance note and the WhatsApp message", () => {
    expect(giftVoucherDescription("GV7K2M9Q", new Date(2027, 3, 23), "Rahul", "Birthday")).toBe(
      "Gift voucher GV7K2M9Q, from Rahul, valid till 23 Apr 2027 · Birthday",
    );
    const text = giftVoucherWhatsAppText({ shopName: "KS", receiverName: "Ayesha", amount: 1999.6, code: "GV7K2M9Q" });
    expect(text).toContain("₹2,000");
    expect(text).toContain("Code: *GV7K2M9Q*");
    expect(giftVoucherWhatsAppPhone("98200 12345")).toBe("919820012345");
  });
});
