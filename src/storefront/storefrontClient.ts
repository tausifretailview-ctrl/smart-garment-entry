import { createClient } from "@supabase/supabase-js";
import type { PublicStorefrontPayload } from "@/lib/websiteTypes";
import { enrichPublicStorefrontShop, type OrgPublicInfoSlice } from "./storefrontTheme";

const storefrontClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

export async function loadPublicStorefront(slug: string): Promise<PublicStorefrontPayload> {
  const [storeRes, orgRes] = await Promise.all([
    storefrontClient.rpc("get_public_storefront" as never, { p_slug: slug } as never),
    storefrontClient.rpc("get_org_public_info" as never, { p_slug: slug } as never),
  ]);
  if (storeRes.error) throw storeRes.error;
  const data = storeRes.data;
  if (!data || typeof data !== "object") return { published: false };

  const payload = data as PublicStorefrontPayload;
  const orgInfo = (orgRes.error ? null : orgRes.data) as OrgPublicInfoSlice | null;

  if (payload.shop) {
    payload.shop = enrichPublicStorefrontShop(payload.shop, orgInfo);
  }

  return payload;
}

export async function submitStorefrontEnquiry(payload: {
  slug: string;
  customerName: string;
  customerPhone: string;
  message?: string | null;
  productId?: string | null;
}): Promise<{ ok: boolean; error?: string; status?: number }> {
  const { data, error } = await storefrontClient.rpc("submit_public_storefront_enquiry" as never, {
    p_slug: payload.slug,
    p_customer_name: payload.customerName,
    p_customer_phone: payload.customerPhone,
    p_message: payload.message ?? null,
    p_product_id: payload.productId ?? null,
  } as never);

  if (error) {
    return { ok: false, error: error.message || "Could not submit enquiry" };
  }

  const result = data as { ok?: boolean; error?: string; status?: number } | null;
  if (!result || result.ok === false) {
    return {
      ok: false,
      error: result?.error || "Could not submit enquiry",
      status: result?.status,
    };
  }
  return { ok: true };
}
