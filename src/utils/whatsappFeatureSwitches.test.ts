import { describe, expect, it } from "vitest";
import { isBulkWhatsAppEnabled, isGiftVoucherEnabled } from "./whatsappFeatureSwitches";

describe("WhatsApp feature switches", () => {
  it("stay off until the shop turns them on", () => {
    expect(isGiftVoucherEnabled(undefined)).toBe(false);
    expect(isGiftVoucherEnabled({})).toBe(false);
    expect(isGiftVoucherEnabled({ gift_vouchers_enabled: true })).toBe(true);
    expect(isBulkWhatsAppEnabled(null)).toBe(false);
    expect(isBulkWhatsAppEnabled({ bulk_whatsapp_enabled: false })).toBe(false);
    expect(isBulkWhatsAppEnabled({ bulk_whatsapp_enabled: true })).toBe(true);
  });
});
