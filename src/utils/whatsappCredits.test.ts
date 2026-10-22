import { describe, expect, it } from "vitest";
import { creditState, defaultValidUntil } from "./whatsappCredits";
import { creditBlockReason } from "../../supabase/functions/_shared/whatsappCredits";

const now = new Date(2026, 9, 22, 12, 0, 0);

describe("creditState", () => {
  it("is active with balance and a future validity", () => {
    expect(creditState({ balance: 900, valid_until: "2027-10-22" }, now)).toBe("active");
  });
  it("still works on the last valid day", () => {
    expect(creditState({ balance: 900, valid_until: "2026-10-22" }, now)).toBe("active");
  });
  it("is expired the day after validity, even with balance left", () => {
    expect(creditState({ balance: 900, valid_until: "2026-10-21" }, now)).toBe("expired");
  });
  it("is low at 50 or fewer, over at 0 or below", () => {
    expect(creditState({ balance: 50, valid_until: null }, now)).toBe("low");
    expect(creditState({ balance: 0, valid_until: null }, now)).toBe("empty");
    expect(creditState({ balance: -3, valid_until: "2027-01-01" }, now)).toBe("empty");
  });
});

describe("defaultValidUntil", () => {
  it("is one year from today", () => {
    expect(defaultValidUntil(now)).toBe("2027-10-22");
  });
});


describe("creditBlockReason (send-whatsapp)", () => {
  // 22 Oct 2026 20:00 IST
  const at = new Date("2026-10-22T14:30:00Z");
  it("lets shops without a balance row send", () => {
    expect(creditBlockReason(null, at)).toBeNull();
  });
  it("lets a shop send with balance on its last valid day", () => {
    expect(creditBlockReason({ balance: 1, valid_until: "2026-10-22" }, at)).toBeNull();
  });
  it("blocks at 0 or below", () => {
    expect(creditBlockReason({ balance: 0, valid_until: "2027-10-22" }, at)).toMatch(/balance is over/);
  });
  it("blocks after validity, using India date", () => {
    // 23 Oct 00:30 IST is still 22 Oct in UTC
    const lateNight = new Date("2026-10-22T19:00:00Z");
    expect(creditBlockReason({ balance: 500, valid_until: "2026-10-22" }, lateNight)).toMatch(/validity is over/);
  });
});
