import { supabase } from "@/integrations/supabase/client";
import { appendCustomerPageLinkLine } from "@/utils/customerPageLink";

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

function formatInr(value: unknown): string {
  const num = Number(value ?? 0);
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
const OPTIONAL_LINE_PLACEHOLDERS = ["organization_address", "organization_phone"] as const;

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
  const outstanding = Number(saleData.outstanding_amount ?? saleData.balance ?? netAmount - paidAmount);

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
    pending_amount: formatInr(netAmount - paidAmount),
    invoice_link: String(saleData.invoice_link || ""),
    invoice_items: String(saleData.invoice_items || ""),
    customer_page_link: String(saleData.customer_page_link || ""),
  };

  let message = dropEmptyPlaceholderLines(templateText, placeholders);
  for (const [key, value] of Object.entries(placeholders)) {
    message = replacePlaceholder(message, key, value);
  }
  return message.trim();
}

/** Load Sales Invoice template from DB and fill placeholders for WappConnect PDF caption. */
export async function buildSalesInvoiceWhatsAppCaption(
  organizationId: string,
  saleData: Record<string, unknown>,
  orgName: string,
): Promise<string> {
  const [{ data: row }, { data: shop }] = await Promise.all([
    supabase
      .from("whatsapp_templates")
      .select("message_template")
      .eq("organization_id", organizationId)
      .eq("template_type", "sales_invoice")
      .maybeSingle(),
    supabase
      .from("settings")
      .select("business_name, address, mobile_number")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  const withShop: Record<string, unknown> = {
    ...saleData,
    organization_name: saleData.organization_name || orgName || shop?.business_name || "",
    organization_address: saleData.organization_address || shop?.address || "",
    organization_phone: saleData.organization_phone || shop?.mobile_number || "",
  };

  const templateText = row?.message_template?.trim() || DEFAULT_SALES_INVOICE;
  const formatted = applyWhatsAppTemplatePlaceholders(templateText, withShop, orgName);
  return appendCustomerPageLinkLine(
    formatted || applyWhatsAppTemplatePlaceholders(DEFAULT_SALES_INVOICE, withShop, orgName),
    String(saleData.customer_page_link || ""),
  );
}
