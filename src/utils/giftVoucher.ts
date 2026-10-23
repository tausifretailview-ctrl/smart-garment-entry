import { addMonths, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

/**
 * Gift vouchers are customer advances booked in the receiver's name (no new accounting).
 * A short code is printed on the voucher; at POS the code picks that customer and the
 * existing "apply advance" step takes the amount off the bill.
 */

export const GIFT_VOUCHER_VALIDITY_OPTIONS = [3, 6, 12] as const;
export const DEFAULT_GIFT_VOUCHER_MONTHS = 6;

// No 0/O/1/I/L so a code read out over the counter is not mistyped.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateGiftVoucherCode(random: () => number = Math.random): string {
  let code = "GV";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

export function normalizeGiftVoucherCode(raw: string): string {
  // Commas and brackets would break the lookup filter; codes and receipt numbers never have them.
  return raw.replace(/[\s,()]/g, "").toUpperCase();
}

export function giftVoucherExpiry(from: Date, months: number): Date {
  return addMonths(from, months);
}

export function giftVoucherDescription(code: string, validTill: Date, giver?: string, note?: string): string {
  const parts = [`Gift voucher ${code}`];
  if (giver?.trim()) parts.push(`from ${giver.trim()}`);
  parts.push(`valid till ${format(validTill, "dd MMM yyyy")}`);
  const text = parts.join(", ");
  return note?.trim() ? `${text} · ${note.trim()}` : text;
}

/** WhatsApp text for the receiver; amount in whole rupees like other WhatsApp messages. */
export function giftVoucherWhatsAppText(input: {
  shopName: string;
  receiverName: string;
  amount: number;
  code: string;
  validTill?: string;
  from?: string;
}): string {
  const lines = [
    `🎁 *Gift Voucher from ${input.shopName}*`,
    "",
    `Hi ${input.receiverName}${input.from ? `, ${input.from} has sent you a gift!` : ","}`,
    `Voucher worth *₹${Math.round(input.amount).toLocaleString("en-IN")}*`,
    `Code: *${input.code}*`,
  ];
  if (input.validTill) lines.push(`Valid till ${input.validTill}`);
  lines.push("", "Show this code at the billing counter to use it.");
  return lines.join("\n");
}

/** wa.me number: Indian 10-digit mobiles get 91 in front. */
export function giftVoucherWhatsAppPhone(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
}

export interface GiftVoucherLookup {
  advanceId: string;
  code: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  amount: number;
  remaining: number;
  expiresOn: string | null;
  expired: boolean;
}

/** Finds a voucher by its code (or by the advance receipt number, which also works). */
export async function lookupGiftVoucher(organizationId: string, rawCode: string): Promise<GiftVoucherLookup | null> {
  const code = normalizeGiftVoucherCode(rawCode);
  if (code.length < 4) return null;
  const run = (cols: string, filter: string) =>
    supabase.from("customer_advances").select(cols).eq("organization_id", organizationId).or(filter).limit(1);
  let res = await run(
    "id, advance_number, voucher_code, voucher_expires_on, amount, used_amount, customer_id, customers(customer_name, phone)",
    `voucher_code.ilike.${code},advance_number.ilike.${code}`,
  );
  // Before the gift voucher SQL runs there are no voucher columns: the receipt number still works.
  if (res.error) {
    res = await run("id, advance_number, amount, used_amount, customer_id, customers(customer_name, phone)", `advance_number.ilike.${code}`);
  }
  if (res.error) throw res.error;
  const data = res.data as unknown as Record<string, unknown>[] | null;
  const row = data?.[0];
  if (!row) return null;
  const customer = (row.customers ?? {}) as { customer_name?: string; phone?: string | null };
  const amount = Number(row.amount) || 0;
  const remaining = Math.max(0, Math.round((amount - (Number(row.used_amount) || 0)) * 100) / 100);
  const expiresOn = (row.voucher_expires_on as string | null) ?? null;
  return {
    advanceId: String(row.id),
    code: String(row.voucher_code ?? row.advance_number ?? code),
    customerId: String(row.customer_id),
    customerName: customer.customer_name ?? "Customer",
    customerPhone: customer.phone ?? null,
    amount,
    remaining,
    expiresOn,
    expired: Boolean(expiresOn && expiresOn < format(new Date(), "yyyy-MM-dd")),
  };
}
