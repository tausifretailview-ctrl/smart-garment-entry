import { buildPublicInvoiceViewUrl } from "./publicInvoiceLink.ts";

const DEFAULT_SALES_INVOICE = `👋 Hello {customer_name},

🧾 Invoice Generated Successfully

🏢 {organization_name} has generated the following invoice for your order.

🔢 Invoice No: {invoice_number}
📅 Date: {invoice_date}
💰 Invoice Amount: {amount}
⏳ Payment Status: {payment_status}
📊 Outstanding Balance: {outstanding_amount}

🔗 View / Download Invoice:
{invoice_link}

💳 Kindly arrange payment at your convenience.

🙏 Thank you for your continued business with us.`;

/** Map edge template_type → whatsapp_templates.template_type */
export function resolveWhatsAppTemplateDbType(templateType: string): string {
  const t = String(templateType || "").trim().toLowerCase();
  if (t === "sales_invoice" || t === "sales_invoice_pdf" || t === "invoice_pdf") {
    return "sales_invoice";
  }
  if (t === "payment_reminder" || t === "fee_reminder") return "payment_reminder";
  if (t === "quotation") return "quotation";
  if (t === "sale_order") return "sale_order";
  if (t.startsWith("delivery_")) return t;
  if (t === "fee_receipt" || t === "school_fee_receipt") return "school_fee_receipt";
  if (t === "school_fee_reminder") return "school_fee_reminder";
  return t;
}

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

function buildPlaceholderMap(
  saleData: Record<string, unknown>,
  orgName: string,
): Record<string, string> {
  const paidAmount = Number(saleData.paid_amount ?? 0);
  const netAmount = Number(saleData.net_amount ?? saleData.amount ?? 0);
  const pendingAmount = netAmount - paidAmount;
  const outstanding = Number(saleData.outstanding_amount ?? saleData.balance ?? 0);

  const orgSlug = String(saleData.org_slug || "");
  const saleId = String(saleData.sale_id || saleData.id || "");
  const billContext =
    String(saleData.bill_context || saleData.sale_source || "sale") === "pos" ? "pos" : "sale";

  const invoiceLink = orgSlug && saleId
    ? buildPublicInvoiceViewUrl({
      orgSlug,
      saleId,
      billContext,
      saleSettings: {
        invoice_paper_format: saleData.invoice_paper_format,
        sales_bill_format: saleData.sales_bill_format,
        pos_bill_format: saleData.pos_bill_format,
        invoice_template: saleData.invoice_template,
      },
    })
    : String(saleData.invoice_link || "");

  return {
    customer_name: String(saleData.customer_name || "Customer"),
    invoice_number: String(
      saleData.sale_number || saleData.invoice_number || saleData.quotation_number || saleData.order_number || "",
    ),
    quotation_number: String(saleData.quotation_number || ""),
    order_number: String(saleData.order_number || ""),
    invoice_date: formatDateIn(saleData.sale_date || saleData.invoice_date || saleData.quotation_date || saleData.order_date),
    quotation_date: formatDateIn(saleData.quotation_date),
    order_date: formatDateIn(saleData.order_date),
    amount: formatInr(netAmount),
    payment_status: String(saleData.payment_status || "Pending"),
    organization_name: String(saleData.organization_name || orgName || ""),
    outstanding_amount: formatInr(outstanding),
    paid_amount: formatInr(paidAmount),
    pending_amount: formatInr(pendingAmount),
    due_date: formatDateIn(saleData.due_date) || "Not specified",
    invoice_link: invoiceLink,
    invoice_items: String(saleData.invoice_items || ""),
    quotation_items: String(saleData.quotation_items || ""),
    order_items: String(saleData.order_items || ""),
    valid_until: formatDateIn(saleData.valid_until) || "Not specified",
    expected_delivery: formatDateIn(saleData.expected_delivery || saleData.delivery_date) || "To be confirmed",
    status: String(saleData.status || ""),
    website: String(saleData.website || ""),
    website_link: String(saleData.website || saleData.website_link || ""),
    instagram: String(saleData.instagram || ""),
    instagram_link: String(saleData.instagram || saleData.instagram_link || ""),
    facebook: String(saleData.facebook || ""),
    google_review_link: String(saleData.google_review_link || saleData.google_review || ""),
    social_links: String(saleData.social_links || ""),
    salesman: String(saleData.salesman || ""),
    items_count: String(saleData.items_count ?? ""),
  };
}

export function applyWhatsAppTemplatePlaceholders(
  templateText: string,
  saleData: Record<string, unknown>,
  orgName: string,
): string {
  let message = templateText;
  const placeholders = buildPlaceholderMap(saleData, orgName);
  for (const [key, value] of Object.entries(placeholders)) {
    message = replacePlaceholder(message, key, value);
  }
  return message;
}

export async function buildMessageFromWhatsAppTemplate(opts: {
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col2: string, val2: string) => {
            maybeSingle: () => Promise<{ data: { message_template?: string } | null; error: unknown }>;
          };
        };
      };
    };
  };
  organizationId: string;
  templateType: string;
  saleData: Record<string, unknown>;
  orgName: string;
}): Promise<string | null> {
  const dbType = resolveWhatsAppTemplateDbType(opts.templateType);

  const { data: row } = await opts.supabase
    .from("whatsapp_templates")
    .select("message_template")
    .eq("organization_id", opts.organizationId)
    .eq("template_type", dbType)
    .maybeSingle();

  const templateText = row?.message_template?.trim()
    || (dbType === "sales_invoice" ? DEFAULT_SALES_INVOICE : "");

  if (!templateText) return null;

  const formatted = applyWhatsAppTemplatePlaceholders(templateText, opts.saleData, opts.orgName).trim();
  return formatted || null;
}

/** Fallback caption when PDF send has no template text (WappConnect requires a body with file+caption). */
export function buildWappConnectInvoiceFallbackCaption(
  saleData: Record<string, unknown>,
  orgName: string,
): string {
  const customer = String(saleData.customer_name || "Customer");
  const invoiceNo = String(saleData.sale_number || saleData.invoice_number || "invoice");
  const amount = saleData.net_amount ?? saleData.amount ?? 0;
  const amountText = `₹${Number(amount).toLocaleString("en-IN")}`;
  const dateText = formatDateIn(saleData.sale_date || saleData.invoice_date);
  const shop = String(saleData.organization_name || orgName || "Our store");

  return [
    `Hello ${customer},`,
    "",
    `Your invoice ${invoiceNo} is attached.`,
    dateText ? `Date: ${dateText}` : "",
    `Amount: ${amountText}`,
    "",
    "Thank you for your business!",
    shop,
  ].filter(Boolean).join("\n");
}
