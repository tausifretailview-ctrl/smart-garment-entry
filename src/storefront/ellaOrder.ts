import type { EllaCartLine } from "./ellaCart";
import { ellaCartSummaryText, ellaCartTotal } from "./ellaCart";
import { formatStorefrontPrice } from "@/lib/storefrontStock";
import { normalizeEnquiryPhone } from "@/lib/storefrontEnquiry";

export type EllaPaymentMethod = "upi" | "cod" | "advance";

export type EllaCheckoutDetails = {
  customerName: string;
  customerPhone: string;
  address: string;
  pincode: string;
  paymentMethod: EllaPaymentMethod;
  upiReference: string;
};

export function validateEllaCheckout(
  details: EllaCheckoutDetails,
  cart: EllaCartLine[],
): { ok: true; value: EllaCheckoutDetails } | { ok: false; error: string } {
  const customerName = details.customerName.trim();
  const customerPhone = normalizeEnquiryPhone(details.customerPhone);
  const address = details.address.trim();
  const pincode = details.pincode.trim();
  const upiReference = details.upiReference.trim();
  const paymentMethod = details.paymentMethod;

  if (cart.length === 0) return { ok: false, error: "Your bag is empty" };
  if (customerName.length < 2 || customerName.length > 80) {
    return { ok: false, error: "Please enter your name" };
  }
  if (customerPhone.length < 10 || customerPhone.length > 15) {
    return { ok: false, error: "Please enter a valid mobile number" };
  }
  if (address.length < 8) return { ok: false, error: "Please enter a delivery address" };
  if (!/^\d{6}$/.test(pincode)) return { ok: false, error: "Please enter a 6-digit pincode" };
  if (paymentMethod === "upi" && upiReference.length < 4) {
    return { ok: false, error: "Enter the UPI reference after you pay" };
  }

  return {
    ok: true,
    value: {
      customerName,
      customerPhone,
      address,
      pincode,
      paymentMethod,
      upiReference,
    },
  };
}

export function formatEllaOrderMessage(cart: EllaCartLine[], details: EllaCheckoutDetails): string {
  const total = formatStorefrontPrice(ellaCartTotal(cart));
  const lines = [
    "STORE ORDER",
    ellaCartSummaryText(cart),
    `Total: ${total || "—"}`,
    `Name: ${details.customerName}`,
    `Phone: ${details.customerPhone}`,
    `Address: ${details.address}`,
    `Pincode: ${details.pincode}`,
    `Pay: ${details.paymentMethod}`,
  ];
  if (details.paymentMethod === "upi") {
    lines.push(`UPI ref: ${details.upiReference}`);
  }
  return lines.join(" · ");
}
