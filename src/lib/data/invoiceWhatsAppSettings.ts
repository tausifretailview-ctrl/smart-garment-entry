import type { QueryClient } from "@tanstack/react-query";
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

/**
 * Same settings through the query cache: every saved bill with a customer phone read them again
 * (one extra request per bill). Fresh for 60 s; the key starts with "whatsapp-api-settings", so a
 * settings save (which invalidates that prefix) is seen at once.
 */
export const invoiceWhatsAppSettingsQueryKey = (orgId: string) => ["whatsapp-api-settings", orgId, "invoice"] as const;
export const INVOICE_WHATSAPP_SETTINGS_FRESH_MS = 60_000;

export function getInvoiceWhatsAppSettings(queryClient: QueryClient, orgId: string) {
  return queryClient.fetchQuery({
    queryKey: invoiceWhatsAppSettingsQueryKey(orgId),
    queryFn: () => fetchInvoiceWhatsAppSettings(orgId),
    staleTime: INVOICE_WHATSAPP_SETTINGS_FRESH_MS,
  });
}
