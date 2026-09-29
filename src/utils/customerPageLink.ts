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

/**
 * New bill only (never on resend / edit): creates one customer link when the shop
 * has Customer page + "Add bill link to WhatsApp" on. Returns "" when off or on any
 * error, so the WhatsApp send always goes ahead unchanged.
 */
export async function createCustomerPageLinkForWhatsApp(
  organizationId: string,
  saleId: string,
): Promise<string> {
  const baseDomain = customerPageBaseDomain();
  if (!baseDomain || !organizationId || !saleId) return "";
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
    if (!settings?.enabled || !settings.add_link_to_whatsapp || !subdomain) return "";

    const { data, error } = await supabase.rpc("create_customer_link", { p_sale_id: saleId });
    const token = !error && data && typeof data === "object" ? (data as { token?: unknown }).token : null;
    if (typeof token !== "string" || !token) return "";
    return buildCustomerPageUrl(subdomain, token, baseDomain);
  } catch {
    return "";
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
