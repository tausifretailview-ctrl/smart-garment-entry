/**
 * Customer birthdays and anniversaries (customers.birthday / customers.anniversary,
 * stored as plain dates; only day and month matter for wishes).
 */

export type SpecialDayKind = "birthday" | "anniversary";

export type SpecialDayCustomer = {
  id: string;
  customer_name: string | null;
  phone: string | null;
  birthday?: string | null;
  anniversary?: string | null;
};

export type UpcomingSpecialDay = {
  customer: SpecialDayCustomer;
  kind: SpecialDayKind;
  /** 0 = today. */
  daysAway: number;
  /** The coming date it falls on (local calendar day). */
  on: Date;
};

/** "2026-10-19" or "2026-10-19T…" → month (1-12) and day, or null when unset/bad. */
export function parseMonthDay(value: string | null | undefined): { month: number; day: number } | null {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** This year's (or next year's) date for a day/month; 29 Feb is wished on 28 Feb in other years. */
function occurrenceInYear(year: number, month: number, day: number): Date {
  const d = month === 2 && day === 29 && !isLeapYear(year) ? 28 : day;
  return new Date(year, month - 1, d);
}

/** Whole days from `today` to the next time this day/month comes round (0 = today). */
export function daysUntilNext(value: string | null | undefined, today: Date): number | null {
  const md = parseMonthDay(value);
  if (!md) return null;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = occurrenceInYear(start.getFullYear(), md.month, md.day);
  if (next < start) next = occurrenceInYear(start.getFullYear() + 1, md.month, md.day);
  return Math.round((next.getTime() - start.getTime()) / 86_400_000);
}

/** Birthdays and anniversaries in the next `withinDays` days (0 = today only), soonest first. */
export function upcomingSpecialDays(
  customers: SpecialDayCustomer[],
  today: Date,
  withinDays: number,
): UpcomingSpecialDay[] {
  const out: UpcomingSpecialDay[] = [];
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (const customer of customers) {
    for (const kind of ["birthday", "anniversary"] as const) {
      const days = daysUntilNext(customer[kind], start);
      if (days == null || days > withinDays) continue;
      out.push({
        customer,
        kind,
        daysAway: days,
        on: new Date(start.getFullYear(), start.getMonth(), start.getDate() + days),
      });
    }
  }
  return out.sort(
    (a, b) =>
      a.daysAway - b.daysAway ||
      String(a.customer.customer_name || "").localeCompare(String(b.customer.customer_name || "")),
  );
}

/** Default WhatsApp wish; shops can edit it before sending. */
export function specialDayWishMessage(kind: SpecialDayKind, customerName: string | null, shopName: string | null): string {
  const name = String(customerName || "").trim();
  const greetName = name && !/^walk.?in/i.test(name) ? ` ${titleCase(name)}` : "";
  const shop = String(shopName || "").trim();
  const from = shop ? `\n\nWarm wishes from ${shop}. Visit us this week for a special gift on your shopping!` : "";
  return kind === "birthday"
    ? `Happy Birthday${greetName}! 🎂🎉${from}`
    : `Happy Anniversary${greetName}! 💐🎉${from}`;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** Value for <input type="date">, or "" (keeps only a valid yyyy-mm-dd). */
export function toDateInputValue(value: string | null | undefined): string {
  const m = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

/** Postgres "column does not exist" — the birthday SQL has not been run yet. */
export function isMissingSpecialDayColumnError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  const msg = String(e?.message || "");
  return e?.code === "42703" || e?.code === "PGRST204" || (/(birthday|anniversary)/i.test(msg) && /column/i.test(msg));
}
