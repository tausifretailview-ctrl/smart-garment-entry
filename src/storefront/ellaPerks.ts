/**
 * Reward points and offer codes at website checkout.
 *
 * The shopper's mobile number is the same key the ERP, CRM points and the
 * Bill & Offers app use, so checkout asks for it first and then shows the
 * points on that number. Offer codes are the ones sent from Customer
 * notifications. Website orders are still billed by the shop in POS, so the
 * amounts here are what the shopper is quoted and pays by UPI; the shop
 * redeems the points and applies the code on the bill (the order message
 * carries both).
 */

import { formatStorefrontPrice } from "@/lib/storefrontStock";

export type StorefrontPerks = {
  known: boolean;
  pointsEnabled: boolean;
  points: number;
  redemptionEnabled: boolean;
  pointValue: number;
  minPoints: number;
  maxRedeemPercent: number;
  minPurchaseForRedemption: number;
  appSubdomain: string | null;
};

export type StorefrontOffer = {
  code: string;
  title: string;
  validTill: string | null;
  discountPercent: number | null;
  discountFlat: number | null;
  minOrder: number | null;
};

export type EllaOrderSavings = {
  offerCode: string | null;
  codeDiscount: number;
  pointsRedeemed: number;
  pointsAmount: number;
};

export const NO_SAVINGS: EllaOrderSavings = { offerCode: null, codeDiscount: 0, pointsRedeemed: 0, pointsAmount: 0 };

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positiveOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Digits the shop will match on. Indian numbers typed with +91 or a leading 0
 * become the plain 10 digits; anything else is returned as digits for the
 * server's 10–15 digit check. Null when it cannot be a mobile number.
 */
export function normalizeShopperMobile(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 10) return /^[6-9]/.test(digits) ? digits : null;
  if (digits.length === 11 && digits.startsWith("0")) return normalizeShopperMobile(digits.slice(1));
  if (digits.length === 12 && digits.startsWith("91")) return normalizeShopperMobile(digits.slice(2));
  if (digits.length > 12 && digits.length <= 15) return digits;
  return null;
}

export function perksFromRpc(data: unknown): StorefrontPerks | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.ok !== true) return null;
  const sub = typeof d.app_subdomain === "string" ? d.app_subdomain.trim() : "";
  return {
    known: d.known === true,
    pointsEnabled: d.points_enabled === true,
    points: Math.max(0, Math.floor(num(d.points, 0))),
    redemptionEnabled: d.redemption_enabled === true,
    pointValue: Math.max(0, num(d.point_value, 1)),
    minPoints: Math.max(0, num(d.min_points, 1)),
    maxRedeemPercent: Math.min(100, Math.max(0, num(d.max_redeem_percent, 50))),
    minPurchaseForRedemption: Math.max(0, num(d.min_purchase_for_redemption, 0)),
    appSubdomain: sub || null,
  };
}

export function offerFromRpc(data: unknown): StorefrontOffer | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.ok !== true || d.valid !== true) return null;
  return {
    code: String(d.code ?? "").trim().toUpperCase(),
    title: String(d.title ?? "").trim(),
    validTill: typeof d.valid_till === "string" ? d.valid_till : null,
    discountPercent: positiveOrNull(d.discount_percent),
    discountFlat: positiveOrNull(d.discount_flat),
    minOrder: positiveOrNull(d.min_order),
  };
}

/** True when the offer takes money off on the website (otherwise it is applied at billing). */
export function offerHasWebsiteDiscount(offer: StorefrontOffer | null): boolean {
  return !!offer && (offer.discountPercent != null || offer.discountFlat != null);
}

/** Rupees the code takes off this subtotal; 0 below the minimum order or with no website discount. */
export function ellaOfferDiscount(subtotal: number, offer: StorefrontOffer | null): number {
  if (!offer || !Number.isFinite(subtotal) || subtotal <= 0) return 0;
  if (offer.minOrder != null && subtotal < offer.minOrder) return 0;
  if (offer.discountPercent != null) {
    return Math.min(subtotal, Math.round((subtotal * Math.min(offer.discountPercent, 90)) / 100));
  }
  if (offer.discountFlat != null) return Math.min(subtotal, Math.round(offer.discountFlat));
  return 0;
}

/**
 * Most points usable on this amount, with the shop's POS rules: redemption on,
 * minimum balance, minimum purchase, and at most max% of the bill.
 */
export function ellaRedeemablePoints(amount: number, perks: StorefrontPerks | null): { points: number; amount: number } {
  const none = { points: 0, amount: 0 };
  if (!perks || !perks.pointsEnabled || !perks.redemptionEnabled) return none;
  if (perks.points <= 0 || perks.pointValue <= 0 || !Number.isFinite(amount) || amount <= 0) return none;
  if (amount < perks.minPurchaseForRedemption) return none;
  if (perks.points < perks.minPoints) return none;
  const maxAmount = (amount * perks.maxRedeemPercent) / 100;
  const points = Math.min(perks.points, Math.floor(maxAmount / perks.pointValue));
  if (points <= 0) return none;
  return { points, amount: Math.round(points * perks.pointValue) };
}

/** Code first, then points on what is left (points are capped as a share of the bill). */
export function ellaOrderSavings(input: {
  subtotal: number;
  offer: StorefrontOffer | null;
  perks: StorefrontPerks | null;
  usePoints: boolean;
}): EllaOrderSavings & { payable: number } {
  const { subtotal, offer, perks, usePoints } = input;
  const codeDiscount = ellaOfferDiscount(subtotal, offer);
  const afterCode = Math.max(0, subtotal - codeDiscount);
  const redeem = usePoints ? ellaRedeemablePoints(afterCode, perks) : { points: 0, amount: 0 };
  return {
    offerCode: offer?.code || null,
    codeDiscount,
    pointsRedeemed: redeem.points,
    pointsAmount: redeem.amount,
    payable: Math.max(0, afterCode - redeem.amount),
  };
}

/** Short lines for the order message / WhatsApp text, e.g. "Code DIWALI -₹200". */
export function ellaSavingsLines(savings: EllaOrderSavings | undefined, style: "short" | "long"): string[] {
  if (!savings) return [];
  const out: string[] = [];
  if (savings.offerCode) {
    const off = savings.codeDiscount > 0 ? ` -${formatStorefrontPrice(savings.codeDiscount)}` : " (apply at billing)";
    out.push(style === "short" ? `Code ${savings.offerCode}${off}` : `Offer code: ${savings.offerCode}${off}`);
  }
  if (savings.pointsRedeemed > 0) {
    const off = ` -${formatStorefrontPrice(savings.pointsAmount)}`;
    out.push(
      style === "short"
        ? `Points ${savings.pointsRedeemed}${off}`
        : `Reward points used: ${savings.pointsRedeemed}${off}`,
    );
  }
  return out;
}

/** Customer app address for this shop, when the shop has one and the ERP build knows the domain. */
export function shopperAppUrl(appSubdomain: string | null, baseDomain: string): string | null {
  const sub = String(appSubdomain || "").trim().toLowerCase();
  const base = String(baseDomain || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
  if (!sub || !base || !/^[a-z0-9-]+$/.test(sub)) return null;
  return `https://${sub}.${base}/`;
}
