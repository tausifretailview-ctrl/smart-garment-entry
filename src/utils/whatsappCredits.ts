import { addYears, format, parseISO } from "date-fns";

/** Row of whatsapp_message_credits: Ezzy ERP WhatsApp message balance for one shop. */
export interface WhatsAppCredits {
  organization_id: string;
  balance: number;
  valid_until: string | null;
  used_count: number;
  last_topup_at: string | null;
  updated_at: string;
}

export type WhatsAppCreditState = "active" | "low" | "empty" | "expired";

export const LOW_BALANCE_AT = 50;

/** Today as yyyy-MM-dd in the browser's zone (India for our shops), matching valid_until. */
export function todayIso(now = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

export function defaultValidUntil(now = new Date()): string {
  return format(addYears(now, 1), "yyyy-MM-dd");
}

/** valid_until is inclusive: a balance valid until 22 Oct still works all of 22 Oct. */
export function creditState(c: Pick<WhatsAppCredits, "balance" | "valid_until">, now = new Date()): WhatsAppCreditState {
  if (c.valid_until && c.valid_until < todayIso(now)) return "expired";
  if (c.balance <= 0) return "empty";
  if (c.balance <= LOW_BALANCE_AT) return "low";
  return "active";
}

export function formatValidUntil(validUntil: string | null): string {
  return validUntil ? format(parseISO(validUntil), "dd MMM yyyy") : "-";
}

export const CREDIT_STATE_LABEL: Record<WhatsAppCreditState, string> = {
  active: "Active",
  low: "Low balance",
  empty: "Balance over",
  expired: "Expired",
};
