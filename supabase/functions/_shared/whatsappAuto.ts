/**
 * Automatic WhatsApp (Settings > WhatsApp > Automatic messages): birthday / anniversary
 * wishes, sent by the whatsapp-auto cron from the shop's own linked number (Ezzy ERP WhatsApp
 * or WappConnect). Payment reminders stay manual: a balance may be an advance against goods. Pure helpers, shared with the app and tests.
 * Settings live in settings.sale_settings, so no new column is needed.
 */

export type WhatsAppAutoSettings = {
  birthdayEnabled: boolean;
  /** Shop's own offer line, e.g. "Show this message for 10% off till Sunday." */
  birthdayOffer: string;
  /** Bonus loyalty points added with the wish (only when the points system is on). */
  birthdayPoints: number;
};

/** Most messages one shop sends in one 15-minute run (keeps the number's pace human). */
export const AUTO_SENDS_PER_RUN = 4;
/** India-time window for wishes: 10:00–15:00 (20 runs x AUTO_SENDS_PER_RUN = 80 wishes a day per shop). */
export const BIRTHDAY_WINDOW = { from: 10 * 60, to: 15 * 60 };

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function readWhatsAppAutoSettings(saleSettings: unknown): WhatsAppAutoSettings {
  const s = (saleSettings ?? {}) as Record<string, unknown>;
  return {
    birthdayEnabled: s.auto_birthday_wish_enabled === true,
    birthdayOffer: String(s.auto_birthday_offer ?? "").trim().slice(0, 300),
    birthdayPoints: num(s.auto_birthday_points, 0, 0, 100_000),
  };
}

/** India date "yyyy-mm-dd" and minutes since India midnight. */
export function istNow(now = new Date()): { date: string; minutes: number; month: number; day: number } {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return {
    date: ist.toISOString().slice(0, 10),
    minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
    month: ist.getUTCMonth() + 1,
    day: ist.getUTCDate(),
  };
}

/** UTC instant of India midnight for an India date. */
export function istDayStartIso(date: string): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() - 330 * 60_000).toISOString();
}

export function inWindow(minutes: number, w: { from: number; to: number }): boolean {
  return minutes >= w.from && minutes < w.to;
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** True when a stored date ("1990-10-26") falls on today's day and month; 29 Feb → 28 Feb. */
export function isSpecialDayToday(value: string | null | undefined, today: { date: string; month: number; day: number }): boolean {
  const m = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return false;
  const month = Number(m[2]);
  let day = Number(m[3]);
  const year = Number(today.date.slice(0, 4));
  if (month === 2 && day === 29 && !isLeap(year)) day = 28;
  return month === today.month && day === today.day;
}

export function tenDigits(phone: string | null | undefined): string {
  const d = String(phone ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}

function firstName(name: string | null | undefined): string {
  const n = String(name ?? "").trim();
  return n || "there";
}

export type SpecialDayKind = "birthday" | "anniversary";

export function specialDayMessage(opts: {
  kind: SpecialDayKind;
  customerName: string | null;
  shopName: string;
  offer: string;
  bonusPoints: number;
}): string {
  const head = opts.kind === "birthday"
    ? `🎂 Happy Birthday, ${firstName(opts.customerName)}!`
    : `💐 Happy Anniversary, ${firstName(opts.customerName)}!`;
  const lines = [head, "", `Warm wishes from all of us at ${opts.shopName || "our shop"}.`];
  if (opts.bonusPoints > 0) {
    lines.push("", `🎁 We have added ${opts.bonusPoints} bonus points to your account. Use them on your next visit.`);
  }
  if (opts.offer) lines.push("", opts.offer);
  return lines.join("\n");
}
