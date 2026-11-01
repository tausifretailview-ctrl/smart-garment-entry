/**
 * Industrial mode (B2B trading, industrial units, warehouses).
 *
 * Two gates, both needed, so live retail shops never see a change:
 *  1. Platform Admin feature `industrial_mode` on the shop (DEMO first, others on request).
 *  2. Settings > Product > Industrial mode switch (`sale_settings.industrial_mode.enabled`).
 */

export const INDUSTRIAL_MODE_FEATURE = "industrial_mode";

export type CreditLimitAction = "warn" | "block";

export interface IndustrialModeConfig {
  enabled?: boolean;
  /** What happens when a sale bill takes the party over its credit limit. */
  credit_limit_action?: CreditLimitAction;
  /** Fill the bill due date from the party's credit days. */
  auto_due_date?: boolean;
}

export interface IndustrialModeSettings {
  enabled: boolean;
  credit_limit_action: CreditLimitAction;
  auto_due_date: boolean;
}

export const DEFAULT_INDUSTRIAL_MODE: IndustrialModeSettings = {
  enabled: false,
  credit_limit_action: "warn",
  auto_due_date: true,
};

export function resolveIndustrialMode(
  featureEnabled: boolean,
  config: IndustrialModeConfig | null | undefined,
): IndustrialModeSettings {
  if (!featureEnabled || !config?.enabled) return { ...DEFAULT_INDUSTRIAL_MODE };
  return {
    enabled: true,
    credit_limit_action: config.credit_limit_action === "block" ? "block" : "warn",
    auto_due_date: config.auto_due_date !== false,
  };
}

/** Party credit terms kept on the customer row (nullable columns, industrial mode only). */
export interface CustomerCreditTerms {
  credit_limit: number | null;
  credit_days: number | null;
  contact_person: string | null;
  pan_number: string | null;
}

export const EMPTY_CUSTOMER_CREDIT_TERMS: CustomerCreditTerms = {
  credit_limit: null,
  credit_days: null,
  contact_person: null,
  pan_number: null,
};

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Form text → row values. Throws a plain-language error on bad input. */
export function parseCustomerCreditTermsInput(input: {
  credit_limit: string;
  credit_days: string;
  contact_person: string;
  pan_number: string;
}): CustomerCreditTerms {
  const limitText = input.credit_limit.trim().replace(/,/g, "");
  let credit_limit: number | null = null;
  if (limitText) {
    const n = Number(limitText);
    if (!Number.isFinite(n) || n < 0) throw new Error("Credit limit must be an amount of 0 or more");
    credit_limit = Math.round(n * 100) / 100;
  }

  const daysText = input.credit_days.trim();
  let credit_days: number | null = null;
  if (daysText) {
    const n = Number(daysText);
    if (!Number.isInteger(n) || n < 0 || n > 365) throw new Error("Credit days must be a whole number from 0 to 365");
    credit_days = n;
  }

  const pan = input.pan_number.trim().toUpperCase();
  if (pan && !PAN_RE.test(pan)) throw new Error("PAN must look like ABCDE1234F");

  const contact = input.contact_person.trim();
  return {
    credit_limit,
    credit_days,
    contact_person: contact || null,
    pan_number: pan || null,
  };
}

/** Bill date + credit days (local calendar days). */
export function dueDateFromCreditDays(billDate: Date, creditDays: number | null | undefined): Date {
  const d = new Date(billDate.getFullYear(), billDate.getMonth(), billDate.getDate());
  const days = Number(creditDays);
  if (Number.isFinite(days) && days > 0) d.setDate(d.getDate() + Math.floor(days));
  return d;
}

export interface CreditLimitCheckInput {
  /** Party credit limit; null / 0 means no limit set. */
  creditLimit: number | null | undefined;
  /** Party net balance now (positive = party owes the shop), already including the bill being edited. */
  currentBalance: number;
  /** Net amount of this bill. */
  billAmount: number;
  /** Amount paid on this bill at save (cash / UPI / mix). */
  paidNow?: number;
  /** When editing, the bill's saved net amount (already inside currentBalance). */
  originalBillAmount?: number;
}

export interface CreditLimitCheck {
  hasLimit: boolean;
  /** Balance after this bill is saved. */
  balanceAfter: number;
  /** Limit − balance before this bill (can be negative). */
  availableBefore: number;
  /** How much this bill goes over the limit (0 when within). */
  overBy: number;
  exceeded: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function checkCreditLimit(input: CreditLimitCheckInput): CreditLimitCheck {
  const limit = Number(input.creditLimit);
  const hasLimit = Number.isFinite(limit) && limit > 0;
  const base = (Number(input.currentBalance) || 0) - (Number(input.originalBillAmount) || 0);
  const unpaid = Math.max(0, (Number(input.billAmount) || 0) - Math.max(0, Number(input.paidNow) || 0));
  const balanceAfter = round2(base + unpaid);
  if (!hasLimit) {
    return { hasLimit: false, balanceAfter, availableBefore: 0, overBy: 0, exceeded: false };
  }
  const overBy = round2(Math.max(0, balanceAfter - limit));
  return {
    hasLimit: true,
    balanceAfter,
    availableBefore: round2(limit - base),
    overBy,
    // Paise noise never blocks a bill.
    exceeded: overBy > 0.5,
  };
}

export function formatInr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
