import { supabase } from "@/integrations/supabase/client";
import { appendCustomerPageLinkLine, appendGoogleReviewLine } from "@/utils/customerPageLink";

/**
 * WhatsApp's own markup (*bold*, _italic_) and a few common emojis. Sent as plain
 * UTF-8 text through the same WappConnect call as before (no buttons/templates).
 * Lines holding {organization_address} / {organization_phone} are dropped when
 * the shop has not filled those in Settings.
 */
export const DEFAULT_SALES_INVOICE = `🏬 *{organization_name}*
📍 {organization_address}
📞 {organization_phone}

Hello *{customer_name}* 👋
Thank you for shopping with us! Your invoice is attached below.

🧾 *Invoice No:* {invoice_number}
📅 *Date:* {invoice_date}
💰 *Amount:* {amount}
💳 *Payment:* {payment_status}

🙏 Thank you for your business!
_Please visit again._

👉 Reply *OK* to save our number and get your bill updates.`;

/** Whole rupees, like the printed bill total (₹800.4 → ₹800). */
function formatInr(value: unknown): string {
  const num = Math.round(Number(value ?? 0) || 0);
  return `₹${num.toLocaleString("en-IN")}`;
}

function formatDateIn(value: unknown): string {
  if (!value) return "";
  try {
    return new Date(String(value)).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(value);
  }
}

/** Whole points only; 0 / missing = "" so the points line is left out. */
function pointsText(value: unknown): string {
  const n = Math.floor(Number(value ?? 0) || 0);
  return n > 0 ? n.toLocaleString("en-IN") : "";
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/** Settings address can be multi-line; WhatsApp header reads better on one line. */
function oneLine(value: unknown): string {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((part) => part.trim().replace(/,$/, ""))
    .filter(Boolean)
    .join(", ");
}

/** Placeholders that sit on their own line; the whole line is removed when empty. */
const OPTIONAL_LINE_PLACEHOLDERS = [
  "organization_address",
  "organization_phone",
  "cn_adjusted",
  "points_earned",
  "points_balance",
  "instagram_link",
  "google_review_link",
  "website_link",
] as const;

/**
 * A bill that redeemed a credit note says so under the Amount line, even in a
 * shop's own template that has no {cn_adjusted}: otherwise the customer reads
 * the full bill amount with no sign of the ₹3,600 CN taken off it.
 */
function withCnAdjustedLine(templateText: string, cnAdjusted: string): string {
  if (!cnAdjusted || /\{cn_adjusted\}/i.test(templateText)) return templateText;
  const lines = templateText.split("\n");
  const amountLine = lines.findIndex((line) => /\{amount\}/i.test(line));
  if (amountLine < 0) return templateText;
  lines.splice(amountLine + 1, 0, "🔁 *CN Adjusted:* {cn_adjusted}");
  return lines.join("\n");
}

/**
 * CRM points under the bill details, even in a shop's own template that has no
 * {points_earned} / {points_balance}: the customer sees what this bill earned.
 */
function withPointsLines(templateText: string, earned: string, balance: string): string {
  if ((!earned && !balance) || /\{points_(earned|balance)\}/i.test(templateText)) return templateText;
  const add = [
    earned ? "🎁 *Points earned:* {points_earned}" : "",
    balance ? "🏆 *Total points:* {points_balance}" : "",
  ].filter(Boolean);
  const lines = templateText.split("\n");
  let at = lines.findIndex((line) => /\{payment_status\}/i.test(line));
  if (at < 0) at = lines.findIndex((line) => /\{amount\}/i.test(line));
  if (at < 0) return `${templateText.trimEnd()}\n\n${add.join("\n")}`;
  lines.splice(at + 1, 0, ...add);
  return lines.join("\n");
}

function dropEmptyPlaceholderLines(message: string, values: Record<string, string>): string {
  let out = message;
  for (const key of OPTIONAL_LINE_PLACEHOLDERS) {
    if (values[key]) continue;
    out = out.replace(new RegExp(`^.*\\{${key}\\}.*(?:\\r?\\n|$)`, "gim"), "");
  }
  return out;
}

function replacePlaceholder(message: string, key: string, value: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return message.replace(new RegExp(`\\{${escaped}\\}`, "gi"), value);
}

/** Case-insensitive placeholder replacement (matches edge whatsappMessageTemplate.ts). */
export function applyWhatsAppTemplatePlaceholders(
  templateText: string,
  saleData: Record<string, unknown>,
  orgName: string,
): string {
  const netAmount = Number(saleData.net_amount ?? saleData.amount ?? 0);
  const paidAmount = Number(saleData.paid_amount ?? 0);
  // Credit note / S/R redeemed on this bill: not paid, but not pending either.
  const cnAdjusted = Math.max(0, Number(saleData.sale_return_adjust ?? 0) || 0);
  const pending = Math.max(0, netAmount - paidAmount - cnAdjusted);
  const outstanding = Number(saleData.outstanding_amount ?? saleData.balance ?? pending);

  const placeholders: Record<string, string> = {
    customer_name: String(saleData.customer_name || "Customer"),
    invoice_number: String(saleData.sale_number || saleData.invoice_number || ""),
    invoice_date: formatDateIn(saleData.sale_date || saleData.invoice_date),
    amount: formatInr(netAmount),
    payment_status: capitalize(String(saleData.payment_status || "Pending")),
    organization_name: String(saleData.organization_name || orgName || ""),
    organization_address: oneLine(saleData.organization_address),
    organization_phone: oneLine(saleData.organization_phone),
    outstanding_amount: formatInr(outstanding),
    paid_amount: formatInr(paidAmount),
    pending_amount: formatInr(pending),
    cn_adjusted: cnAdjusted >= 0.5 ? formatInr(cnAdjusted) : "",
    invoice_link: String(saleData.invoice_link || ""),
    invoice_items: String(saleData.invoice_items || ""),
    customer_page_link: String(saleData.customer_page_link || ""),
    instagram_link: String(saleData.instagram_link || saleData.instagram || ""),
    google_review_link: String(saleData.google_review_link || saleData.google_review || ""),
    website_link: String(saleData.website_link || saleData.website || ""),
    points_earned: pointsText(saleData.points_earned),
    points_balance: pointsText(saleData.points_balance),
  };

  let message = dropEmptyPlaceholderLines(
    withPointsLines(
      withCnAdjustedLine(templateText, placeholders.cn_adjusted),
      placeholders.points_earned,
      placeholders.points_balance,
    ),
    placeholders,
  );
  for (const [key, value] of Object.entries(placeholders)) {
    message = replacePlaceholder(message, key, value);
  }
  return message.trim();
}

/** Same rule as useCustomerPoints.calculatePoints, from settings.sale_settings. */
export function pointsForBillAmount(netAmount: number, saleSettings: Record<string, unknown>): number {
  if (saleSettings.enable_points_system !== true) return 0;
  const minPurchase = Number(saleSettings.min_purchase_for_points ?? 0) || 0;
  if (netAmount < minPurchase) return 0;
  const ratioAmount = Number(saleSettings.points_ratio_amount ?? 100) || 100;
  const perRatio = Number(saleSettings.points_per_ratio ?? 1) || 0;
  const raw = (netAmount / ratioAmount) * perRatio;
  switch (saleSettings.points_rounding ?? "floor") {
    case "floor":
      return Math.floor(raw);
    case "ceil":
      return Math.ceil(raw);
    default:
      return Math.round(raw);
  }
}

/** This bill's points and the customer's balance; null when points are off or no customer. */
async function loadBillPoints(
  saleData: Record<string, unknown>,
  saleSettings: Record<string, unknown>,
): Promise<{ earned: number; balance: number } | null> {
  if (saleSettings.enable_points_system !== true) return null;
  const saleId = String(saleData.sale_id || "");
  if (!saleId) return null;
  try {
    const { data: sale } = await supabase
      .from("sales")
      .select("customer_id, net_amount")
      .eq("id", saleId)
      .maybeSingle();
    const customerId = sale?.customer_id;
    if (!customerId) return null;
    const [{ data: customer }, { data: earnedRow }] = await Promise.all([
      supabase.from("customers").select("points_balance").eq("id", customerId).maybeSingle(),
      supabase
        .from("customer_points_history")
        .select("points")
        .eq("sale_id", saleId)
        .eq("transaction_type", "earned")
        .limit(1)
        .maybeSingle(),
    ]);
    const balanceNow = Number(customer?.points_balance ?? 0) || 0;
    if (earnedRow) return { earned: Number(earnedRow.points) || 0, balance: balanceNow };
    // Points are awarded just after the bill is saved; the message can go out first.
    const earned = pointsForBillAmount(Number(sale?.net_amount ?? saleData.net_amount ?? 0) || 0, saleSettings);
    return { earned, balance: balanceNow + earned };
  } catch {
    return null;
  }
}

/** "@shop" or "instagram.com/shop" → a tappable https link. */
function instagramUrl(value: string): string {
  const v = value.trim();
  if (!v) return "";
  // Instagram addresses are case-insensitive; "HTTPS://WWW.INSTAGRAM.COM/SHOP" reads badly.
  // Only the address part: share links carry a case-sensitive token (?igsh=…, ?stkn=…).
  const lowerPath = (u: string) => u.replace(/^[^?#]*/, (part) => part.toLowerCase());
  if (/^https?:\/\//i.test(v)) return /instagram\.com/i.test(v) ? lowerPath(v) : v;
  if (/instagram\.com\//i.test(v)) return `https://${lowerPath(v.replace(/^\/+/, ""))}`;
  const handle = v.replace(/^@/, "").replace(/\/+$/, "");
  return /^[A-Za-z0-9._]+$/.test(handle) ? `https://instagram.com/${handle}` : "";
}

/** The shop's Google review and Instagram links under the bill links, when set and not already in the text. */
export function appendSocialLinkLines(message: string, googleReviewLink: string, instagram: string): string {
  const lines: string[] = [];
  const google = googleReviewLink.trim();
  if (/^https?:\/\//i.test(google) && !message.includes(google)) lines.push(`📍 Review us on Google: ${google}`);
  const insta = instagramUrl(instagram);
  if (insta && !message.includes(insta) && !message.includes(instagram.trim())) {
    lines.push(`📷 Follow us on Instagram: ${insta}`);
  }
  if (!lines.length) return message;
  const sep = /(View your bill|Review your shopping):/.test(message.split("\n").pop() ?? "") ? "\n" : "\n\n";
  return `${message.trimEnd()}${sep}${lines.join("\n")}`;
}

/**
 * Instagram / website / Google review links for WhatsApp bills. Settings > WhatsApp
 * saves them in whatsapp_api_settings.social_links; Settings > Bill & Barcode saves the
 * same links in settings.bill_barcode_settings. Use whichever the shop filled.
 */
export function mergeShopSocialLinks(
  socialLinks: unknown,
  billBarcodeSettings: unknown,
): { instagram: string; website: string; google_review: string; facebook: string } {
  const social = (socialLinks && typeof socialLinks === "object" ? socialLinks : {}) as Record<string, unknown>;
  const bill = (billBarcodeSettings && typeof billBarcodeSettings === "object" ? billBarcodeSettings : {}) as Record<string, unknown>;
  const pick = (...values: unknown[]) => values.map((v) => String(v ?? "").trim()).find(Boolean) ?? "";
  return {
    instagram: pick(social.instagram, bill.instagram_link),
    website: pick(social.website, bill.website_link),
    google_review: pick(social.google_review, social.google_review_link, bill.google_review_link),
    facebook: pick(social.facebook),
  };
}

/** Load Sales Invoice template from DB and fill placeholders for WappConnect PDF caption. */
export async function buildSalesInvoiceWhatsAppCaption(
  organizationId: string,
  saleData: Record<string, unknown>,
  orgName: string,
): Promise<string> {
  const [{ data: row }, { data: shop }, { data: wa }] = await Promise.all([
    supabase
      .from("whatsapp_templates")
      .select("message_template")
      .eq("organization_id", organizationId)
      .eq("template_type", "sales_invoice")
      .maybeSingle(),
    supabase
      .from("settings")
      .select("business_name, address, mobile_number, sale_settings, bill_barcode_settings")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("whatsapp_api_settings")
      .select("social_links")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  const social = mergeShopSocialLinks(
    (wa as { social_links?: unknown } | null)?.social_links,
    (shop as { bill_barcode_settings?: unknown } | null)?.bill_barcode_settings,
  );
  const saleSettings = ((shop as { sale_settings?: unknown } | null)?.sale_settings ?? {}) as Record<string, unknown>;
  const points = await loadBillPoints(saleData, saleSettings);

  const withShop: Record<string, unknown> = {
    ...saleData,
    organization_name: saleData.organization_name || orgName || shop?.business_name || "",
    organization_address: saleData.organization_address || shop?.address || "",
    organization_phone: saleData.organization_phone || shop?.mobile_number || "",
    instagram_link: saleData.instagram_link || saleData.instagram || social.instagram || "",
    google_review_link: saleData.google_review_link || social.google_review || "",
    website_link: saleData.website_link || social.website || "",
    points_earned: saleData.points_earned ?? points?.earned ?? 0,
    points_balance: saleData.points_balance ?? points?.balance ?? 0,
  };

  const templateText = row?.message_template?.trim() || DEFAULT_SALES_INVOICE;
  const formatted = applyWhatsAppTemplatePlaceholders(templateText, withShop, orgName);
  const message = formatted || applyWhatsAppTemplatePlaceholders(DEFAULT_SALES_INVOICE, withShop, orgName);
  const billLink = String(saleData.customer_page_link || "");
  const googleReview = String(withShop.google_review_link || "");
  const withBillLinks = billLink
    ? appendCustomerPageLinkLine(message, billLink, { billLine: false })
    : appendGoogleReviewLine(message, googleReview);
  return appendSocialLinkLines(withBillLinks, googleReview, String(withShop.instagram_link || ""));
}
