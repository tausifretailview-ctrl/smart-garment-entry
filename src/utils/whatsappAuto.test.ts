import { describe, expect, it } from "vitest";
import {
  dueReminderMessage,
  inWindow,
  isSpecialDayToday,
  istDayStartIso,
  istNow,
  pickDueReminders,
  readWhatsAppAutoSettings,
  specialDayMessage,
  upiPayPageLink,
  BIRTHDAY_WINDOW,
} from "../../supabase/functions/_shared/whatsappAuto";

describe("automatic WhatsApp settings", () => {
  it("is off with safe defaults until turned on", () => {
    expect(readWhatsAppAutoSettings(null)).toMatchObject({
      dueEnabled: false,
      dueEveryDays: 7,
      dueMinAmount: 500,
      birthdayEnabled: false,
      birthdayPoints: 0,
    });
    const s = readWhatsAppAutoSettings({ auto_due_reminder_enabled: true, auto_due_reminder_every_days: 1, auto_birthday_points: -5 });
    expect(s.dueEnabled).toBe(true);
    expect(s.dueEveryDays).toBe(3);
    expect(s.birthdayPoints).toBe(0);
  });
});

describe("India clock", () => {
  it("uses India date and minutes", () => {
    const t = istNow(new Date("2026-10-26T19:00:00Z"));
    expect(t.date).toBe("2026-10-27");
    expect(t.minutes).toBe(30);
    expect(istDayStartIso("2026-10-27")).toBe("2026-10-26T18:30:00.000Z");
    expect(inWindow(10 * 60, BIRTHDAY_WINDOW)).toBe(true);
    expect(inWindow(13 * 60, BIRTHDAY_WINDOW)).toBe(false);
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

describe("payment-due reminders", () => {
  it("picks owing customers with a phone, not reminded lately, biggest first", () => {
    const picks = pickDueReminders(
      [
        { customer_id: "a", customer_name: "A", signed_balance: 600 },
        { customer_id: "b", customer_name: "B", signed_balance: 5000 },
        { customer_id: "c", customer_name: "C", signed_balance: 499.4 },
        { customer_id: "d", customer_name: "D", signed_balance: 9000 },
        { customer_id: "e", customer_name: "E", signed_balance: 7000 },
        { customer_id: "f", customer_name: "F", signed_balance: -800 },
      ],
      new Map([
        ["a", "98200 11122"],
        ["b", "+91 9876543210"],
        ["c", "9000000000"],
        ["d", "9111111111"],
        ["f", "9222222222"],
      ]),
      new Set(["d"]),
      500,
      5,
    );
    expect(picks.map((p) => p.customerId)).toEqual(["b", "a"]);
    expect(picks[0].phone).toBe("9876543210");
  });

  it("builds a UPI pay page link only when the shop has a UPI ID", () => {
    expect(upiPayPageLink({ siteUrl: "https://x.in/", upiId: "", shopName: "KS", amount: 10, note: "n" })).toBe("");
    const link = upiPayPageLink({ siteUrl: "https://x.in/", upiId: "ks@upi", shopName: "K&S Shop", amount: 1499.6, note: "Dues" });
    expect(link).toBe("https://x.in/pay?pa=ks%40upi&pn=KS+Shop&am=1500.00&tn=Dues");
    const msg = dueReminderMessage({ customerName: "Riya", shopName: "KS", amount: 1500, payLink: link });
    expect(msg).toContain("₹1,500 is pending");
    expect(msg).toContain(link);
    expect(dueReminderMessage({ customerName: "Riya", shopName: "KS", amount: 1500, payLink: "" })).not.toContain("UPI");
  });
});
