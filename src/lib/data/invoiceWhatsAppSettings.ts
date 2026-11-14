import { supabase } from "@/integrations/supabase/client";

/**
 * The WhatsApp settings a saved invoice needs to decide on and send its auto message
 * (Plan Phase 4, D6). Named columns only: Sales Invoice used to read the whole row with
 * `select("*")` on every save, which also sent the shop's WhatsApp access token and webhook
 * token to the browser although nothing used them. POS already read named columns.
 */
export const INVOICE_WHATSAPP_COLUMNS =
  "is_active, auto_send_invoice, send_provider, invoice_template_name, auto_send_invoice_link, invoice_link_message, social_links, send_invoice_pdf, invoice_pdf_template, use_document_header_template, invoice_document_template_name, pdf_min_amount, wappconnect_pdf_invoice_template";

/** The shop's invoice WhatsApp settings, or null when none are saved. Throws on a failed read. */
export async function fetchInvoiceWhatsAppSettings(orgId: string) {
  const { data, error } = await supabase
    .from("whatsapp_api_settings")
    .select(INVOICE_WHATSAPP_COLUMNS)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
