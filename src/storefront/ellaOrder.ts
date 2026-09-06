/**
 * Order maths and the message that lands in Ezzy ERP.
 *
 * Until a dedicated `submit_public_storefront_order` RPC exists, an order is
 * submitted through the existing enquiry RPC with a structured message, so the
 * studio gets customer details, sizes, payment method and the UPI reference in
 * one readable block. `buildEllaOrderMessage` keeps it inside the 1000-char
 * limit enforced by `validateEnquiryInput`.
 */

import { formatStorefrontPrice } from "@/lib/storefrontStock";
import type { EllaCartLine } from "./ellaCart";

export type EllaPaymentMethod = "upi" | "cod" | "advance";

export const ELLA_COD_FEE = 80;
export const ELLA_COD_MAX = 10000;
export const ELLA_ADVANCE_PERCENT = 30;
export const ELLA_ORDER_MESSAGE_MAX = 1000;

export type EllaCustomerDetails = {
  customerName: string;
  customerPhone: string;
  address: string;
  pincode: string;
};

export function ellaAdvanceAmount(total: number, percent = ELLA_ADVANCE_PERCENT): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.round((total * percent) / 100);
}

export function ellaCodFee(method: EllaPaymentMethod): number {
  return method === "cod" ? ELLA_COD_FEE : 0;
}

/** COD is ready-to-wear only and capped — made-to-order lines must take the advance. */
export function ellaCodEligible(cart: EllaCartLine[], total: number): boolean {
  if (total <= 0 || total > ELLA_COD_MAX) return false;
  return cart.every((line) => line.madeToOrder !== true);
}

export function ellaHasMadeToOrder(cart: EllaCartLine[]): boolean {
  return cart.some((line) => line.madeToOrder === true);
}

export function ellaPayableNow(total: number, method: EllaPaymentMethod): number {
  if (method === "cod") return 0;
  if (method === "advance") return ellaAdvanceAmount(total);
  return total;
}

export function ellaOrderDueLater(total: number, method: EllaPaymentMethod): number {
  if (method === "cod") return total + ELLA_COD_FEE;
  if (method === "advance") return total - ellaAdvanceAmount(total);
  return 0;
}

export function ellaPaymentMethodLabel(method: EllaPaymentMethod): string {
  if (method === "cod") return "Cash on delivery";
  if (method === "advance") return `${ELLA_ADVANCE_PERCENT}% advance (UPI)`;
  return "UPI — paid in full";
}

/** UPI reference / UTR: 12 digits on most PSPs, but allow 6–24 alphanumerics. */
export function isValidUpiReference(raw: string): boolean {
  return /^[A-Za-z0-9]{6,24}$/.test(String(raw || "").trim());
}

export function ellaOrderLinesText(cart: EllaCartLine[]): string {
  return cart
    .map((line) => {
      const size = line.size ? ` ${line.size}` : "";
      const price = line.priceLabel ? ` @${line.priceLabel}` : "";
      return `${line.code}${size} x${line.qty}${price}`;
    })
    .join("; ");
}

export function buildEllaOrderMessage(input: {
  cart: EllaCartLine[];
  total: number;
  method: EllaPaymentMethod;
  customer: EllaCustomerDetails;
  upiReference?: string;
}): string {
  const { cart, total, method, customer, upiReference } = input;
  const payNow = ellaPayableNow(total, method);
  const later = ellaOrderDueLater(total, method);

  const parts = [
    "STORE ORDER",
    ellaOrderLinesText(cart),
    `Total ${formatStorefrontPrice(total)}`,
    `Pay ${ellaPaymentMethodLabel(method)}`,
    payNow > 0 ? `Paid now ${formatStorefrontPrice(payNow)}` : null,
    later > 0 ? `Due later ${formatStorefrontPrice(later)}` : null,
    upiReference ? `UTR ${upiReference.trim()}` : null,
    customer.address ? `Ship: ${customer.address.replace(/\s+/g, " ").trim()}` : null,
    customer.pincode ? `PIN ${customer.pincode.trim()}` : null,
  ].filter(Boolean) as string[];

  const message = parts.join(" · ");
  return message.length > ELLA_ORDER_MESSAGE_MAX
    ? `${message.slice(0, ELLA_ORDER_MESSAGE_MAX - 1)}…`
    : message;
}

export function validateEllaOrderDetails(
  customer: EllaCustomerDetails,
  method: EllaPaymentMethod,
  upiReference: string,
): { ok: true } | { ok: false; error: string } {
  if (customer.address.trim().length < 10) {
    return { ok: false, error: "Please enter a full delivery address" };
  }
  if (!/^\d{6}$/.test(customer.pincode.trim())) {
    return { ok: false, error: "Please enter a valid 6-digit PIN code" };
  }
  if (method !== "cod" && !isValidUpiReference(upiReference)) {
    return { ok: false, error: "Please paste the UPI reference number from your payment app" };
  }
  return { ok: true };
}
