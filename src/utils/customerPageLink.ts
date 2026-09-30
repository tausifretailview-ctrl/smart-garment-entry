import { supabase } from "@/integrations/supabase/client";

/**
 * Customer app host suffix, e.g. "ezzy.shop" → https://<shop>.ezzy.shop/t/<token>.
 * Unset = no customer links are created (the feature stays off everywhere).
 */
export function customerPageBaseDomain(): string {
  const raw = (import.meta.env.VITE_CUSTOMER_PAGE_DOMAIN as string | undefined) ?? "";
  return raw.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
}

export function buildCustomerPageUrl(subdomain: string, token: string, baseDomain: string): string {
  return `https://${subdomain.trim().toLowerCase()}.${baseDomain}/t/${encodeURIComponent(token)}`;
}

export type CustomerPageLinkFailure =
  | "no_domain"
  | "page_off"
  | "whatsapp_switch_off"
  | "no_subdomain"
  | "rpc_failed";

export type CustomerPageLinkResult =
  | { ok: true; url: string }
  | { ok: false; reason: CustomerPageLinkFailure; detail?: string };

async function buildCustomerPageLink(
  organizationId: string,
  saleId: string,
  requireWhatsAppSwitch: boolean,
): Promise<CustomerPageLinkResult> {
  const baseDomain = customerPageBaseDomain();
  if (!baseDomain) return { ok: false, reason: "no_domain" };
  if (!organizationId || !saleId) return { ok: false, reason: "rpc_failed" };
  try {
    const [settingsRes, orgRes] = await Promise.all([
      supabase
        .from("customer_page_settings")
        .select("enabled, add_link_to_whatsapp")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase.from("organizations").select("public_subdomain").eq("id", organizationId).maybeSingle(),
    ]);
    const settings = settingsRes.data;
    const subdomain = orgRes.data?.public_subdomain?.trim();
    if (!settings?.enabled) return { ok: false, reason: "page_off" };
    if (requireWhatsAppSwitch && !settings.add_link_to_whatsapp) return { ok: false, reason: "whatsapp_switch_off" };
    if (!subdomain) return { ok: false, reason: "no_subdomain" };

    const { data, error } = await supabase.rpc("create_customer_link", { p_sale_id: saleId });
    const token = !error && data && typeof data === "object" ? (data as { token?: unknown }).token : null;
    if (typeof token !== "string" || !token) return { ok: false, reason: "rpc_failed", detail: error?.message };
    return { ok: true, url: buildCustomerPageUrl(subdomain, token, baseDomain) };
  } catch (err) {
    return { ok: false, reason: "rpc_failed", detail: err instanceof Error ? err.message : undefined };
  }
}

/**
 * Link for a WhatsApp message: only when the shop has Customer page + "Add bill link to
 * WhatsApp" on. Returns "" when off or on any error, so the WhatsApp send always goes
 * ahead unchanged. Each call creates one customer link (new bill or a manual send).
 */
export async function createCustomerPageLinkForWhatsApp(
  organizationId: string,
  saleId: string,
): Promise<string> {
  const result = await buildCustomerPageLink(organizationId, saleId, true);
  return result.ok ? result.url : "";
}

/**
 * Explicit "give me this bill's customer link" (copy button). Needs only Customer page
 * on, not the WhatsApp switch, and says why when it cannot make one.
 */
export function createCustomerPageLinkForSale(
  organizationId: string,
  saleId: string,
): Promise<CustomerPageLinkResult> {
  return buildCustomerPageLink(organizationId, saleId, false);
}

export function customerPageLinkFailureMessage(result: Extract<CustomerPageLinkResult, { ok: false }>): string {
  switch (result.reason) {
    case "no_domain":
      return "The customer page web address is not set in the app. Add VITE_CUSTOMER_PAGE_DOMAIN to the ERP project in Vercel and redeploy.";
    case "page_off":
      return "Customer page is off. Turn it on in Settings → WhatsApp → Customer page.";
    case "whatsapp_switch_off":
      return "Add bill link to WhatsApp message is off in Settings → WhatsApp → Customer page.";
    case "no_subdomain":
      return "This shop has no customer page web address yet. Contact support to activate it.";
    default:
      return /mobile/i.test(result.detail ?? "")
        ? "This bill has no valid 10-digit mobile number, so a customer link cannot be made."
        : "Could not create the link. Please try again.";
  }
}

/**
 * Caption text: fill {customer_page_link}; when the shop's template has no such
 * placeholder, add the link as a last line so turning the switch on is enough.
 */
export function appendCustomerPageLinkLine(message: string, link: string): string {
  if (!link || message.includes(link)) return message;
  return `${message.trimEnd()}\n\nView your bill: ${link}`;
}
