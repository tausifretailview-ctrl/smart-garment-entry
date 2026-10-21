import { describe, expect, it } from "vitest";
import {
  buildSupportTokenMessage,
  isSupportCategory,
  supportPhoneDigits,
} from "../../supabase/functions/_shared/supportTokenMessage";

describe("supportPhoneDigits", () => {
  it("adds 91 to 10-digit numbers and drops a trunk 0", () => {
    expect(supportPhoneDigits("98203 30995")).toBe("919820330995");
    expect(supportPhoneDigits("09820330995")).toBe("919820330995");
    expect(supportPhoneDigits("+91 98203 30995")).toBe("919820330995");
  });

  it("rejects short numbers", () => {
    expect(supportPhoneDigits("12345")).toBeNull();
  });
});

describe("buildSupportTokenMessage", () => {
  const base = {
    tokenNo: 1001,
    shopName: "DEMO SHOP",
    userName: "Ravi",
    userEmail: "ravi@shop.in",
    phone: "9820330995",
    category: "technical" as const,
    message: "  Thermal print not coming  ",
    pagePath: "/demo/pos-sales",
    createdAt: new Date("2026-10-21T15:35:00Z"),
  };

  it("has the token, shop, user, phone, type, time, screen, issue and a chat link", () => {
    const text = buildSupportTokenMessage(base);
    expect(text).toContain("New Support Token #1001");
    expect(text).toContain("*Shop:* DEMO SHOP");
    expect(text).toContain("*User:* Ravi (ravi@shop.in)");
    expect(text).toContain("*Phone:* +919820330995");
    expect(text).toContain("*Type:* Technical issue");
    expect(text).toMatch(/\*Time:\* 21 Oct 2026, 9:05\s?pm/i);
    expect(text).toContain("*Screen:* /demo/pos-sales");
    expect(text).toContain("\nThermal print not coming\n");
    expect(text).toContain("https://wa.me/919820330995");
  });

  it("skips the screen line and chat link when not available", () => {
    const text = buildSupportTokenMessage({ ...base, pagePath: null, phone: "123" });
    expect(text).not.toContain("Screen:");
    expect(text).not.toContain("wa.me");
  });
});

describe("isSupportCategory", () => {
  it("accepts only known categories", () => {
    expect(isSupportCategory("doubt")).toBe(true);
    expect(isSupportCategory("toString")).toBe(false);
    expect(isSupportCategory(undefined)).toBe(false);
  });
});
