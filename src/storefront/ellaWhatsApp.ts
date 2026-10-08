/**
 * Click-to-chat messages from the customer's own WhatsApp to the shop number.
 * No WhatsApp API involved: we open wa.me with the order text pre-filled and
 * the customer taps Send.
 */

import { formatStorefrontPrice } from "@/lib/storefrontStock";
import type { EllaCartLine } from "./ellaCart";
import {
  ellaOrderDueLater,
  ellaPayableNow,
  ellaPaymentMethodLabel,
  type EllaCustomerDetails,
  type EllaPaymentMethod,
} from "./ellaOrder";

/**
 * wa.me needs the country code. Shops usually save a bare 10-digit Indian
 * mobile (or 0-prefixed), which wa.me rejects, so add 91 for those.
 */
export function ellaWhatsAppNumber(raw: string | null | undefined): string {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  return digits;
}

/** wa.me link to the shop; null when the shop has no number to send to. */
export function ellaShopWhatsAppUrl(text: string, shopPhone: string | null | undefined): string | null {
  const digits = ellaWhatsAppNumber(shopPhone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function buildEllaOrderWhatsAppText(input: {
  shopName: string;
  orderRef: string;
  cart: EllaCartLine[];
  total: number;
  method: EllaPaymentMethod;
  customer: EllaCustomerDetails;
  upiReference?: string;
}): string {
  const { shopName, orderRef, cart, total, method, customer, upiReference } = input;
  const payNow = ellaPayableNow(total, method);
  const later = ellaOrderDueLater(total, method);
  const lines = cart.map((line, i) => {
    const size = line.size ? ` · Size ${line.size}` : "";
    const price = line.priceLabel ? ` · ${line.priceLabel}` : "";
    return `${i + 1}. ${line.name} (${line.code})${size} × ${line.qty}${price}`;
  });

  return [
    `Hi ${shopName.trim() || "team"}, I have placed an order on your website.`,
    "",
    `*Order ${orderRef}*`,
    ...lines,
    "",
    `Total: ${formatStorefrontPrice(total)}`,
    `Payment: ${ellaPaymentMethodLabel(method)}`,
    payNow > 0 ? `Paid now: ${formatStorefrontPrice(payNow)}` : null,
    later > 0 ? `Balance: ${formatStorefrontPrice(later)}` : null,
    upiReference ? `UPI ref: ${upiReference.trim()}` : null,
    "",
    `Name: ${customer.customerName.trim()}`,
    `Phone: ${customer.customerPhone.trim()}`,
    customer.address ? `Address: ${customer.address.replace(/\s+/g, " ").trim()}` : null,
    customer.pincode ? `PIN: ${customer.pincode.trim()}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function buildEllaEnquiryWhatsAppText(input: {
  shopName: string;
  customerName: string;
  customerPhone: string;
  product?: { name: string; code?: string | null; priceLabel?: string | null } | null;
  message?: string | null;
  paid?: boolean;
}): string {
  const { shopName, customerName, customerPhone, product, message, paid } = input;
  const what = product
    ? `${product.name}${product.code ? ` (${product.code})` : ""}`
    : "a studio visit";
  return [
    `Hi ${shopName.trim() || "team"}, I have ${paid ? "booked" : "sent an enquiry for"} ${what} on your website.`,
    product?.priceLabel ? `Price: ${product.priceLabel}` : null,
    message?.trim() ? `Note: ${message.trim()}` : null,
    "",
    `Name: ${customerName.trim()}`,
    `Phone: ${customerPhone.trim()}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * Try to open WhatsApp straight after the booking saves. Browsers allow this
 * only shortly after the tap, so the success screen always keeps a button too.
 */
export function openEllaWhatsApp(href: string | null): void {
  if (!href) return;
  try {
    window.open(href, "_blank", "noopener");
  } catch {
    /* popup blocked: the button on the success screen covers it */
  }
}
