import type { TemplateParam } from "@/hooks/useWhatsAppAPI";

/** 6-param invoice template preset: Customer, Invoice No, Date, Amount, Link, Org Name */
export const DEFAULT_WHATSAPP_INVOICE_TEMPLATE_PARAMS: TemplateParam[] = [
  { index: 1, field: "customer_name", label: "Customer Name" },
  { index: 2, field: "invoice_number", label: "Invoice Number" },
  { index: 3, field: "invoice_date", label: "Invoice Date" },
  { index: 4, field: "amount", label: "Amount" },
  { index: 5, field: "invoice_link", label: "Invoice Link" },
  { index: 6, field: "organization_name", label: "Organization Name" },
];

/** Default third-party WhatsApp API shape for new organizations (WappConnect / Meta proxy). */
export const DEFAULT_WHATSAPP_THIRD_PARTY = {
  api_provider: "third_party" as const,
  custom_api_url: "https://crmapi.wappconnect.com/api/meta",
  api_version: "v21.0",
  business_id: "247325313237950",
  phone_number_id: "997588563431761",
  waba_id: "2393068857780985",
  webhook_verify_token: "lovable_whatsapp_webhook",
  business_name: "",
  use_default_api: false,
  is_active: true,
  auto_send_invoice: true,
  invoice_template_name: "invoice_1",
  invoice_template_params: DEFAULT_WHATSAPP_INVOICE_TEMPLATE_PARAMS,
};
