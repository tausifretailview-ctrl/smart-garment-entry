/**
 * Automatic WhatsApp (Settings > WhatsApp > Automatic messages): payment-due reminders and
 * birthday / anniversary wishes, sent by the whatsapp-auto cron from the shop's own linked
 * number (Ezzy ERP WhatsApp or WappConnect). Pure helpers, shared with the app and tests.
 * Settings live in settings.sale_settings, so no new column is needed.
 */

export type WhatsAppAutoSettings = {
  dueEnabled: boolean;
  /** Days between two reminders to the same customer. */
  dueEveryDays: number;
  /** Customers owing less than this are not reminded. */
  dueMinAmount: number;
  birthdayEnabled: boolean;
  /** Shop's own offer line, e.g. "Show this message for 10% off till Sunday." */
  birthdayOffer: string;
  /** Bonus loyalty points added with the wish (only when the points system is on). */
  birthdayPoints: number;
};

export const DUE_EVERY_DAYS_DEFAULT = 7;
export const DUE_MIN_AMOUNT_DEFAULT = 500;
/** Most messages one shop sends in one 15-minute run (keeps the number's pace human). */
export const AUTO_SENDS_PER_RUN = 3;
/** Most payment reminders one shop sends in a day. */
export const DUE_REMINDERS_PER_DAY = 15;
/** India-time windows: wishes 10:00–13:00, reminders 11:00–13:00. */
export const BIRTHDAY_WINDOW = { from: 10 * 60, to: 13 * 60 };
export const DUE_WINDOW = { from: 11 * 60, to: 13 * 60 };

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function readWhatsAppAutoSettings(saleSettings: unknown): WhatsAppAutoSettings {
  const s = (saleSettings ?? {}) as Record<string, unknown>;
  return {
    dueEnabled: s.auto_due_reminder_enabled === true,
    dueEveryDays: num(s.auto_due_reminder_every_days, DUE_EVERY_DAYS_DEFAULT, 3, 60),
    dueMinAmount: num(s.auto_due_reminder_min_amount, DUE_MIN_AMOUNT_DEFAULT, 1, 10_000_000),
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

function rupees(amount: number): string {
  return Math.round(amount).toLocaleString("en-IN");
}

/** Public /pay page link (opens any UPI app with the amount filled in), or "" without a UPI ID. */
export function upiPayPageLink(opts: { siteUrl: string; upiId: string; shopName: string; amount: number; note: string }): string {
  const upi = opts.upiId.trim();
  if (!upi) return "";
  const params = new URLSearchParams({
    pa: upi,
    pn: opts.shopName.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 50) || "Shop",
    am: Math.round(opts.amount).toFixed(2),
    tn: opts.note.substring(0, 50),
  });
  return `${opts.siteUrl.replace(/\/+$/, "")}/pay?${params.toString()}`;
}

export function dueReminderMessage(opts: { customerName: string | null; shopName: string; amount: number; payLink: string }): string {
  const lines = [
    `Hello ${firstName(opts.customerName)},`,
    "",
    `A friendly reminder from ${opts.shopName || "our shop"}: ₹${rupees(opts.amount)} is pending on your account.`,
  ];
  if (opts.payLink) lines.push("", "Pay by UPI here:", opts.payLink);
  lines.push("", "If you have already paid, please ignore this message. Thank you! 🙏");
  return lines.join("\n");
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

export type DueCandidate = { customerId: string; name: string | null; phone: string; amount: number };

/**
 * Who gets a payment reminder now: owes at least the minimum, has a phone, was not reminded
 * in the last `everyDays`, biggest balance first.
 */
export function pickDueReminders(
  balances: Array<{ customer_id: string; customer_name?: string | null; signed_balance?: number | string | null }>,
  phones: Map<string, string>,
  recentlyReminded: Set<string>,
  minAmount: number,
  limit: number,
): DueCandidate[] {
  const out: DueCandidate[] = [];
  for (const b of balances) {
    const amount = Math.round(Number(b.signed_balance) || 0);
    if (amount < minAmount) continue;
    if (recentlyReminded.has(b.customer_id)) continue;
    const phone = tenDigits(phones.get(b.customer_id));
    if (!phone) continue;
    out.push({ customerId: b.customer_id, name: b.customer_name ?? null, phone, amount });
  }
  out.sort((a, b) => b.amount - a.amount);
  return out.slice(0, Math.max(0, limit));
}
