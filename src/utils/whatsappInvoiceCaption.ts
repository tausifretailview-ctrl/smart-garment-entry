import { supabase } from "@/integrations/supabase/client";

const DEFAULT_SALES_INVOICE = `Hello {customer_name},

Your invoice {invoice_number} is attached.

Date: {invoice_date}
Amount: {amount}
Payment: {payment_status}

Thank you for your business!
{organization_name}`;

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
    payment_status: String(saleData.payment_status || "Pending"),
    organization_name: String(saleData.organization_name || orgName || ""),
    outstanding_amount: formatInr(outstanding),
    paid_amount: formatInr(paidAmount),
    pending_amount: formatInr(netAmount - paidAmount),
    invoice_link: String(saleData.invoice_link || ""),
    invoice_items: String(saleData.invoice_items || ""),
  };

  let message = templateText;
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
  const { data: row } = await supabase
    .from("whatsapp_templates")
    .select("message_template")
    .eq("organization_id", organizationId)
    .eq("template_type", "sales_invoice")
    .maybeSingle();

  const templateText = row?.message_template?.trim() || DEFAULT_SALES_INVOICE;
  const formatted = applyWhatsAppTemplatePlaceholders(templateText, saleData, orgName);
  return formatted || DEFAULT_SALES_INVOICE;
}
