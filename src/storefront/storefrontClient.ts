import { createClient } from "@supabase/supabase-js";
import type { PublicStorefrontPayload } from "@/lib/websiteTypes";
import { attachSectionsToPublicPayload } from "@/lib/websiteSectionStore";
import { applyWebsiteProductDetails } from "@/lib/websiteProductDetails";
import { enrichPublicStorefrontShop, type OrgPublicInfoSlice } from "./storefrontTheme";
import { offerFromRpc, perksFromRpc, type StorefrontOffer, type StorefrontPerks } from "./ellaPerks";

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

  if (orgInfo?.id && payload.products?.length) {
    payload.products = applyWebsiteProductDetails(
      payload.products,
      await loadWebsiteProductDetails(orgInfo.id),
    );
  }

  return attachSectionsToPublicPayload(payload, orgInfo?.settings);
}

/**
 * Website name + description per listing. Read straight from website_products
 * (anon can select active rows of published stores) so get_public_storefront
 * does not need to change. Any error, including the columns not existing yet,
 * leaves the store on ERP names with no description.
 */
async function loadWebsiteProductDetails(
  orgId: string,
): Promise<Array<{ id: string; display_name: string | null; description: string | null }>> {
  try {
    const { data, error } = await storefrontClient
      .from("website_products" as never)
      .select("id, display_name, description")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .or("display_name.not.is.null,description.not.is.null");
    if (error || !Array.isArray(data)) return [];
    return data as Array<{ id: string; display_name: string | null; description: string | null }>;
  } catch {
    return [];
  }
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

/** Reward points on this mobile at this shop. Null when the lookup is unavailable (SQL not applied, throttled). */
export async function loadShopperPerks(slug: string, phone: string): Promise<StorefrontPerks | null> {
  try {
    const { data, error } = await storefrontClient.rpc("get_public_storefront_customer_perks" as never, {
      p_slug: slug,
      p_phone: phone,
    } as never);
    if (error) return null;
    return perksFromRpc(data);
  } catch {
    return null;
  }
}

export type OfferCodeCheck =
  | { status: "valid"; offer: StorefrontOffer }
  | { status: "invalid" }
  | { status: "unavailable" };

export async function checkShopOfferCode(slug: string, code: string): Promise<OfferCodeCheck> {
  try {
    const { data, error } = await storefrontClient.rpc("check_public_storefront_offer_code" as never, {
      p_slug: slug,
      p_code: code,
    } as never);
    if (error || !data || typeof data !== "object") return { status: "unavailable" };
    const d = data as { ok?: boolean; error?: string };
    if (d.ok !== true) return d.error === "invalid_code" ? { status: "invalid" } : { status: "unavailable" };
    const offer = offerFromRpc(data);
    return offer ? { status: "valid", offer } : { status: "invalid" };
  } catch {
    return { status: "unavailable" };
  }
}
