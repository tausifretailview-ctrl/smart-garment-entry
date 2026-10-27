import { describe, expect, it } from "vitest";
import {
  inWindow,
  isSpecialDayToday,
  istDayStartIso,
  istNow,
  readWhatsAppAutoSettings,
  specialDayMessage,
  BIRTHDAY_WINDOW,
} from "../../supabase/functions/_shared/whatsappAuto";

describe("automatic WhatsApp settings", () => {
  it("is off with safe defaults until turned on", () => {
    expect(readWhatsAppAutoSettings(null)).toMatchObject({ birthdayEnabled: false, birthdayOffer: "", birthdayPoints: 0 });
    const s = readWhatsAppAutoSettings({ auto_birthday_wish_enabled: true, auto_birthday_points: -5, auto_due_reminder_enabled: true });
    expect(s.birthdayEnabled).toBe(true);
    expect(s.birthdayPoints).toBe(0);
    expect(s).not.toHaveProperty("dueEnabled");
  });
});

describe("India clock", () => {
  it("uses India date and minutes", () => {
    const t = istNow(new Date("2026-10-26T19:00:00Z"));
    expect(t.date).toBe("2026-10-27");
    expect(t.minutes).toBe(30);
    expect(istDayStartIso("2026-10-27")).toBe("2026-10-26T18:30:00.000Z");
    expect(inWindow(10 * 60, BIRTHDAY_WINDOW)).toBe(true);
    expect(inWindow(14 * 60 + 59, BIRTHDAY_WINDOW)).toBe(true);
    expect(inWindow(15 * 60, BIRTHDAY_WINDOW)).toBe(false);
  });
});

describe("special days", () => {
  const today = { date: "2026-10-26", month: 10, day: 26 };
  it("matches day and month only", () => {
    expect(isSpecialDayToday("1990-10-26", today)).toBe(true);
    expect(isSpecialDayToday("1990-10-25", today)).toBe(false);
    expect(isSpecialDayToday(null, today)).toBe(false);
  });
  it("wishes 29 Feb birthdays on 28 Feb in other years", () => {
    expect(isSpecialDayToday("2000-02-29", { date: "2027-02-28", month: 2, day: 28 })).toBe(true);
    expect(isSpecialDayToday("2000-02-29", { date: "2028-02-28", month: 2, day: 28 })).toBe(false);
  });
  it("mentions bonus points and offer only when set", () => {
    const plain = specialDayMessage({ kind: "birthday", customerName: "Riya", shopName: "KS", offer: "", bonusPoints: 0 });
    expect(plain).toContain("Happy Birthday, Riya");
    expect(plain).not.toContain("bonus");
    const full = specialDayMessage({ kind: "anniversary", customerName: null, shopName: "KS", offer: "10% off", bonusPoints: 50 });
    expect(full).toContain("Happy Anniversary");
    expect(full).toContain("50 bonus points");
    expect(full).toContain("10% off");
  });
});
