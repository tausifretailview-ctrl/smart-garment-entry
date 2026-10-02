// Owner alert timing and message text. Pure (no Deno / Supabase APIs) so the
// edge function and Vitest share it. All shop times are India Standard Time.

export type InvoiceMode = "off" | "all" | "above";

export interface OwnerAlertSettings {
  enabled: boolean;
  cashier_enabled: boolean;
  /** 2 or 3 */
  cashier_every_hours: number;
  /** "HH:MM" IST */
  shop_open: string;
  shop_close: string;
  low_stock_enabled: boolean;
  /** "HH:MM" IST, e.g. ["10:00", "17:00"] */
  low_stock_times: string[];
  low_stock_threshold: number;
  invoice_mode: InvoiceMode;
  invoice_min_amount: number;
  day_end_enabled: boolean;
  /** "HH:MM" IST */
  day_end_time: string;
}

export interface CashierTotals {
  totalBills: number;
  totalAmount: number;
  totalCash: number;
  totalUpi: number;
  totalCard: number;
  totalBalance: number;
  refundAmount: number;
  totalSaleReturnAdjust: number;
}

const IST_OFFSET_MIN = 330;

/** IST calendar date ("YYYY-MM-DD") and minutes since IST midnight for an instant. */
export function istClock(now: Date): { date: string; minutes: number } {
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  const date = ist.toISOString().slice(0, 10);
  return { date, minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
}

/** UTC instant of IST midnight that starts `date` ("YYYY-MM-DD"). */
export function istDayStartUtc(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) - IST_OFFSET_MIN * 60_000);
}

/** "HH:MM" → minutes; null when malformed. */
export function parseHm(value: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** "14:00" → "2 PM", "09:30" → "9:30 AM". */
export function formatHm(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * Cashier report slot due now, as a stable key (e.g. "2026-10-02@14:00"), or null.
 * Slots fall every N hours after shop_open, strictly after opening and before closing.
 * The cron runs every 15 minutes, so a slot stays due for one 15-minute window.
 * The send log (unique per slot key) stops a repeat if the cron fires twice.
 */
export function dueCashierSlot(s: OwnerAlertSettings, now: Date, windowMin = 15): string | null {
  if (!s.enabled || !s.cashier_enabled) return null;
  const every = s.cashier_every_hours === 3 ? 3 : 2;
  const open = parseHm(s.shop_open);
  const close = parseHm(s.shop_close);
  if (open == null || close == null || close <= open) return null;
  const { date, minutes } = istClock(now);
  for (let slot = open + every * 60; slot < close; slot += every * 60) {
    if (minutes >= slot && minutes < slot + windowMin) {
      return `${date}@${String(Math.floor(slot / 60)).padStart(2, "0")}:${String(slot % 60).padStart(2, "0")}`;
    }
  }
  return null;
}

/** A once-a-day time ("HH:MM") falling in this 15-minute window → key, else null. */
function dueAt(time: string, now: Date, windowMin: number): string | null {
  const at = parseHm(time);
  if (at == null) return null;
  const { date, minutes } = istClock(now);
  return minutes >= at && minutes < at + windowMin
    ? `${date}@${String(Math.floor(at / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`
    : null;
}

export function dueLowStockSlot(s: OwnerAlertSettings, now: Date, windowMin = 15): string | null {
  if (!s.enabled || !s.low_stock_enabled) return null;
  for (const t of s.low_stock_times ?? []) {
    const key = dueAt(t, now, windowMin);
    if (key) return key;
  }
  return null;
}

export function dueDayEndSlot(s: OwnerAlertSettings, now: Date, windowMin = 15): string | null {
  if (!s.enabled || !s.day_end_enabled) return null;
  return dueAt(s.day_end_time, now, windowMin);
}

export function shouldSendInvoiceAlert(s: OwnerAlertSettings, amount: number): boolean {
  if (!s.enabled) return false;
  if (s.invoice_mode === "all") return true;
  if (s.invoice_mode === "above") return Number(amount) >= Math.max(0, Number(s.invoice_min_amount) || 0);
  return false;
}

export function formatInr(n: number): string {
  return `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
}

function totalsLine(t: CashierTotals): string {
  const parts = [`Sales ${formatInr(t.totalAmount)} (${t.totalBills} bill${t.totalBills === 1 ? "" : "s"})`];
  if (t.totalCash) parts.push(`Cash ${formatInr(t.totalCash)}`);
  if (t.totalUpi) parts.push(`UPI ${formatInr(t.totalUpi)}`);
  if (t.totalCard) parts.push(`Card ${formatInr(t.totalCard)}`);
  if (t.totalBalance > 0.5) parts.push(`Due ${formatInr(t.totalBalance)}`);
  if (t.totalSaleReturnAdjust > 0.5) parts.push(`Returns ${formatInr(t.totalSaleReturnAdjust)}`);
  if (t.refundAmount > 0.5) parts.push(`Refunds ${formatInr(t.refundAmount)}`);
  return parts.join(" · ");
}

export function cashierMessage(slotMinutes: number, t: CashierTotals): { title: string; body: string } {
  return { title: `Cashier report ${formatHm(slotMinutes)}`, body: totalsLine(t) };
}

export function dayEndMessage(date: string, t: CashierTotals): { title: string; body: string } {
  return { title: `Day-end summary ${date.split("-").reverse().join("-")}`, body: totalsLine(t) };
}

export function lowStockMessage(rows: Array<{ product_name: string; brand?: string | null }>): {
  title: string;
  body: string;
} | null {
  if (!rows.length) return null;
  const names = rows.slice(0, 3).map((r) => (r.brand?.trim() ? `${r.product_name} (${r.brand.trim()})` : r.product_name));
  const more = rows.length - names.length;
  return {
    title: `${rows.length} product${rows.length === 1 ? "" : "s"} low on stock`,
    body: more > 0 ? `${names.join(", ")} +${more} more` : names.join(", "),
  };
}

export function invoiceMessage(sale: {
  sale_number: string;
  net_amount: number;
  customer_name?: string | null;
  payment_method?: string | null;
}): { title: string; body: string } {
  const who = sale.customer_name?.trim() || "Walk-in";
  const mode = sale.payment_method ? ` · ${String(sale.payment_method).replace(/_/g, " ")}` : "";
  return { title: `New bill ${sale.sale_number}`, body: `${formatInr(sale.net_amount)} · ${who}${mode}` };
}

/** Minutes of a slot key "YYYY-MM-DD@HH:MM". */
export function slotMinutes(key: string): number {
  return parseHm(key.split("@")[1] ?? "") ?? 0;
}
